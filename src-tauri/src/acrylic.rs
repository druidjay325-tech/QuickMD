use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialStatus {
    pub engine: String,
    pub enabled: bool,
    pub opacity: f32,
    pub tint_opacity: Option<f32>,
    pub luminosity_opacity: Option<f32>,
    pub state: Option<i32>,
    pub tint_color: Option<[u8; 3]>,
}
impl MaterialStatus {
    fn solid(opacity: f32) -> Self {
        Self {
            engine: "solid".into(),
            enabled: false,
            opacity,
            tint_opacity: None,
            luminosity_opacity: None,
            state: None,
            tint_color: None,
        }
    }
}
pub fn parameters(opacity: f32, accent: &str) -> Result<(f32, f32, u32), String> {
    if !opacity.is_finite() || !(0.0..=100.0).contains(&opacity) {
        return Err("毛玻璃不透明度应在 0–100% 之间".into());
    }
    let hex = accent
        .strip_prefix('#')
        .filter(|v| v.len() == 6)
        .ok_or("主题色格式无效")?;
    let rgb = u32::from_str_radix(hex, 16).map_err(|_| "主题色格式无效")?;
    let mut tinted = 0u32;
    for (shift, base) in [(16, 17.0f32), (8, 27.0), (0, 41.0)] {
        let channel = ((rgb >> shift) & 255) as f32;
        tinted |= ((base * 0.88 + channel * 0.12).round() as u32) << shift;
    }
    let p = opacity / 100.0;
    Ok((p, p, tinted))
}
#[cfg(windows)]
mod native {
    use super::*;
    use std::{
        cell::RefCell, collections::HashMap, ffi::c_void, os::windows::ffi::OsStrExt,
        sync::OnceLock,
    };
    use tauri::Manager;
    use windows::{
        core::{PCSTR, PCWSTR},
        Win32::{
            Foundation::{FreeLibrary, HMODULE},
            System::{
                LibraryLoader::{
                    GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
                    LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR,
                },
                Threading::GetCurrentThreadId,
            },
        },
    };
    static UI_THREAD: OnceLock<u32> = OnceLock::new();
    type Create = unsafe extern "system" fn(*mut c_void, *mut usize) -> i32;
    type Set = unsafe extern "system" fn(usize, f32, f32, u32) -> i32;
    type Info = unsafe extern "system" fn(usize, *mut u8, i32) -> i32;
    type Close = unsafe extern "system" fn(usize) -> i32;
    struct Api {
        _module: HMODULE,
        create: Create,
        set: Set,
        info: Info,
        close: Close,
    }
    struct Session {
        api: Option<Api>,
        contexts: HashMap<String, usize>,
    }
    thread_local! {static SESSION:RefCell<Session>=RefCell::new(Session{api:None,contexts:HashMap::new()});}
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Readback {
        tint_opacity: f32,
        luminosity_opacity: f32,
        state: i32,
        tint_color: [u8; 3],
    }
    pub fn initialize_ui() {
        let _ = UI_THREAD.set(unsafe { GetCurrentThreadId() });
    }
    fn check_ui() -> Result<(), String> {
        if UI_THREAD.get().copied() == Some(unsafe { GetCurrentThreadId() }) {
            Ok(())
        } else {
            Err("材质操作必须在窗口线程执行".into())
        }
    }
    fn load(window: &tauri::WebviewWindow) -> Result<Api, String> {
        let base = window
            .app_handle()
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("resources/acrylic");
        let path = base.join("quickmd-acrylic.dll");
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        if wide.starts_with(&[92, 92, 63, 92]) {
            wide.drain(..4);
        }
        wide.push(0);
        let module = unsafe {
            LoadLibraryExW(
                PCWSTR(wide.as_ptr()),
                None,
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
            )
        }
        .map_err(|e| format!("可调毛玻璃组件加载失败：{e}"))?;
        let find = |name: &[u8]| {
            unsafe { GetProcAddress(module, PCSTR(name.as_ptr())) }
                .ok_or("可调毛玻璃接口不完整".to_string())
        };
        let result = (|| {
            Ok(Api {
                _module: module,
                create: unsafe {
                    std::mem::transmute::<unsafe extern "system" fn() -> isize, Create>(find(
                        b"QMCreate\0",
                    )?)
                },
                set: unsafe {
                    std::mem::transmute::<unsafe extern "system" fn() -> isize, Set>(find(
                        b"QMSet\0",
                    )?)
                },
                info: unsafe {
                    std::mem::transmute::<unsafe extern "system" fn() -> isize, Info>(find(
                        b"QMInfo\0",
                    )?)
                },
                close: unsafe {
                    std::mem::transmute::<unsafe extern "system" fn() -> isize, Close>(find(
                        b"QMClose\0",
                    )?)
                },
            })
        })();
        if result.is_err() {
            unsafe {
                let _ = FreeLibrary(module);
            }
        }
        result
    }
    fn info(api: &Api, ctx: usize) -> Result<serde_json::Value, String> {
        let mut bytes = [0u8; 2048];
        let code = unsafe { (api.info)(ctx, bytes.as_mut_ptr(), 2048) };
        if code < 0 {
            return Err(format!("材质参数回读失败：0x{:08X}", code as u32));
        }
        let end = bytes
            .iter()
            .position(|v| *v == 0)
            .ok_or("材质回读没有结束标记")?;
        serde_json::from_slice(&bytes[..end]).map_err(|e| e.to_string())
    }
    pub fn apply_ui(
        window: &tauri::WebviewWindow,
        enabled: bool,
        opacity: f32,
        accent: &str,
    ) -> Result<MaterialStatus, String> {
        check_ui()?;
        let (tint, lum, rgb) = parameters(opacity, accent)?;
        SESSION.with(|cell|{
            let mut session=cell.borrow_mut();
            if !enabled {
                if let Some(ctx)=session.contexts.remove(window.label()){if let Some(api)=&session.api{unsafe{(api.close)(ctx);}}}
                return Ok(MaterialStatus::solid(opacity));
            }
            if session.api.is_none(){session.api=Some(load(window)?);}
            let api=session.api.as_ref().ok_or("材质组件未就绪")?;
            let ctx=if let Some(ctx)=session.contexts.get(window.label()){*ctx}else{
                let hwnd=window.hwnd().map_err(|e|e.to_string())?;
                let mut ctx=0usize;let code=unsafe{(api.create)(hwnd.0,&mut ctx)};
                if code<0||ctx==0{let detail=info(api,0).unwrap_or_default();return Err(format!("DesktopAcrylicController 无法启用（0x{:08X}）：{}。需要 Windows App Runtime 2.5.1 x64 或更新的 2.5 运行库。",code as u32,detail));}
                ctx
            };
            session.contexts.insert(window.label().to_string(),ctx);
            let api=session.api.as_ref().ok_or("材质组件未就绪")?;
            let code=unsafe{(api.set)(ctx,tint,lum,rgb)};
            if code<0{return Err(format!("材质更新失败：0x{:08X}",code as u32));}
            let read:Readback=serde_json::from_value(info(api,ctx)?).map_err(|e|e.to_string())?;
            if (read.tint_opacity-tint).abs()>0.0001||(read.luminosity_opacity-lum).abs()>0.0001{return Err("实际材质回读与请求值不一致".into());}
            Ok(MaterialStatus{engine:"DesktopAcrylicController".into(),enabled:true,opacity,tint_opacity:Some(read.tint_opacity),luminosity_opacity:Some(read.luminosity_opacity),state:Some(read.state),tint_color:Some(read.tint_color)})
        })
    }
    pub fn read_ui(window: &tauri::WebviewWindow) -> Result<MaterialStatus, String> {
        check_ui()?;
        SESSION.with(|cell| {
            let session = cell.borrow();
            let Some(ctx) = session.contexts.get(window.label()) else {
                return Ok(MaterialStatus::solid(0.0));
            };
            let api = session.api.as_ref().ok_or("材质组件未就绪")?;
            let read: Readback =
                serde_json::from_value(info(api, *ctx)?).map_err(|e| e.to_string())?;
            Ok(MaterialStatus {
                engine: "DesktopAcrylicController".into(),
                enabled: true,
                opacity: read.tint_opacity * 100.0,
                tint_opacity: Some(read.tint_opacity),
                luminosity_opacity: Some(read.luminosity_opacity),
                state: Some(read.state),
                tint_color: Some(read.tint_color),
            })
        })
    }
    pub fn close_all() {
        if check_ui().is_err() {
            return;
        }
        SESSION.with(|cell| {
            let mut s = cell.borrow_mut();
            let contexts = std::mem::take(&mut s.contexts);
            if let Some(api) = &s.api {
                for ctx in contexts.into_values() {
                    unsafe {
                        (api.close)(ctx);
                    }
                }
            }
        });
    }
}
pub fn read_ui(window: &tauri::WebviewWindow) -> Result<MaterialStatus, String> {
    #[cfg(windows)]
    {
        native::read_ui(window)
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(MaterialStatus::solid(0.0))
    }
}
pub fn initialize_ui() {
    #[cfg(windows)]
    native::initialize_ui();
}
pub fn close_all() {
    #[cfg(windows)]
    native::close_all();
}
pub fn apply_ui(
    window: &tauri::WebviewWindow,
    enabled: bool,
    opacity: f32,
    accent: &str,
) -> Result<MaterialStatus, String> {
    #[cfg(windows)]
    {
        native::apply_ui(window, enabled, opacity, accent)
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        parameters(opacity, accent)?;
        if enabled {
            Err("当前系统不支持 DesktopAcrylicController".into())
        } else {
            Ok(MaterialStatus::solid(opacity))
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn slider_controls_both_layers() {
        for p in [0.0, 22.0, 25.0, 50.0, 75.0, 100.0] {
            let (t, l, c) = parameters(p, "#527ac7").unwrap();
            assert_eq!(t, p / 100.0);
            assert_eq!(l, p / 100.0);
            assert_eq!(c, 0x19263c);
        }
    }
    #[test]
    fn invalid_controls_are_rejected() {
        for p in [f32::NAN, f32::INFINITY, -1.0, 101.0] {
            assert!(parameters(p, "#527ac7").is_err());
        }
        assert!(parameters(22.0, "not-a-color").is_err());
    }
}
