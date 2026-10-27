# 多手机跨网络开发预览

手机使用流量或不同Wi-Fi时，必须连接同一个公网HTTPS后端。电脑的127.0.0.1只供电脑自身使用；微信预览二维码不包含服务器，也不会让私网端口自动上线。

## 当前验证与范围

2026-10-27用户实际确认：华为流量H5注册/登录后场景和伙伴正常；新的微信原生预览场景可见，但接口受域名/网络限制，手机打开开发调试并重新进入后伙伴也正常。公网HTTPS已实际验证三个独立账号登录、伙伴/衣柜读取、双方留言与第三方越权拒绝。不是全部功能真机验收或审核通过。

临时连接只提供新的虚构展示库，未公开原.local-campus或8791库；不同手机各自注册不同账号，共享当前服务的数据。昵称“小明”不是登录账号；独立账号要求3～40位英文/数字/点/下划线/短横线，密码至少8位。

## 微信手机构建

先准备可达HTTPS后端及同源/static资源，再在项目根目录用Node22执行：

```powershell
$env:CAMPUS_PHONE_PREVIEW_ORIGIN='https://实际服务域名'
node scripts/build-phone-preview.mjs
node scripts/check-weixin-styles.mjs dist/release/mp-weixin-public
node scripts/check-weixin-quality.mjs dist/release/mp-weixin-public
node scripts/check-weixin-package.mjs dist/release/mp-weixin-public
```

导入 `dist/release/mp-weixin-public`，用自己的AppID。脚本将API和牌桌设为真实HTTPS源，将运行时图片指向同源/static并启用网络WebP解析，底栏图标保留包内。资源若在另一域名，额外指定 `CAMPUS_PHONE_PREVIEW_ASSET_ORIGIN`。服务必须实际提供文件；GitHub Pages演示不是真实RPC。

不要扫旧的127.0.0.1预览码。重新编译生成新码，当前服务注册的账号可同时登录H5与微信，分别保存会话。预览码有有效期，后来加入的手机必要时重新生成。

## 手机域名检查

电脑工具“不校验合法域名”不会自动替手机打开调试。开发/体验人员可在手机小程序右上角“…”→“开发调试”→“打开调试”，退出重新进入。若菜单不存在，核对微信后台的开发/体验权限；普通用户不能靠此获得正式使用资格。正式版应配置实际服务器HTTPS合法域名及对应request/upload/download能力，关闭调试真机复验。

随机临时域名不作为正式微信域名方案。尚无固定域名时，不承诺所有普通用户可直接扫小程序码使用；课程展示可发同一真实H5入口。

## 临时入口生命周期

本轮使用Cloudflare官方Quick Tunnel对接回环独立真实服务，未安装系统服务或更改代理/防火墙。官方定位为临时测试入口：进程停止失效，重建可能换地址，见[官方说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。实际URL、二维码、日志与测试账号只留本机，不提交公共仓库。

保持“临时公网手机演示”终端和电脑联网。换URL后需重新构建微信预览并生成新码；原地址数据目录保留，不自动迁移到新实例。H5同源/api与/game会跟随当次入口。

长期使用仍需固定HTTPS域名、常驻后端与备份、微信配置及审核，临时服务不替代正式交付。
