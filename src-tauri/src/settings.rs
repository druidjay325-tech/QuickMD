use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};
pub struct ShortcutState(pub Mutex<Option<String>>);
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub autostart: bool,
    #[serde(default = "default_shortcut")]
    pub shortcut: String,
    #[serde(default)]
    pub custom_dir: Option<String>,
    #[serde(default = "default_auto_save")]
    pub auto_save: bool,
}
fn default_shortcut() -> String {
    "Alt+Q".into()
}
fn default_auto_save() -> bool {
    true
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            autostart: false,
            shortcut: default_shortcut(),
            custom_dir: None,
            auto_save: true,
        }
    }
}
fn settings_path() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("QUICKMD_DATA_DIR") {
        return Ok(PathBuf::from(p).join(".config/settings.json"));
    }
    dirs::config_dir()
        .map(|p| p.join("QuickMD/settings.json"))
        .ok_or("无法定位配置目录".into())
}
pub(crate) fn try_load_settings() -> Result<Settings, String> {
    match std::fs::read(settings_path()?) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|e| format!("配置损坏，请恢复备份；原文件未改动：{e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
        Err(e) => Err(e.to_string()),
    }
}
pub(crate) fn save_settings_internal(s: &Settings) -> Result<(), String> {
    crate::storage::atomic_write(
        &settings_path()?,
        &serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?,
    )
}
pub fn register_shortcut(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let app_handle = app.clone();
    app.global_shortcut()
        .on_shortcut(key, move |_, _, event| {
            if event.state != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                return;
            }
            if let Some(w) = app_handle.get_webview_window("float") {
                if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) {
                    let _ = w.emit("quickmd:float-close-requested", ());
                } else {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .map_err(|e| format!("快捷键不可用，原快捷键已保留：{e}"))
}
#[tauri::command]
pub async fn get_settings() -> Result<Settings, String> {
    tauri::async_runtime::spawn_blocking(try_load_settings)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn save_app_settings(
    app: tauri::AppHandle,
    autostart: bool,
    shortcut: String,
    auto_save: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_autostart::ManagerExt;
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let _guard = crate::STORAGE_LOCK.lock().map_err(|e| e.to_string())?;
        let old = try_load_settings()?;
        let changed = old.shortcut != shortcut;
        if changed {
            register_shortcut(&app, &shortcut)?;
        }
        let autostart_changed = old.autostart != autostart;
        if autostart_changed {
            let result = if autostart {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            };
            if let Err(e) = result {
                if changed {
                    let _ = app.global_shortcut().unregister(shortcut.as_str());
                }
                return Err(format!("自启动设置失败：{e}"));
            }
        }
        let mut next = old.clone();
        next.autostart = autostart;
        next.shortcut = shortcut.clone();
        next.auto_save = auto_save;
        if let Err(e) = save_settings_internal(&next) {
            if changed {
                let _ = app.global_shortcut().unregister(shortcut.as_str());
            }
            if autostart_changed {
                let _ = if old.autostart {
                    app.autolaunch().enable()
                } else {
                    app.autolaunch().disable()
                };
            }
            return Err(e);
        }
        if changed {
            let _ = app.global_shortcut().unregister(old.shortcut.as_str());
        }
        *app.state::<ShortcutState>()
            .0
            .lock()
            .map_err(|e| e.to_string())? = Some(shortcut);
        app.emit("quickmd:settings-changed", ())
            .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
