use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};
mod acrylic;
mod recycle;
mod settings;
mod storage;
use settings::ShortcutState;
use storage::{NoteInfo, Store, Tags};
#[tauri::command]
async fn runtime_ready(window: tauri::WebviewWindow) -> Result<(), String> {
    if std::env::var("QUICKMD_SMOKE_CHECK").as_deref() != Ok("1")
        || std::env::var("QUICKMD_DATA_DIR").is_err()
    {
        return Ok(());
    }
    let root = data_root()?;
    let label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        storage::atomic_write(
            &root.join(".runtime").join(format!("{label}.ready")),
            env!("CARGO_PKG_VERSION").as_bytes(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
static STORAGE_LOCK: Mutex<()> = Mutex::new(());
struct InstanceLock(#[allow(dead_code)] std::fs::File);
#[derive(Default)]
struct ExitState {
    approved: AtomicBool,
}

fn data_root() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("QUICKMD_DATA_DIR") {
        let p = PathBuf::from(p);
        if !p.is_absolute() {
            return Err("隔离目录必须为绝对路径".into());
        }
        return Ok(p);
    }
    dirs::home_dir()
        .map(|p| p.join("QuickMD"))
        .ok_or("无法定位用户数据目录".into())
}
fn current_store() -> Result<Store, String> {
    let root = data_root()?;
    let settings = settings::try_load_settings()?;
    let notes = match settings.custom_dir {
        Some(p) => PathBuf::from(p).join("flashthoughts"),
        None => {
            let current = root.join("flashthoughts");
            if !current.exists() && root.join("notes").is_dir() {
                root.join("notes")
            } else {
                current
            }
        }
    };
    Ok(Store::new(notes, root))
}
async fn with_store<T: Send + 'static>(
    f: impl FnOnce(Store) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = STORAGE_LOCK
            .lock()
            .map_err(|_| "存储操作未完成，请重启后恢复".to_string())?;
        f(current_store()?)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn get_flashthoughts_dir_path() -> Result<String, String> {
    with_store(|s| Ok(s.notes.to_string_lossy().into())).await
}
#[tauri::command]
async fn save_note(
    file_path: String,
    content: String,
    expected_content: Option<String>,
) -> Result<(), String> {
    with_store(move |s| match expected_content {
        Some(previous) => s.save_checked(&file_path, &content, &previous),
        None => s.save(&file_path, &content),
    })
    .await
}
#[tauri::command]
async fn create_note(file_name: String, content: String) -> Result<String, String> {
    with_store(move |s| s.create(&file_name, &content)).await
}
#[tauri::command]
async fn load_note(file_path: String) -> Result<String, String> {
    with_store(move |s| s.load(&file_path)).await
}
#[tauri::command]
async fn list_notes() -> Result<Vec<NoteInfo>, String> {
    with_store(|s| s.list()).await
}
#[tauri::command]
async fn search_notes(query: String) -> Result<Vec<storage::SearchHit>, String> {
    with_store(move |s| s.search(&query)).await
}
#[tauri::command]
async fn delete_note(file_name: String) -> Result<(), String> {
    with_store(move |s| s.delete(&file_name)).await
}
#[tauri::command]
async fn rename_note(old_name: String, new_name: String) -> Result<(), String> {
    with_store(move |s| s.rename(&old_name, &new_name)).await
}
#[tauri::command]
async fn get_all_tags() -> Result<Tags, String> {
    with_store(|s| s.tags()).await
}
#[tauri::command]
async fn set_tags(file_name: String, tags: Vec<String>) -> Result<(), String> {
    with_store(move |s| s.set_tags(&file_name, tags)).await
}
#[tauri::command]
async fn inspect_buffer() -> Result<Option<String>, String> {
    with_store(|s| s.buffer()).await
}
#[tauri::command]
async fn save_buffer(content: String, expected_content: Option<String>) -> Result<(), String> {
    with_store(move |s| match expected_content {
        Some(previous) => s.save_buffer_checked(&content, &previous),
        None => s.save_buffer(&content),
    })
    .await
}
#[tauri::command]
async fn clear_buffer() -> Result<(), String> {
    with_store(|s| s.save_buffer("")).await
}
#[tauri::command]
async fn archive_buffer(title: String) -> Result<String, String> {
    with_store(move |s| s.archive(&title)).await
}
#[tauri::command]
async fn replace_buffer(content: String, old_title: String) -> Result<Option<String>, String> {
    with_store(move |s| {
        let previous = s.buffer()?.unwrap_or_default();
        let archive = if previous.trim().is_empty() {
            None
        } else {
            Some(s.create(&old_title, &previous)?)
        };
        if let Err(e) = s.save_buffer(&content) {
            if let Some(name) = &archive {
                let _ = std::fs::remove_file(s.path(name)?);
            }
            return Err(e);
        }
        Ok(archive)
    })
    .await
}
#[tauri::command]
async fn set_custom_dir(app: tauri::AppHandle, path: Option<String>) -> Result<String, String> {
    let (result, names) = with_store(move |store| {
        let mut settings = settings::try_load_settings()?;
        let new = match &path {
            Some(p) => {
                let p = PathBuf::from(p);
                if !p.is_absolute() {
                    return Err("请选择完整的目录路径".into());
                }
                p.join("flashthoughts")
            }
            None => store.root.join("flashthoughts"),
        };
        let names = store.copy_to(&new)?;
        settings.custom_dir = path;
        settings::save_settings_internal(&settings)?;
        Ok((new.to_string_lossy().into_owned(), names))
    })
    .await?;
    app.emit(
        "quickmd:directory-changed",
        serde_json::json!({"names":names}),
    )
    .map_err(|e| e.to_string())?;
    Ok(result)
}
#[tauri::command]
async fn read_file_absolute(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = PathBuf::from(path);
        if !p.is_absolute()
            || !matches!(
                p.extension()
                    .and_then(|s| s.to_str())
                    .map(str::to_ascii_lowercase)
                    .as_deref(),
                Some("md" | "txt")
            )
        {
            return Err("只支持拖入 Markdown 或文本文件".into());
        }
        if std::fs::metadata(&p).map_err(|e| e.to_string())?.len() > 8 * 1024 * 1024 {
            return Err("文件超过 8 MB，请分段导入".into());
        }
        std::fs::read_to_string(p).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn resolve_image(app: tauri::AppHandle, path: String) -> Result<String, String> {
    with_store(move |store| {
        if path.starts_with("\\\\") || path.starts_with("//") {
            return Err("网络共享图片不会自动加载".into());
        }
        let p = PathBuf::from(path);
        let candidate = if p.is_absolute() {
            p
        } else {
            store.notes.join(p)
        };
        let canonical = std::fs::canonicalize(&candidate).map_err(|e| e.to_string())?;
        let ext = canonical
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !["png", "jpg", "jpeg", "gif", "webp"].contains(&ext.as_str()) {
            return Err("不支持此图片格式".into());
        }
        if std::fs::metadata(&canonical)
            .map_err(|e| e.to_string())?
            .len()
            > 16 * 1024 * 1024
        {
            return Err("图片超过 16 MB".into());
        }
        app.asset_protocol_scope()
            .allow_file(&canonical)
            .map_err(|e| e.to_string())?;
        Ok(canonical.to_string_lossy().into_owned())
    })
    .await
}
#[tauri::command]
async fn import_image(path: String) -> Result<String, String> {
    with_store(move |s| s.import_image(&PathBuf::from(path))).await
}
#[tauri::command]
async fn export_note(content: String, suggested_name: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match rfd::FileDialog::new()
            .set_file_name(&suggested_name)
            .add_filter("Markdown", &["md"])
            .save_file()
        {
            Some(path) => {
                storage::atomic_write(&path, content.as_bytes())?;
                Ok(Some(path.to_string_lossy().into()))
            }
            None => Ok(None),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn open_in_explorer(file_name: String) -> Result<(), String> {
    with_store(move |s| {
        let p = s.path(&file_name)?;
        if !p.exists() {
            return Err("文件不存在".into());
        }
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
}
#[tauri::command]
fn open_external_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("不支持此链接协议".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn show_float_window(app: tauri::AppHandle) -> Result<String, String> {
    let w = app.get_webview_window("float").ok_or("浮窗未就绪")?;
    w.unminimize().map_err(|e| e.to_string())?;
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())?;
    Ok("ok".into())
}
#[tauri::command]
async fn set_window_glass(
    window: tauri::WebviewWindow,
    enabled: bool,
    dark: bool,
    opacity: f32,
    accent: String,
) -> Result<acrylic::MaterialStatus, String> {
    if !matches!(window.label(), "main" | "float") {
        return Err("此窗口不支持毛玻璃主题".into());
    }
    acrylic::parameters(opacity, &accent)?;
    window
        .set_theme(Some(if dark {
            tauri::Theme::Dark
        } else {
            tauri::Theme::Light
        }))
        .map_err(|e| e.to_string())?;
    let (send, receive) = std::sync::mpsc::channel();
    let handle = window.clone();
    window
        .run_on_main_thread(move || {
            let result = acrylic::apply_ui(&handle, enabled, opacity, &accent);
            if std::env::var("QUICKMD_SMOKE_CHECK").as_deref() == Ok("1") {
                if let Ok(root) = data_root() {
                    let report = match &result {
                        Ok(value) => serde_json::to_vec(value),
                        Err(error) => serde_json::to_vec(&serde_json::json!({"error": error})),
                    };
                    if let Ok(bytes) = report {
                        let _ = storage::atomic_write(
                            &root
                                .join(".runtime")
                                .join(format!("material-{}.json", handle.label())),
                            &bytes,
                        );
                    }
                }
            }
            let _ = send.send(result);
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        receive
            .recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|_| "毛玻璃请求未完成，请重试".to_string())
    })
    .await
    .map_err(|e| e.to_string())??
}
#[tauri::command]
fn finish_exit(app: tauri::AppHandle, state: tauri::State<ExitState>) {
    state.approved.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
async fn get_window_material(
    window: tauri::WebviewWindow,
) -> Result<acrylic::MaterialStatus, String> {
    if !matches!(window.label(), "main" | "float") {
        return Err("此窗口不支持材质回读".into());
    }
    let (send, receive) = std::sync::mpsc::channel();
    let handle = window.clone();
    window
        .run_on_main_thread(move || {
            let result = acrylic::read_ui(&handle);
            if std::env::var("QUICKMD_SMOKE_CHECK").as_deref() == Ok("1") {
                if let (Ok(root), Ok(value)) = (data_root(), &result) {
                    if let Ok(bytes) = serde_json::to_vec(value) {
                        let _ = storage::atomic_write(
                            &root
                                .join(".runtime")
                                .join(format!("material-{}.json", handle.label())),
                            &bytes,
                        );
                    }
                }
            }
            let _ = send.send(result);
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        receive
            .recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|_| "材质回读未完成".to_string())
    })
    .await
    .map_err(|e| e.to_string())??
}

pub fn run() {
    let mut context = tauri::generate_context!();
    if std::env::var("QUICKMD_DATA_DIR").is_ok() {
        let root = data_root().expect("隔离数据目录必须为绝对路径");
        context.config_mut().app.app_directories_override = Some(
            tauri::utils::config::AppDirectoriesOverride::Root(root.join(".webview")),
        );
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(ShortcutState(std::sync::Mutex::new(None)))
        .manage(ExitState::default())
        .setup(|app| {
            acrylic::initialize_ui();
            // 单实例锁与数据隔离。启动绝不覆盖已有便利贴或指南。
            let root = data_root().map_err(std::io::Error::other)?;
            std::fs::create_dir_all(&root)?;
            let lock = std::fs::OpenOptions::new()
                .create(true)
                .read(true)
                .write(true)
                .truncate(false)
                .open(root.join(".app.lock"))?;
            lock.try_lock().map_err(|_| {
                std::io::Error::other("QuickMD 已在运行，请使用全局快捷键或托盘呼出")
            })?;
            app.manage(InstanceLock(lock));
            settings::try_load_settings().map_err(std::io::Error::other)?;
            current_store()?
                .seed_initial_documents()
                .map_err(std::io::Error::other)?;

            use tauri::{
                menu::{MenuBuilder, MenuItemBuilder},
                tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
                WindowEvent,
            };

            // --- System tray ---
            let tray_app = app.handle().clone();
            let show_main = MenuItemBuilder::with_id("show_main", "显示主窗口")
                .build(&tray_app)
                .unwrap();
            let quick_note = MenuItemBuilder::with_id("quick_note", "显示便利贴")
                .build(&tray_app)
                .unwrap();
            let settings_item = MenuItemBuilder::with_id("settings", "设置")
                .build(&tray_app)
                .unwrap();
            let quit = MenuItemBuilder::with_id("quit", "退出 QuickMD")
                .build(&tray_app)
                .unwrap();

            let menu = MenuBuilder::new(&tray_app)
                .item(&show_main)
                .item(&quick_note)
                .separator()
                .item(&settings_item)
                .separator()
                .item(&quit)
                .build()
                .unwrap();

            let tray_icon = app
                .default_window_icon()
                .cloned()
                .expect("Tray icon not found");

            let _tray = TrayIconBuilder::with_id("quickmd-tray")
                .icon(tray_icon)
                .tooltip("QuickMD - 闪念便利贴")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show_main" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quick_note" => {
                        if let Some(w) = app.get_webview_window("float") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "settings" => {
                        // Show main window (settings is in the main window)
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                        // Emit event so frontend opens settings modal
                        let _ = app.emit("quickmd:open-settings", ());
                    }
                    "quit" => {
                        let _ = app.emit_to("main", "quickmd:exit-requested", ());
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("float") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)
                .unwrap();

            // --- Intercept float window close → hide instead ---
            if let Some(float_win) = app.get_webview_window("float") {
                let float_win_clone = float_win.clone();
                float_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = float_win_clone.emit("quickmd:float-close-requested", ());
                    }
                });
            }

            // --- Also intercept main window close → emit to frontend for dirty check ---
            if let Some(main_win) = app.get_webview_window("main") {
                let app_for_emit = app.handle().clone();
                main_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = app_for_emit.emit("quickmd:main-close-requested", ());
                    }
                });
            }

            // --- Global hotkey (from settings, default Alt+Q) ---
            let settings_data = settings::try_load_settings().map_err(std::io::Error::other)?;
            let shortcut_str = settings_data.shortcut.clone();

            // --- Sync autostart state on launch ---
            // If settings say autostart is on, ensure the OS registration exists.
            // This handles cases where the registry entry was cleared externally.
            if settings_data.autostart {
                use tauri_plugin_autostart::ManagerExt;
                match app.autolaunch().is_enabled() {
                    Ok(true) => {} // already enabled, nothing to do
                    Ok(false) => match app.autolaunch().enable() {
                        Ok(_) => println!("[QuickMD] Autostart re-enabled on launch"),
                        Err(e) => {
                            eprintln!("[QuickMD] Failed to re-enable autostart on launch: {}", e)
                        }
                    },
                    Err(e) => eprintln!("[QuickMD] Failed to check autostart status: {}", e),
                }
            }

            if let Err(e) = settings::register_shortcut(app.handle(), &shortcut_str) {
                eprintln!("[QuickMD] 快捷键不可用：{e}");
            } else if let Ok(mut state) = app.state::<ShortcutState>().0.lock() {
                *state = Some(shortcut_str);
            }

            // Show main window on startup
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_note,
            runtime_ready,
            load_note,
            list_notes,
            search_notes,
            get_flashthoughts_dir_path,
            show_float_window,
            set_window_glass,
            get_window_material,
            read_file_absolute,
            resolve_image,
            import_image,
            create_note,
            replace_buffer,
            finish_exit,
            open_external_link,
            export_note,
            delete_note,
            rename_note,
            open_in_explorer,
            get_all_tags,
            set_tags,
            inspect_buffer,
            save_buffer,
            clear_buffer,
            archive_buffer,
            set_custom_dir,
            settings::get_settings,
            settings::save_app_settings,
        ])
        .build(context)
        .expect("error while building QuickMD")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                acrylic::close_all();
            }
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !app.state::<ExitState>().approved.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    let _ = app.emit_to("main", "quickmd:exit-requested", ());
                }
            }
        });
}
