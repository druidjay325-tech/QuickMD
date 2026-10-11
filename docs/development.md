# Development / 开发指南

QuickMD uses Tauri, Rust, React and TypeScript. Windows x64 is the current desktop target. 本文说明开发环境、隔离运行、检查与构建；浏览器预览和原生桌面验收有不同边界。

## Prerequisites / 环境

- Node.js 24.14+ and npm 11.
- Rust stable.
- Visual Studio C++ Build Tools and Windows SDK.
- Microsoft Edge WebView2 Runtime.
- For native frosted glass: Windows App Runtime 2.5.1 x64 or a newer 2.5-series runtime. The application installer does not install this framework runtime.

## Install dependencies / 安装依赖

```powershell
npm ci
npm run prepare:acrylic
```

The native preparation step downloads pinned packages from official NuGet sources and verifies SHA-256. 首次准备需要联网；具体版本和哈希以 `scripts/prepare-acrylic.cjs` 为准。

## Browser preview / 浏览器预览

```powershell
npm run dev
```

The browser uses disposable in-memory demo data that resets on reload. It does not prove native hotkeys, disk persistence, inter-window behavior or desktop acrylic rendering. 浏览器不连接个人便利贴，不能替代原生验收。

## Desktop development / 桌面开发

Use an absolute disposable data directory **before starting** the application:

```powershell
$env:QUICKMD_DATA_DIR = Join-Path (Get-Location) '.scratch/runtime-profile'
npm run tauri dev
```

`QUICKMD_DATA_DIR` isolates notes, drafts, previous versions, configuration and the instance lock. Never use personal notes for deletion, migration or failure tests. The Windows Recycle Bin is outside this directory; test native deletion only with explicitly created disposable samples.

原生材质使用 Microsoft DesktopAcrylicController。窗口不透明度同时映射 TintOpacity 与 LuminosityOpacity；菜单、子菜单和设置使用固定 94% 底色不透明度。系统标题栏由 Windows 绘制，运行库和系统透明效果策略都会影响结果。浏览器模拟不能证明这些行为。

## Default documents / 默认文档

The first launch resolves the saved interface preference (`system`, `zh-CN`, or `en`). Following the Windows display language selects Chinese for Chinese locales and English otherwise. Chinese initializes `SOUL.md` and `Markdown 语法指南.md`; English initializes `SOUL.md` and `Markdown Guide.md`. The installer does not currently ask for a document language.

首次启动按解析后的界面语言选择两篇完整模板：欢迎文档和 Markdown 语法指南。四个源文件为 `WELCOME_CONTENT.md`、`MD_GUIDE_CONTENT.md` 及各自的 `.en.md` 文件。

These are ordinary editable notes. Existing names are never overwritten; an initialization marker prevents regeneration after deletion. Switching the interface language does not translate, rename, overwrite, or add notes. Template changes require a native rebuild and affect newly initialized profiles, not existing user notes.

它们是普通可编辑笔记。已有同名文件不覆盖，初始化后删除也不重建；切换界面语言不翻译、不改名、不覆盖、不补发另一种语言。更新模板需要重新编译原生应用，不能靠替换安装目录旁的 Markdown 文件生效。

## Image drops / 图片拖入

In Edit or Split, dropping one or more PNG, JPEG, GIF or WebP images inserts relative references at the captured cursor or selection. Both windows share the same insertion logic and the toolbar picker uses it too. Each image is copied to `.assets` with an exclusive generated name; the original stays untouched. The limit is 16 MB per image. Drop text files and images separately. Preview asks you to switch to Edit first.

主窗、分屏和浮窗共用图片插入流程。异步复制期间编辑会话、正文或目录变化时取消插入；成功的副本不会被自动清理，避免误删用户资源。保存、归档与窗口关闭会等待当前图片操作。失败文件不插入引用，其余成功图片保持顺序。实际 Windows 资源管理器拖放、原生撤销和视觉效果应按手动矩阵另外验收，事件/IPC mocks 不替代这些检查。

## Checks and builds / 检查与构建

```powershell
npm run check
npm test
npm run test:rust
npm run tauri build
```

Installers are generated under `src-tauri/target/release/bundle/`. Passing automated checks or creating an installer does not establish clean-machine installation, upgrade, high-DPI or lifecycle behavior. Record the version, environment and actual result for native checks.

生成安装包不代表已经公开发布。公开前需核对 Release 附件、签名状态、文件大小、SHA-256 与对应源码；未完成的安装/升级/卸载验收保持明确标记。

## Contributing / 参与开发

Read the [contribution guidelines](../CONTRIBUTING.md), [security policy](../SECURITY.md) and [data recovery guide (Chinese)](data-safety.md). Use Prettier for frontend code and `cargo fmt` for Rust. Include reproduction steps and the actual validation scope when contributing a fix.
