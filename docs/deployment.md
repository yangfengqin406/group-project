# 期末交付与双端部署

课程要求：Web 必须有可访问 URL；小程序最好审核通过，开发阶段或无法审核时必须提供 H5 替代。建议从第一周就打通 H5 部署，不把最后一天押在审核上。

## GitHub Pages 阶段演示（2026-10-22）

部署入口：[校园生活广场 H5](https://yangfengqin406.github.io/group-project/#/)。首次发布是否完成及当前版本，以[发布工作流](https://github.com/yangfengqin406/group-project/actions/workflows/deploy-h5.yml)最近一次成功运行为准；仅开启 Pages 不代表网页已经可访问。

此站只展示 main 已审阅的 A/B/C 阶段成果，固定使用本机演示数据。页面中的账号、消息、发布和装扮记录只保存在各自浏览器，不能跨设备同步，不是真实校园业务上线。A 分支草稿 PR #15 不随本次发布合入 main。

### 首次设置

1. 仓库管理员在 Settings → Pages → Build and deployment 将 Source 设为 **GitHub Actions**。本仓库已于10月22日启用该模式；不需要另建 gh-pages 分支或上传源码压缩包。
2. 将 `.github/workflows/deploy-h5.yml` 随本次托管配置 PR 审阅合入 main。Actions 的 `deploy-h5-demo` 会安装锁定依赖，运行 check、测试、微信构建及带子路径的 H5 构建，再上传 `dist/build/h5` 并部署。
3. 等待 build 与 deploy 都成功，打开工作流中 github-pages 的链接。若仓库环境要求审批，需管理员在该次运行批准部署；失败时查看具体步骤，不把构建成功写成部署成功。
4. 在独立浏览器验证广场、图片、四屋、宠物和深层路由刷新；再让监督人从其网络试开。首次上线结果和未验项补在 verification.md、同一份团队周报中。

### 以后修改怎样更新

成员仍在各自 A/B/C 分支开发，经 PR 审阅合入 main 后，网页自动重新构建发布，链接不变。只改本地文件、只推工作分支或只开草稿 PR，不会更新公网版本。需要重试时，在 Actions → deploy-h5-demo → Run workflow 选择 main；工作流拒绝从人员分支部署。失败构建不会执行后续部署，已有成功版本继续保留。

发布构建固定 `VITE_API_MODE=mock`、空真实接口地址和空订阅模板；H5 专用 `UNI_H5_BASE=/group-project/` 保持静态资源与 hash 路由在项目子目录下。此变量不写入用户的 manifest，也不影响微信构建。切换真实后端需另行配置、权限与跨设备验收。

本地复现子路径构建（PowerShell）：

```powershell
$env:VITE_API_MODE = 'mock'
$env:VITE_API_BASE_URL = ''
$env:VITE_WECHAT_TEMPLATE_IDS = ''
$env:UNI_H5_BASE = '/group-project/'
npm run build:h5
Remove-Item Env:UNI_H5_BASE
```

普通根路径部署继续使用下面的通用步骤。无需将 dist、node_modules、个人 AppID 工具配置或任何凭据提交到仓库。公网 H5 更新与微信小程序发布是两套流程，小程序仍须重新构建、上传并按平台流程审核发布。

## H5 通用部署

1. 接通真实后端并验收，设置真实 .env 再构建。若演示模式部署，只能称“骨架演示”，不能当作完整业务上线。
2. 执行 `npm ci`、`npm run check`、`npm test`、`npm run build:h5`。
3. 将 **dist/build/h5 目录内的产物**部署到自己的静态服务器或 CloudBase 静态托管。这里使用 hash 路由，访问链接保留 # 后路由即可；非根目录托管需另行设置资源路径并实测。
4. 后端 HTTPS 地址、跨域允许来源、登录回调、图片访问权限配置正确；所有 VITE_ 变量是公开前端配置，不包含服务端密钥。
5. 从老师可访问的网络打开 URL，在手机浏览器验证首页、刷新深层路由、登录、发布、匹配与留言。不要只交 localhost 或本机局域网 IP。

## 微信小程序

1. 填写自己的 AppID，尽早按平台要求处理主体、类目、备案及审核材料。
2. 配置后端与上传的合法域名、HTTPS、隐私说明和需要的授权；开发者工具的“忽略合法域名校验”不能作为正式上线方法。
3. `npm run build:mp-weixin`；开发者工具导入 dist/build/mp-weixin，真机预览、上传版本、提交审核。
4. 订阅模板与真实授权单独验收；拒绝授权不应阻断发布、邀请和站内消息。
5. 提交审核通过的小程序码；如果暂未通过，提供已部署 H5 URL 和已知限制，符合老师替代要求。

## 最终提交物

仓库地址、README、可访问 URL / 小程序码、演示账号说明（不含管理员密钥）、功能完成表、验收记录及分工。构建通过只表示可生成产物，不表示已审核或公网可用。

官方参考（2026-10-14 核对）：
- https://uniapp.dcloud.net.cn/quickstart-cli.html
- https://uniapp.dcloud.net.cn/tutorial/platform.html
- https://cloud.tencent.com/document/product/876

GitHub Pages 参考（2026-10-22 核对）：
- [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Vite 项目子目录部署](https://vite.dev/guide/static-deploy.html#github-pages)
