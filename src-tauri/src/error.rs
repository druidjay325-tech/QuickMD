use serde::{Deserialize, Serialize};
#[derive(Debug, Serialize)]
pub struct ApiError {
    pub code: String,
    pub detail: Option<String>,
    pub cause: Option<Box<ApiError>>,
}
#[derive(Deserialize)]
struct Rule {
    prefix: String,
    code: String,
}
impl From<String> for ApiError {
    fn from(message: String) -> Self {
        if let Some((cause, detail)) = message.split_once("；标签索引恢复失败：") {
            return Self {
                code: "errors.couldNotRestoreTheTagIndex".into(),
                detail: Some(detail.into()),
                cause: Some(Box::new(Self::from(cause.to_string()))),
            };
        }
        let rules: Vec<Rule> =
            serde_json::from_str(include_str!("../../src/locales/native-errors.json"))
                .expect("bundled error rules");
        for rule in rules {
            if let Some(detail) = message.strip_prefix(&rule.prefix) {
                let cleaned = detail.replace(
                    "。需要 Windows App Runtime 2.5.1 x64 或更新的 2.5 运行库。",
                    "",
                );
                let detail = cleaned.trim_start_matches(['：', ':', ' ']).trim();
                return Self {
                    code: rule.code,
                    detail: if detail.is_empty() {
                        None
                    } else {
                        Some(detail.into())
                    },
                    cause: None,
                };
            }
        }
        Self {
            code: "errors.system".into(),
            detail: Some(message),
            cause: None,
        }
    }
}
impl ApiError {
    pub fn message(&self, locale: &str) -> String {
        let json = if locale == "zh-CN" {
            include_str!("../../src/locales/zh-CN.json")
        } else {
            include_str!("../../src/locales/en.json")
        };
        let catalogue: serde_json::Value =
            serde_json::from_str(json).expect("bundled translations");
        let summary = catalogue[&self.code]
            .as_str()
            .unwrap_or("QuickMD operation failed");
        let mut parts = vec![summary.to_string()];
        if let Some(cause) = &self.cause {
            parts.push(cause.message(locale));
        }
        if let Some(detail) = &self.detail {
            parts.push(detail.clone());
        }
        parts.join(": ")
    }
}
pub fn startup(message: String) -> std::io::Error {
    let locale = crate::locale::state()
        .map(|state| state.locale)
        .unwrap_or_else(|_| crate::locale::system_locale());
    std::io::Error::other(ApiError::from(message).message(&locale))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_secondary_failure_is_localized_without_losing_its_cause() {
        let error = ApiError::from(
            "无法移入系统回收站：access denied；标签索引恢复失败：read only".to_string(),
        );
        let english = error.message("en");
        assert!(english.contains("Could not restore the tag index"));
        assert!(english.contains("access denied"));
        assert!(english.contains("read only"));
        assert!(!english.contains("回收站"));
    }
    #[test]
    fn structured_errors_keep_codes_and_diagnostics() {
        let error = ApiError::from("写入失败，原内容已保留：disk full".to_string());
        assert!(error.code.starts_with("errors.couldNotWrite"));
        assert_eq!(error.detail.as_deref(), Some("disk full"));
        assert!(error.message("en").contains("original content"));
        assert_eq!(
            ApiError::from("NOT_FOUND".to_string()).code,
            "errors.notFound"
        );
    }
}
