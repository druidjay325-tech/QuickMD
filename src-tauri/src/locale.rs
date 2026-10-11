use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{Emitter, Manager};
static REVISION: AtomicU64 = AtomicU64::new(0);
#[derive(Clone, Serialize)]
pub struct LocaleState {
    pub preference: String,
    pub locale: String,
    pub revision: u64,
    pub diagnostics: bool,
}
pub struct LocaleMenus {
    pub main: tauri::menu::MenuItem<tauri::Wry>,
    pub float: tauri::menu::MenuItem<tauri::Wry>,
    pub settings: tauri::menu::MenuItem<tauri::Wry>,
    pub quit: tauri::menu::MenuItem<tauri::Wry>,
}
pub fn system_locale() -> String {
    if std::env::var_os("QUICKMD_DATA_DIR").is_some() {
        if let Ok(value) = std::env::var("QUICKMD_SYSTEM_LOCALE") {
            return resolve("system", &value).into();
        }
    }
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn GetUserDefaultUILanguage() -> u16;
        }
        if unsafe { GetUserDefaultUILanguage() } & 0x3ff == 4 {
            "zh-CN".into()
        } else {
            "en".into()
        }
    }
    #[cfg(not(windows))]
    {
        resolve("system", &std::env::var("LANG").unwrap_or_default()).into()
    }
}
pub fn resolve<'a>(preference: &'a str, system: &str) -> &'a str {
    match preference {
        "zh-CN" => "zh-CN",
        "en" => "en",
        _ if system.to_ascii_lowercase().starts_with("zh") => "zh-CN",
        _ => "en",
    }
}
pub fn state() -> Result<LocaleState, String> {
    let preference = crate::settings::try_load_settings()?.locale;
    let locale = resolve(&preference, &system_locale()).to_string();
    Ok(LocaleState {
        preference,
        locale,
        revision: REVISION.load(Ordering::SeqCst),
        diagnostics: std::env::var("QUICKMD_SMOKE_CHECK").as_deref() == Ok("1")
            && std::env::var_os("QUICKMD_DATA_DIR").is_some(),
    })
}
pub fn text<'a>(locale: &str, zh: &'a str, en: &'a str) -> &'a str {
    if locale == "zh-CN" {
        zh
    } else {
        en
    }
}
pub fn title(locale: &str) -> &str {
    text(locale, "QuickMD - 闪念便利贴", "QuickMD - Quick notes")
}
pub fn get_locale_inner() -> Result<LocaleState, String> {
    state()
}
pub async fn set_locale_inner(
    app: tauri::AppHandle,
    locale: String,
) -> Result<LocaleState, String> {
    if !matches!(locale.as_str(), "system" | "zh-CN" | "en") {
        return Err("不支持此界面语言".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = crate::STORAGE_LOCK.lock().map_err(|e| e.to_string())?;
        let mut next = crate::settings::try_load_settings()?;
        next.locale = locale;
        crate::settings::save_settings_internal(&next)?;
        let revision = REVISION.fetch_add(1, Ordering::SeqCst) + 1;
        let current = LocaleState {
            preference: next.locale.clone(),
            locale: resolve(&next.locale, &system_locale()).into(),
            revision,
            diagnostics: std::env::var("QUICKMD_SMOKE_CHECK").as_deref() == Ok("1")
                && std::env::var_os("QUICKMD_DATA_DIR").is_some(),
        };
        let update = current.clone();
        let handle = app.clone();
        let (send, receive) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = send.send(refresh_native(&handle, &update));
        })
        .map_err(|e| e.to_string())?;
        receive.recv().map_err(|e| e.to_string())??;
        app.emit("quickmd:locale-changed", &current)
            .map_err(|e| e.to_string())?;
        Ok(current)
    })
    .await
    .map_err(|e| e.to_string())?
}
pub fn refresh_native(app: &tauri::AppHandle, state: &LocaleState) -> Result<(), String> {
    if let Some(menu) = app.try_state::<LocaleMenus>() {
        for (item, zh, en) in [
            (&menu.main, "显示主窗口", "Open library"),
            (&menu.float, "显示便利贴", "Open scratchpad"),
            (&menu.settings, "设置", "Settings"),
            (&menu.quit, "退出 QuickMD", "Quit QuickMD"),
        ] {
            item.set_text(text(&state.locale, zh, en))
                .map_err(|e| e.to_string())?;
        }
    }
    if let Some(tray) = app.tray_by_id("quickmd-tray") {
        tray.set_tooltip(Some(title(&state.locale)))
            .map_err(|e| e.to_string())?;
    }
    if let Some(window) = app.get_webview_window("float") {
        window
            .set_title(title(&state.locale))
            .map_err(|e| e.to_string())?;
    }
    if state.diagnostics {
        let report = serde_json::json!({"preference":state.preference,"locale":state.locale,"revision":state.revision,"main":text(&state.locale,"显示主窗口","Open library"),"float":text(&state.locale,"显示便利贴","Open scratchpad"),"settings":text(&state.locale,"设置","Settings"),"quit":text(&state.locale,"退出 QuickMD","Quit QuickMD")});
        crate::storage::atomic_write(
            &crate::data_root()?.join(".runtime/locale-native.json"),
            &serde_json::to_vec(&report).map_err(|e| e.to_string())?,
        )?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn language_resolution_and_legacy_settings() {
        assert_eq!(resolve("system", "zh-Hans-CN"), "zh-CN");
        assert_eq!(resolve("system", "fr-FR"), "en");
        assert_eq!(resolve("en", "zh-CN"), "en");
        let old: crate::settings::Settings =
            serde_json::from_str(r#"{"shortcut":"Alt+Q"}"#).unwrap();
        assert_eq!(old.locale, "system");
        assert_eq!(crate::settings::Settings::default().locale, "system");
    }
}

#[tauri::command]
pub fn get_locale() -> Result<LocaleState, crate::error::ApiError> {
    get_locale_inner().map_err(crate::error::ApiError::from)
}

#[tauri::command]
pub async fn set_locale(
    app: tauri::AppHandle,
    locale: String,
) -> Result<LocaleState, crate::error::ApiError> {
    set_locale_inner(app, locale)
        .await
        .map_err(crate::error::ApiError::from)
}
