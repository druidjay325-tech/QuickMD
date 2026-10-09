# 贡献说明

请先阅读 README.md。Windows 是当前支持目标；浏览器预览不能替代原生桌面验收。

运行 npm ci、npm run check、npm test、npm run test:rust、npm run tauri build。前端使用 Prettier，Rust 使用 cargo fmt。为实际用户后果编写回归测试。

开发和测试使用绝对路径 QUICKMD_DATA_DIR 或显式临时目录，不使用个人档案验证删除、迁移和写入故障。PR 说明触发问题、行为变化、验证结果及未验证环境；产品文案统一使用“便利贴”。

依赖变化须更新锁文件和第三方声明。安全问题见 SECURITY.md；不要公开个人文件和凭据。
