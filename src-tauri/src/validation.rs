// Explicit debug-only native integration regression. Never runs against a
// normal profile, and never exists in the release executable.
use tauri::{AppHandle, Manager};
pub fn start(app: &AppHandle) {
    if std::env::var("QUICKMD_SMOKE_SCENARIO").as_deref() != Ok("locale")
        || std::env::var("QUICKMD_SMOKE_CHECK").as_deref() != Ok("1")
        || std::env::var_os("QUICKMD_DATA_DIR").is_none()
    {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run(&app).await;
        let report = match result {
            Ok(steps) => serde_json::json!({"status":"passed","steps":steps,"notesUnchanged":true}),
            Err(error) => serde_json::json!({"status":"failed","error":error}),
        };
        if let Ok(root) = crate::data_root() {
            let _ = crate::storage::atomic_write(
                &root.join(".runtime/locale-validation.json"),
                &serde_json::to_vec(&report).unwrap(),
            );
        }
    });
}
async fn wait_ui(locale: &str) -> Result<serde_json::Value, String> {
    let root = crate::data_root()?;
    let expected = locale.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        loop {
            let reports: Option<Vec<serde_json::Value>> = ["main", "float"]
                .iter()
                .map(|label| {
                    std::fs::read(root.join(format!(".runtime/ui-{label}.json")))
                        .ok()
                        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
                })
                .collect();
            if let Some(reports) = reports {
                let settings = if expected == "en" {
                    "Settings"
                } else {
                    "设置"
                };
                if reports.iter().enumerate().all(|(index, report)| {
                    let control = if index == 0 {
                        settings
                    } else if expected == "en" {
                        "Open library"
                    } else {
                        "打开主窗"
                    };
                    report["locale"].as_str() == Some(&expected)
                        && report["controls"].as_array().is_some_and(|controls| {
                            controls.iter().any(|value| value.as_str() == Some(control))
                        })
                }) {
                    return Ok(serde_json::json!(reports));
                }
            }
            if std::time::Instant::now() >= deadline {
                return Err(format!("Both native webviews did not report {expected}"));
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
async fn run(app: &AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let first = crate::locale::state()?;
    let initial = wait_ui(&first.locale).await?;
    let store = crate::current_store()?;
    store.create("Untouched.md", "# Original\n\n用户原文 / **unchanged**")?;
    let before: Vec<_> = store
        .list()?
        .iter()
        .map(|note| {
            Ok((
                note.file_name.clone(),
                std::fs::read(store.path(&note.file_name)?).map_err(|e| e.to_string())?,
            ))
        })
        .collect::<Result<_, String>>()?;
    let mut steps =
        vec![serde_json::json!({"preference":first.preference,"locale":first.locale,"ui":initial})];
    for preference in ["zh-CN", "en", "system"] {
        let state = crate::locale::set_locale(app.clone(), preference.into())
            .await
            .map_err(|e| format!("set_locale({preference}): {}", e.message("en")))?;
        let ui = wait_ui(&state.locale).await?;
        let menus = app.state::<crate::locale::LocaleMenus>();
        let actual = menus.settings.text().map_err(|e| e.to_string())?;
        let expected = crate::locale::text(&state.locale, "设置", "Settings");
        if actual != expected {
            return Err("Native tray did not change language".into());
        }
        let old = crate::settings::try_load_settings()?;
        crate::settings::save_app_settings(
            app.clone(),
            old.autostart,
            old.shortcut,
            !old.auto_save,
        )
        .await
        .map_err(|e| format!("save_app_settings({preference}): {}", e.message("en")))?;
        if crate::settings::try_load_settings()?.locale != preference {
            return Err("Another settings update overwrote the language".into());
        }
        for (name, bytes) in &before {
            if std::fs::read(store.path(name)?).map_err(|e| e.to_string())? != *bytes {
                return Err("Changing language modified a note".into());
            }
        }
        if store.list()?.len() != before.len() {
            return Err("Changing language added or renamed initial documents".into());
        }
        steps.push(serde_json::json!({"preference":preference,"locale":state.locale,"ui":ui,"traySettings":actual,"localePreservedAfterSettingsSave":true}));
    }
    Ok(steps)
}
