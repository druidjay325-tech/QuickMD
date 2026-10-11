# 作者信息与支持入口配置

源码配置入口：`src/projectInfo.json`。关于页版本号直接读取 package.json，不单独填写。

作者署名和联系方式由 src/projectInfo.json 提供。联系方式和支持渠道为空时，关于页与“支持作者”子界面显示“待作者补充”。支持功能为自愿入口，不影响应用使用。当前配置已接入作者提交的 DruidJay 署名、两项邮箱联系入口与微信/支付宝二维码。

从 0.7.2 起，“支持作者”仅在简体中文界面显示；英文及其他语言暂不显示入口或支持子页。中文默认说明按作者指定为：“如果 QuickMD 为你留住了好点子，欢迎打赏作者一点token钱，助力作者早日灵活就业。支持完全自愿。”

## 填写信息

```json
{
  "repository": "https://github.com/druidjay325-tech/QuickMD",
  "license": "MIT",
  "author": {
    "name": "你的公开署名",
    "contacts": [
      { "label": "Email", "value": "your-public-email@example.com" },
      { "label": "Website", "value": "https://your-site.example.com" }
    ]
  },
  "support": {
    "message": {
      "zh-CN": "你希望展示的中文说明",
      "en": "Your optional support message"
    },
    "links": [
      { "label": "支持页面", "url": "https://your-support.example.com" }
    ],
    "qrCodes": [
      { "label": "扫码支持", "image": "/support/author.png" }
    ]
  }
}
```

以上是假想示例，未写入实际作者配置。仅填写你准备公开的信息；此文件与二维码会进入开源仓库和安装资源，不放凭据或账号密钥。链接支持 HTTPS、mailto；不自动打开，不执行支付。二维码图片放到 `public/support/`，配置中以 `/support/文件名.png` 引用；实际页面显示本地随包图片。

源码已经包含 `public/support/` 目录。建议文件名为 `wechat.png` 或 `alipay.png`，然后在 `support.qrCodes` 中分别加入 `{ "label": "微信打赏", "image": "/support/wechat.png" }` 或相应支付宝项。空目录不会生成或展示假二维码。联系方式从 0.7.4 起使用 `value` 保存要显示的完整文本，可选中复制，不打开邮件程序；旧 `url` 字段仍兼容显示。支持链接继续使用 `url`。

修改后执行 `npm run check`、`npm test` 和 `npm run tauri build`。作者配置编译进应用，需要构建新版后生效。

## 检查版本更新

用户点击后调用仓库公开的 GitHub Releases 最新正式发布接口，不需要令牌，不上传便利贴。只比较有效的语义版本号（例如 v0.7.1），不把草稿或预发布版视为正式更新。发现新版时提供发布页入口，由用户自行下载安装。尚未发布 Release、网络故障、请求限流、无效响应均有相应状态，不假报“已是最新”。

接口依据：[GitHub Releases API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)。更新检查不读本地 Git 凭据。普通使用不会自动发起更新请求。
