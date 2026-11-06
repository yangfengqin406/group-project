# 校园生活广场 · App 项目

面向校园的互助与生活信息应用，提供求助、搭子、二手和失物信息，以像素小镇、虚拟伙伴和装扮形成温暖的使用体验。使用 **uni-app + Vue 3 + JavaScript**，本机后端使用 Node.js 22 和 SQLite，公网课程环境使用 CloudBase。团队为 A（杨凤琴）、B（孙瑞）、C（姜澜）。

**交付方向（2026-10-29）**：以 Android / iOS App 为主，H5 用于开发、课堂展示及备用访问；暂停微信小程序正式发布。现有微信源码和构建暂保留作兼容回归，本次不删除功能或调整构建依赖。

**[团队周报（监督查看）](docs/weekly-log.md)** · [main 固定周报入口](https://github.com/yangfengqin406/group-project/blob/main/docs/weekly-log.md) · [验证记录](docs/verification.md)

**使用原账号请打开 [CloudBase H5](https://happy-catfish-d6gyn3ykcd75cb823-1522847218.ap-shanghai.app.tcloudbase.com/#/)。** Android 与该页面共用 CloudBase 后端。[GitHub Pages 演示](https://yangfengqin406.github.io/group-project/#/)使用本机虚构数据。

## 当前交付状态（2026-11-06）

| 项目 | 已完成与证据 | 仍待完成 |
| --- | --- | --- |
| Android | **0.1.6（code106）** 已验签，修复启动时调用缺失的 Push 模块。默认连接 CloudBase，保留前台私信提示和红色未读数。公网安装包已完整下载并核对哈希。[安卓下载页](https://happy-catfish-d6gyn3ykcd75cb823-1522847218.ap-shanghai.app.tcloudbase.com/app-download.html) · [交付与校验](docs/app-release-2026-10-27.md) | 真机覆盖安装、锁屏通知及应用商店分发待办 |
| iPhone | 0.1.4 对应 iOS 编译预检通过，iPhone 可通过浏览器使用课程版。[验证证据](docs/assets/app-cloudbase-2026-11-05/verification.json) | Apple 会员、签名与原生安装分发待办 |
| 真实后端 | CloudBase 已部署并核验原账号、帖子、私信、回执和上传。公网临时账号通过登录、互助、图片权限与私信验收。[部署与验证](docs/cloudbase-deployment.md) | 课程环境的长期运营、关机与多台真机验收另行记录 |
| H5 备用 | [CloudBase H5](https://happy-catfish-d6gyn3ykcd75cb823-1522847218.ap-shanghai.app.tcloudbase.com/#/)与 Android 共用账号和数据，已更新广场私信角标。[GitHub Pages 阶段演示](https://yangfengqin406.github.io/group-project/#/)使用本机虚构数据 | 真机浏览器体验另行验收 |

## 最近合并与分支边界

- **A（杨凤琴）**负责互助、珍珠、App 适配和三方整合。main 已包含互助、本人待办、衣柜直接兑换和 App 构建，以及 0.1.3 减少冷启动小屋重复读取的代码。[PR #45](https://github.com/yangfengqin406/group-project/pull/45) · [PR #47](https://github.com/yangfengqin406/group-project/pull/47)
- **B（孙瑞）**负责二手、账号和个人资料，并协作统一搭子发布和检索的五类选项，保留技能求助自由输入和历史分类兼容。[PR #43](https://github.com/yangfengqin406/group-project/pull/43)
- **C（姜澜）**负责私信与失物。main 已包含前台未读检查、可点击提醒、自动刷新，以及手机系统通知开关、设备绑定和推送桥源码。CloudBase 课程环境尚未启用离线推送。[PR #44](https://github.com/yangfengqin406/group-project/pull/44) · [PR #48](https://github.com/yangfengqin406/group-project/pull/48) · [系统通知配置](docs/app-system-push.md)

[PR #49](https://github.com/yangfengqin406/group-project/pull/49) 汇总已部署的 CloudBase 适配源码及最新广场私信体验。新消息提示位于广场操作栏上方，私信入口显示红色未读数，阅读后按会话扣减，归零后隐藏。A（杨凤琴）负责集成，私信原功能归 C（姜澜）。[团队周报](docs/weekly-log.md) · [验证记录](docs/verification.md)

## App 构建与安装

App 构建使用 Node.js **22.22.0**。先安装依赖，再填写实际服务地址和 DCloud AppID。[完整打包步骤](docs/app-release-2026-10-27.md)

```powershell
npm ci
$env:CAMPUS_APP_ORIGIN='https://your-service.example'
$env:CAMPUS_DCLOUD_APP_ID='__UNI__YOUR_OWN_ID'
npm run build:app
```

构建配置留在本机。命令输出为 `dist/app/<时间戳>/` 中的 HBuilderX 源码项目及 Android/iOS 编译资源，签名安装包由 HBuilderX 另行生成。[App 交付记录](docs/app-release-2026-10-27.md)

## 开发与 H5 备用

在项目根目录使用 Node.js **22.22.0**：

```bash
npm ci
npm run campus:local
```

打开终端显示的8788地址注册独立账号，上传和业务数据保存于本机 SQLite/文件目录；同网络设备使用主机网卡地址，不能使用手机自身的127.0.0.1。该账号未核验学籍。默认演示开发使用 `npm run dev:h5`，不连接真实后端；[部署说明](docs/deployment.md)区分两种模式。

App 和真实 H5 共用后端。面向不同网络的手机访问时，后端需持续提供可达的 HTTPS 服务；GitHub Pages 的静态页面不能存储大家共用的真实账号或帖子。[H5备用方案](docs/h5-backup-and-release.md)仍供展示及故障切换参考。

## 功能与展示

- 四栋业务房子为二手集市、找搭子、失物招领和自己的家；消息属于底部栏目。跨模块联系进入同一个消息中心，并保留原内容链接。
- 真实版支持独立账号、头像/物品图片、公开资料、本人发布/收藏、二手闲置与求购、预约交接、搭子邀请及失物评论/归还。参考估价是类别/成色规则，不冒充图片识别。
- 虚拟伙伴支持四种预设、命名配色和原创正背面 PNG/像素画稿，衣柜七类共 23 件。钓鱼、三关潜水及存档已接入真实服务，贡献奖励与衣柜直接兑换见[需求](docs/requirements.md)。
- 歇脚亭提供三人真实访客斗地主，无机器人填位或货币下注；需独立牌桌服务，三台物理设备仍待验收。
- 校园活动目前是明确标注的虚构样例，未接入真实活动报名。后台私信推送的开通条件和验收流程见[手机系统通知](docs/app-system-push.md)。
- [10～11分钟演讲稿与操作流程](docs/showcase-10min-2026-10-27.md)、[部署候选与展示包](docs/release-2026-10-27.md)保留；现场使用前按实际版本重新排练。
- 11 月 1 日，用户确认华为手机的 0.1.3 能登录，伙伴、衣柜和背景音乐正常。[设备反馈](docs/assets/app-latency-2026-10-30/device-feedback-2026-11-01.json) · [项目头像](docs/assets/app-avatar-2026-10-25/app-avatar-v1.png) · [场景素材](docs/plaza-assets.md) · [音乐许可](docs/music-credits.md)

## 目录与三人分工

| 目录 | 用途 | 协调人 |
| --- | --- | --- |
| src/pages/plaza、partner、help | 广场、搭子、技能互助 | A（杨凤琴） |
| src/pages/market、home、profile | 二手、账号、个人资料 | B（孙瑞） |
| src/pages/lost、messages | 失物、留言、消息 | C（姜澜） |
| src/pages/content | 共用发布/详情，修改需同步 | A/B/C 协调 |
| src/services | 模块接口调用，按模块归属 | 对应模块负责人 |
| src/services/transport.js、config | 请求与环境配置 | B 协调 |
| src/components、styles | 共用 UI 和风格 | A 协调 |
| src/mock | 演示实现，正式后端不放这里 | 各模块负责人 |
| src/rooms/landlord、server/landlord | 三人斗地主分包页面、独立局域网访客与内存牌局服务；不替代校园后端 | A（杨凤琴） |
| docs、tests、.github | 说明、验证与协作 | 全组 |

开始开发请看 [docs/start-here.md](docs/start-here.md)。后端接入看 [docs/backend.md](docs/backend.md)。最终提交看 [docs/deployment.md](docs/deployment.md)。

需求、数据模型、接口、实现边界、验收与协作说明均在docs/；[tasks.csv](tasks.csv)按团队分工记录进度，监督人统一查看[main团队周报](https://github.com/yangfengqin406/group-project/blob/main/docs/weekly-log.md)。A对B/C共用页面的边界修复或画风协作不改写原业务归属。

## 检查与兼容构建

```bash
npm run check
npm test
npm run build:h5
npm run build:mp-weixin
npm run check:mp-styles
npm run check:mp-quality
```

H5 产物位于 `dist/build/h5`，微信兼容产物位于 `dist/build/mp-weixin`，App 编译预检使用 `npm run build:app`。构建、签名、真机和分发结果分别记录。提交时保留 `package-lock.json`，构建产物、数据库、私有配置、证书和 `node_modules` 保留在本机。

<details>
<summary>微信历史开发说明（暂停正式发布，保留兼容）</summary>

以下仅供已有构建回归及历史排查，不是当前 App 交付入口。

微信小程序开发：

```bash
npm run dev:mp-weixin
```

在微信开发者工具中导入 `dist/dev/mp-weixin`，用你们自己的 AppID。`src/manifest.json` 的 `mp-weixin.appid` 需要在实际接入时统一填写；个人工具私有配置不要提交。

发布构建用 `npm run build:mp-weixin` 并导入 `dist/build/mp-weixin`。若缺少 `app.json`，核对是否选了编译目录；若白屏，先看工具 Console 的红色错误。构建后运行 `npm run check:mp-styles` 排查不兼容通配选择器，uni-app构建不能代替微信自身WXSS编译或真机验收。

微信代码质量的组件按需注入与牌桌私有JS分包位置通过 `npm run check:mp-quality` 定向检查；构建后在工具“代码质量”中重新扫描，完整扫描结果另记。若仍显示旧接口错误，只清除编译缓存再编译，保留存储、账号与授权；本机地址的令牌独立，需登录原账号。真实衣柜的奖励、兑换、穿戴和重登读取现已接入，需重新构建并连接本轮后端。

**微信电脑模拟器连接本机真实后端**：使用Node22运行 `npm run campus:weixin`。命令先确认或启动SQLite后端，再以 `127.0.0.1:8788` 构建微信目录，避免换Wi-Fi后仍请求旧IP；若本命令启动了后端，终端需保持运行。回工具重新编译并登录已有独立账号。局域网HTTP调试需在工具本地设置关闭域名校验，正式发布仍需HTTPS；手机不能使用电脑的127.0.0.1，改用当前WLAN地址，见[部署步骤](docs/deployment.md#微信本机模拟器真实服务调试)。

</details>

提交前阅读 [协作规则](docs/collaboration.md)，在人员分支工作并提 PR；main 与 A/B/C 长期工作分支均保留。进度记录在 [tasks.csv](tasks.csv)及唯一团队周报，不另建个人周报。
