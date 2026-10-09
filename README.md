# QuickMD · 闪念便利贴

[English](README.en.md) · [MIT](LICENSE)

按下 Alt+Q，记下闪念。QuickMD 是基于 Tauri、Rust、React 和 TypeScript 的本地 Markdown 便利贴应用，当前版本 0.6.7，支持 Windows 10/11 x64。

## 使用

- 浮窗快速输入，归档后在主窗浏览、搜索、打标签和导出。
- 支持编辑、预览和分屏，支持代码高亮、表格、任务列表、脚注和 Mermaid。
- 支持深色、浅色、毛玻璃主题；新用户默认使用雾蓝与毛玻璃。
- 设置调整后即时保存；右键删除将文件移入 Windows 系统回收站。

## 默认文档与数据

首次启动在存档目录生成 **SOUL.md** 与 **Markdown 语法指南.md**，分别使用源码中的 WELCOME_CONTENT.md、MD_GUIDE_CONTENT.md。它们是应用自带的可编辑文档，模板内容保留作者原文。同名文件不覆盖；初始化完成后删除的文档不会在重启时重新生成。

默认档案路径为 ~/QuickMD/flashthoughts/，Windows 通常为 %USERPROFILE%/QuickMD/flashthoughts/；自定义存档根目录下使用 flashthoughts/。标签在 tags.json，图片在 .assets/。草稿在 ~/QuickMD/.float-buffer/，上一版在 ~/QuickMD/.recovery/；设置通常在 %APPDATA%/QuickMD/settings.json。备份时保留整个数据目录、自定义存档目录及设置。更换存档目录时复制数据并保留原目录。

应用没有账号、遥测和云同步；预览不执行原始 HTML，不自动加载远程图片，外链需确认。

## 运行要求

需要 Microsoft Edge WebView2 Runtime。毛玻璃使用 Microsoft DesktopAcrylicController，还需要 Windows App Runtime 2.5.1 x64 或更新的 2.5 系列；该运行库不随安装包安装，缺失时提示并使用可读实色背景。

毛玻璃滑块同时控制 TintOpacity 和 LuminosityOpacity；菜单、子菜单和设置页固定为 94% 底色不透明度。系统策略与透明效果设置可能影响材质，浏览器预览只模拟效果。

## 开发与构建

需要 Node.js 24.14+、npm 11、Rust stable、Visual Studio C++ Build Tools 与 Windows SDK。

~~~powershell
npm ci
npm run prepare:acrylic
npm run check
npm test
npm run test:rust
npm run tauri build
~~~

安装包生成于 src-tauri/target/release/bundle/。首次准备原生材质会从官方 NuGet 下载固定版本依赖并校验 SHA-256。

纯浏览器预览使用 npm run dev，数据仅在内存中。桌面开发使用隔离目录，避免访问个人档案：

~~~powershell
$env:QUICKMD_DATA_DIR = Join-Path (Get-Location) '.scratch/runtime-profile'
npm run tauri dev
~~~

## 贡献与许可

见 [贡献说明](CONTRIBUTING.md)、[安全策略](SECURITY.md) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。自有源码使用 MIT，第三方组件遵循各自许可。
