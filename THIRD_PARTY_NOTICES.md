# 第三方依赖与素材声明

QuickMD 自有源码使用根目录 MIT License。前端及 Rust 依赖的许可证标识、原文和来源见 docs/third-party-licenses.txt；npm run notices 可重新生成该文件。

应用使用项目原有 PNG/ICO 图标。通用内联图标延续 Lucide 风格，保留可能衍生来源的 Lucide ISC 与 Feather MIT 官方许可原文于 docs/licenses/lucide-isc-and-feather-mit.txt。来源：https://lucide.dev/license。

不打包外部字体。系统字体由操作系统提供。

Desktop Acrylic 桥接使用 Microsoft Windows App SDK Foundation 2.3.12、InteractiveExperiences 2.1.9 及 Microsoft.Windows.CppWinRT 2.0.240405.15。依赖通过固定 NuGet 包哈希校验；SDK-LICENSE.txt 与 CPPWINRT-LICENSE.txt 随生成的原生资源分发。微软组件遵循各自许可，不受 QuickMD MIT License 覆盖。Windows App Runtime 2.5.1 x64 是外部框架依赖，不随安装包安装。
