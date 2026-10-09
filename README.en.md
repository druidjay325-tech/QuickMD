# QuickMD

[简体中文](README.md) · [MIT](LICENSE)

Press Alt+Q to capture a thought. QuickMD 0.6.7 is a local Markdown scratchpad for Windows 10/11 x64, built with Tauri, Rust, React and TypeScript.

## Features

Floating scratchpad, searchable archive, tags, edit/preview/split modes, Markdown highlighting, tables, task lists, footnotes and Mermaid diagrams. Light, dark and frosted-glass themes; new profiles default to mist blue and glass. Settings save immediately. Deletion uses the Windows Recycle Bin.

## Initial documents and data

First launch creates **SOUL.md** and **Markdown 语法指南.md** from WELCOME_CONTENT.md and MD_GUIDE_CONTENT.md. These are editable bundled notes with the author's original content. Existing files are preserved. Documents deleted after initialization are not recreated.

Default archive: ~/QuickMD/flashthoughts/. Custom archive roots also use flashthoughts/. Tags and images are stored alongside notes. Drafts and previous versions are under ~/QuickMD/. Settings normally live at %APPDATA%/QuickMD/settings.json. Back up the data root, custom archive and settings together. Changing the archive root copies data and preserves the original folder.

No accounts, telemetry or cloud sync. Raw HTML execution and automatic remote images are disabled; external links require confirmation.

## Requirements and development

Microsoft Edge WebView2 Runtime is required. Desktop Acrylic also requires Windows App Runtime 2.5.1 x64 or a newer 2.5 runtime, which the installer does not install. Missing support produces a readable solid fallback and an explicit warning. The opacity slider controls both TintOpacity and LuminosityOpacity; menus and Settings retain fixed 94% surface opacity. System policies can affect the material; browser previews simulate it.

Build prerequisites: Node.js 24.14+, npm 11, Rust stable, Visual Studio C++ Build Tools and Windows SDK.

~~~powershell
npm ci
npm run prepare:acrylic
npm run check
npm test
npm run test:rust
npm run tauri build
~~~

Installers are generated under src-tauri/target/release/bundle/. Native preparation downloads pinned official NuGet packages and verifies SHA-256. Use npm run dev for disposable in-memory browser previews. For desktop development, isolate all application data:

~~~powershell
$env:QUICKMD_DATA_DIR = Join-Path (Get-Location) '.scratch/runtime-profile'
npm run tauri dev
~~~

See [contributing](CONTRIBUTING.md), [security policy](SECURITY.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
