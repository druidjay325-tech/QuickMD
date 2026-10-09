use std::path::Path;

#[cfg(not(windows))]
pub fn move_to_system_bin(_path: &Path) -> Result<(), String> {
    Err("当前版本仅支持 Windows 系统回收站删除".into())
}

#[cfg(windows)]
pub fn move_to_system_bin(path: &Path) -> Result<(), String> {
    let path = path.to_path_buf();
    // IFileOperation 要求 STA；阻塞任务池的线程可能已由其他任务初始化为 MTA。
    std::thread::Builder::new()
        .name("quickmd-recycle".into())
        .spawn(move || platform::recycle(&path))
        .map_err(|e| e.to_string())?
        .join()
        .map_err(|_| "系统回收站操作线程异常，请检查文件和系统回收站".to_string())?
}

#[cfg(windows)]
mod platform {
    use std::{
        os::windows::ffi::OsStrExt,
        path::Path,
        sync::{Arc, Mutex},
    };
    use windows::{
        core::{implement, Ref, Result as WinResult, HRESULT, PCWSTR},
        Win32::{
            Foundation::E_ABORT,
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_APARTMENTTHREADED,
            },
            UI::Shell::{
                FileOperation, IFileOperation, IFileOperationProgressSink,
                IFileOperationProgressSink_Impl, IShellItem, SHCreateItemFromParsingName,
                FOFX_ADDUNDORECORD, FOFX_EARLYFAILURE, FOFX_RECYCLEONDELETE, FOF_NOCONFIRMATION,
                FOF_NOERRORUI, FOF_SILENT, TSF_DELETE_RECYCLE_IF_POSSIBLE,
            },
        },
    };
    type Outcome = Arc<Mutex<Option<std::result::Result<(), String>>>>;
    #[implement(IFileOperationProgressSink)]
    struct RecycleSink {
        outcome: Outcome,
    }
    #[allow(non_snake_case)]
    impl IFileOperationProgressSink_Impl for RecycleSink_Impl {
        fn StartOperations(&self) -> WinResult<()> {
            Ok(())
        }
        fn FinishOperations(&self, _result: HRESULT) -> WinResult<()> {
            Ok(())
        }
        fn PreRenameItem(&self, _: u32, _: Ref<IShellItem>, _: &PCWSTR) -> WinResult<()> {
            Ok(())
        }
        fn PostRenameItem(
            &self,
            _: u32,
            _: Ref<IShellItem>,
            _: &PCWSTR,
            _: HRESULT,
            _: Ref<IShellItem>,
        ) -> WinResult<()> {
            Ok(())
        }
        fn PreMoveItem(
            &self,
            _: u32,
            _: Ref<IShellItem>,
            _: Ref<IShellItem>,
            _: &PCWSTR,
        ) -> WinResult<()> {
            Ok(())
        }
        fn PostMoveItem(
            &self,
            _: u32,
            _: Ref<IShellItem>,
            _: Ref<IShellItem>,
            _: &PCWSTR,
            _: HRESULT,
            _: Ref<IShellItem>,
        ) -> WinResult<()> {
            Ok(())
        }
        fn PreCopyItem(
            &self,
            _: u32,
            _: Ref<IShellItem>,
            _: Ref<IShellItem>,
            _: &PCWSTR,
        ) -> WinResult<()> {
            Ok(())
        }
        fn PostCopyItem(
            &self,
            _: u32,
            _: Ref<IShellItem>,
            _: Ref<IShellItem>,
            _: &PCWSTR,
            _: HRESULT,
            _: Ref<IShellItem>,
        ) -> WinResult<()> {
            Ok(())
        }
        fn PreDeleteItem(&self, flags: u32, _: Ref<IShellItem>) -> WinResult<()> {
            if flags & TSF_DELETE_RECYCLE_IF_POSSIBLE.0 as u32 == 0 {
                return Err(windows::core::Error::from_hresult(E_ABORT));
            }
            Ok(())
        }
        fn PostDeleteItem(
            &self,
            _: u32,
            _: Ref<IShellItem>,
            result: HRESULT,
            recycled: Ref<IShellItem>,
        ) -> WinResult<()> {
            let outcome = result.ok().map_err(|e| e.to_string()).and_then(|_| {
                if recycled.as_ref().is_some() {
                    Ok(())
                } else {
                    Err("系统未确认文件已进入回收站，请检查源文件和系统回收站".into())
                }
            });
            *self
                .outcome
                .lock()
                .map_err(|_| windows::core::Error::from_hresult(E_ABORT))? = Some(outcome);
            Ok(())
        }
        fn PreNewItem(&self, _: u32, _: Ref<IShellItem>, _: &PCWSTR) -> WinResult<()> {
            Ok(())
        }
        fn PostNewItem(
            &self,
            _: u32,
            _: Ref<IShellItem>,
            _: &PCWSTR,
            _: &PCWSTR,
            _: u32,
            _: HRESULT,
            _: Ref<IShellItem>,
        ) -> WinResult<()> {
            Ok(())
        }
        fn UpdateProgress(&self, _: u32, _: u32) -> WinResult<()> {
            Ok(())
        }
        fn ResetTimer(&self) -> WinResult<()> {
            Ok(())
        }
        fn PauseTimer(&self) -> WinResult<()> {
            Ok(())
        }
        fn ResumeTimer(&self) -> WinResult<()> {
            Ok(())
        }
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    pub fn recycle(path: &Path) -> std::result::Result<(), String> {
        let run = || -> std::result::Result<(), String> {
            unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok() }
                .map_err(|e| e.to_string())?;
            let _apartment = ComApartment;
            let resolved = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
            let mut wide: Vec<u16> = resolved.as_os_str().encode_wide().collect();
            // 文件系统接受的 \\?\ 前缀不能直接交给 Shell 解析；保留 UTF-16 原名。
            if wide.starts_with(&[92, 92, 63, 92]) {
                if wide.get(5) != Some(&58) || wide.get(6) != Some(&92) {
                    return Err("该网络或特殊位置不支持系统回收站删除，文件保留".into());
                }
                wide.drain(..4);
            }
            if wide.starts_with(&[92, 92]) {
                return Err("网络位置不支持系统回收站删除，文件保留".into());
            }
            wide.push(0);
            let outcome: Outcome = Arc::new(Mutex::new(None));
            let sink: IFileOperationProgressSink = RecycleSink {
                outcome: outcome.clone(),
            }
            .into();
            // 只排队一个已验证路径，不存在永久删除或应用内回收区的回退。
            unsafe {
                let operation: IFileOperation =
                    CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER)
                        .map_err(|e| format!("创建系统删除操作失败：{e}"))?;
                operation
                    .SetOperationFlags(
                        FOFX_RECYCLEONDELETE
                            | FOFX_ADDUNDORECORD
                            | FOFX_EARLYFAILURE
                            | FOF_NOERRORUI
                            | FOF_NOCONFIRMATION
                            | FOF_SILENT,
                    )
                    .map_err(|e| format!("设置回收站操作选项失败：{e}"))?;
                let item: IShellItem = SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None)
                    .map_err(|e| format!("识别待删除文件失败：{e}"))?;
                operation
                    .DeleteItem(&item, &sink)
                    .map_err(|e| format!("提交回收站操作失败：{e}"))?;
                operation
                    .PerformOperations()
                    .map_err(|e| format!("执行回收站操作失败：{e}"))?;
                if operation
                    .GetAnyOperationsAborted()
                    .map_err(|e| e.to_string())?
                    .as_bool()
                {
                    return Err("系统回收站操作未完成，原文件未执行永久删除".into());
                }
            }
            let result = outcome
                .lock()
                .map_err(|_| "回收站结果不可用")?
                .take()
                .ok_or("系统未返回回收站操作结果")?;
            result?;
            if path.try_exists().map_err(|e| e.to_string())? {
                return Err("文件仍在原目录，系统回收站操作未完成".into());
            }
            Ok(())
        };
        run().map_err(|e| format!("无法移入系统回收站：{e}"))
    }
}
