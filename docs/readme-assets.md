# README 与 GitHub 分享素材

本页用于整理开源仓库时核对素材。当前应用演示版本为 0.7.4；素材就绪不代表安装验收或 GitHub Release 已发布。

## 直接使用

| 用途 | 文件 | 说明 |
| --- | --- | --- |
| 中文 README 首图 | [主窗与浮窗同框](screenshots/readme-windows.zh-CN.png) | 1128×852；独立演示实例中的真实双窗画面，深色主题 |
| 英文 README 首图 | [英文主窗](screenshots/readme-main.en.jpg) | 1536×864；英文界面。中文同框图作为折叠补充 |
| 普通文件实证 | [同一份 Markdown](screenshots/readme-file-proof.png) | 1600×840；QuickMD 与 VS Code 打开同一文件，两张原生截图并排，右图局部裁切已标明 |
| GitHub 分享预览 | [social-preview.png](screenshots/social-preview.png) | 1280×640，低于 1 MB；可直接上传至仓库 Social preview |
| 分享封面排版源 | [social-preview.svg](screenshots/social-preview.svg) | 引用项目原图标 `src-tauri/icons/128x128.png`；移动源文件时保留对应相对路径 |
| 中文操作演示 | [中文步骤 GIF](screenshots/readme-workflow.zh-CN.gif) | 960×790，25.66 秒，约 2.5 MB，循环播放 |
| 英文步骤演示 | [英文字幕 GIF](screenshots/readme-workflow.en.gif) | 同一中文界面实录配英文步骤提示；README 已说明语言边界 |
| 独立浮窗 | [中文](screenshots/readme-float.zh-CN.jpg) / [英文](screenshots/readme-float.en.jpg) | 已放入各语言 README |
| 主题对照 | [浅色](screenshots/readme-theme-light.zh-CN.jpg) / [深色](screenshots/readme-theme-dark.zh-CN.jpg) | 同一份演示内容，中文 README 中折叠展示 |

新增静态素材的尺寸、字节大小与 SHA-256 见 [素材清单](screenshots/readme-final-assets-manifest.json)。

## GitHub 分享预览设置

在仓库 **Settings → General → Social preview** 上传 `social-preview.png`。README 内的图片不会自动替代这项设置，需要维护者手动上传分享封面。

GitHub 要求 PNG/JPG/GIF 小于 1 MB，推荐 1280×640。参见 [GitHub 官方说明](https://docs.github.com/zh/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)。

## 整理源码时保留

- README 中引用的所有相对图片路径，以及本页引用的素材文件。
- 原有应用图标、许可证和第三方声明。
- 中英文入口链接；当前公开导出以英文 `README.md` 为入口，中文为 `README.zh-CN.md`，另保留 `README.en.md`。

可发布素材仅包括本页列出的成品图片、GIF 与封面源文件。开发机上的演示数据、编辑器配置、原始录像和中间截图应保存在公开目录之外。
