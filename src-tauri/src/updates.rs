use crate::error::ApiError;
use serde::{Deserialize, Serialize};
use std::io::Read;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionCheck {
    pub status: &'static str,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub release_url: Option<String>,
}
#[derive(Deserialize)]
struct Project {
    repository: String,
}
fn repository() -> String {
    serde_json::from_str::<Project>(include_str!("../../src/projectInfo.json"))
        .expect("project metadata")
        .repository
}
fn failure(code: &str, detail: Option<String>) -> ApiError {
    ApiError {
        code: code.into(),
        detail,
        cause: None,
    }
}
fn release_endpoint(repository: &str) -> Result<reqwest::Url, ApiError> {
    let url = reqwest::Url::parse(repository)
        .map_err(|e| failure("about.invalidRepository", Some(e.to_string())))?;
    let parts: Vec<_> = url
        .path_segments()
        .ok_or_else(|| failure("about.invalidRepository", None))?
        .filter(|part| !part.is_empty())
        .collect();
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url.username().is_empty()
        || url.password().is_some()
        || parts.len() != 2
        || parts.iter().any(|part| {
            !part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
        })
    {
        return Err(failure("about.invalidRepository", None));
    }
    reqwest::Url::parse(&format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        parts[0], parts[1]
    ))
    .map_err(|e| failure("about.invalidRepository", Some(e.to_string())))
}
#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
}
fn parse_release(current: &str, repository: &str, bytes: &[u8]) -> Result<VersionCheck, ApiError> {
    let release: Release = serde_json::from_slice(bytes)
        .map_err(|e| failure("about.invalidResponse", Some(e.to_string())))?;
    let version = semver::Version::parse(
        release
            .tag_name
            .strip_prefix('v')
            .unwrap_or(&release.tag_name),
    )
    .map_err(|e| failure("about.invalidVersion", Some(e.to_string())))?;
    if release.draft || release.prerelease || !version.pre.is_empty() {
        return Err(failure("about.invalidResponse", None));
    }
    let current_version = semver::Version::parse(current)
        .map_err(|e| failure("about.invalidVersion", Some(e.to_string())))?;
    let status = if version.cmp_precedence(&current_version).is_gt() {
        "update-available"
    } else if version.cmp_precedence(&current_version).is_eq() {
        "up-to-date"
    } else {
        "ahead"
    };
    let mut release_url = reqwest::Url::parse(repository)
        .map_err(|e| failure("about.invalidRepository", Some(e.to_string())))?;
    release_url
        .path_segments_mut()
        .map_err(|_| failure("about.invalidRepository", None))?
        .pop_if_empty()
        .push("releases")
        .push("tag")
        .push(&release.tag_name);
    Ok(VersionCheck {
        status,
        current_version: current.into(),
        latest_version: Some(version.to_string()),
        release_url: Some(release_url.into()),
    })
}
fn request_error(error: reqwest::Error) -> ApiError {
    failure(
        if error.is_timeout() {
            "about.updateTimeout"
        } else {
            "about.updateNetwork"
        },
        Some(error.to_string()),
    )
}
pub fn check() -> Result<VersionCheck, ApiError> {
    let repository = repository();
    let client = reqwest::blocking::Client::builder()
        .user_agent(concat!("QuickMD/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(request_error)?;
    let response = client
        .get(release_endpoint(&repository)?)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2026-03-10")
        .send()
        .map_err(request_error)?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(VersionCheck {
            status: "no-release",
            current_version: env!("CARGO_PKG_VERSION").into(),
            latest_version: None,
            release_url: Some(format!("{repository}/releases")),
        });
    }
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS
        || (response.status() == reqwest::StatusCode::FORBIDDEN
            && (response
                .headers()
                .get("x-ratelimit-remaining")
                .is_some_and(|value| value == "0")
                || response.headers().contains_key("retry-after")))
    {
        return Err(failure("about.updateRateLimited", None));
    }
    if !response.status().is_success() {
        return Err(failure(
            "about.updateServer",
            Some(response.status().to_string()),
        ));
    }
    let mut bytes = Vec::new();
    response
        .take(256 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| failure("about.updateNetwork", Some(e.to_string())))?;
    if bytes.len() > 256 * 1024 {
        return Err(failure("about.invalidResponse", None));
    }
    parse_release(env!("CARGO_PKG_VERSION"), &repository, &bytes)
}
#[tauri::command]
pub async fn check_version_update() -> Result<VersionCheck, ApiError> {
    tauri::async_runtime::spawn_blocking(check)
        .await
        .map_err(|e| failure("about.updateFailed", Some(e.to_string())))?
}

fn valid_project_link(url: &str) -> bool {
    reqwest::Url::parse(url).is_ok_and(|url| {
        url.username().is_empty()
            && url.password().is_none()
            && match url.scheme() {
                "https" => url.host_str().is_some(),
                "mailto" => url.path().contains('@'),
                _ => false,
            }
    })
}
#[tauri::command]
pub fn open_project_link(app: tauri::AppHandle, url: String) -> Result<(), ApiError> {
    use tauri_plugin_opener::OpenerExt;
    if !valid_project_link(&url) {
        return Err(failure("about.invalidLink", None));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| failure("about.linkFailed", Some(e.to_string())))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compares_real_versions_and_ignores_build_metadata() {
        for (tag, status) in [
            ("v0.7.2", "update-available"),
            ("v0.7.1", "up-to-date"),
            ("v0.7.0", "ahead"),
            ("v0.7.1+build.7", "up-to-date"),
            ("v0.10.0", "update-available"),
        ] {
            let json = serde_json::json!({"tag_name":tag,"draft":false,"prerelease":false});
            let result =
                parse_release("0.7.1", &repository(), &serde_json::to_vec(&json).unwrap()).unwrap();
            assert_eq!(result.status, status);
            assert!(result
                .release_url
                .unwrap()
                .starts_with("https://github.com/druidjay325-tech/QuickMD/releases/tag/"));
        }
    }
    #[test]
    fn rejects_nonstable_releases_and_unsafe_links() {
        for (tag, draft, prerelease) in [
            ("v0.8.0-rc.1", false, false),
            ("v0.8.0", true, false),
            ("not-version", false, false),
            ("v0.8.0", false, true),
        ] {
            assert!(parse_release(
                "0.7.1",
                &repository(),
                &serde_json::to_vec(
                    &serde_json::json!({"tag_name":tag,"draft":draft,"prerelease":prerelease})
                )
                .unwrap()
            )
            .is_err());
        }
        for url in [
            "file:///C:/secret",
            "javascript:alert(1)",
            "https://evil@github.com/a/b",
        ] {
            assert!(!valid_project_link(url));
        }
        assert!(valid_project_link("mailto:author@example.com"));
        assert!(valid_project_link("https://example.com/support"));
        assert!(release_endpoint("https://evil.test/a/b").is_err());
    }
    #[test]
    #[ignore = "Explicit public GitHub request, no user data or authentication"]
    fn live_public_release_endpoint() {
        let result = check().unwrap();
        println!("{}", serde_json::to_string(&result).unwrap());
    }
}
