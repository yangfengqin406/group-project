# 校园生活广场 · App 项目

**Android 0.1.3/code103测试包已生成（2026-10-30）**：名称「校园生活广场」和原兔子图标保留，冷启动小屋相关读取由7次减至4次。23:49:22官方打包成功；27项包内检查、原身份/旧证书与v1/v2验签、提交时完整app-service.js指纹匹配通过，23:51:42完整公网下载SHA一致。[APK证据](docs/assets/app-latency-2026-10-30/apk-verification-2026-10-30.json)与[557项源码CI](https://github.com/yangfengqin406/group-project/actions/runs/41076830383)可查。新包手机卡顿/超时、声音及实际切源重启仍待验；未上架商店，iOS无IPA。

**后端仍在电脑**：原账号、帖子、珍珠/衣柜与上传保存在维护电脑的SQLite/文件目录，临时HTTPS仅转发请求。已准备无真实数据的0.1.3服务器部署包并通过11项隔离HTTP及校园数据重启验收，[来源与SHA](docs/assets/server-package-2026-10-30/verification.json)可查；尚未购买/部署云服务器或迁移原账号，电脑停止后当前服务仍不可用。

面向校园的互助与生活信息应用，提供求助、搭子、二手和失物信息，以像素小镇、虚拟伙伴和装扮形成温暖的使用体验。使用 **uni-app + Vue 3 + JavaScript**，真实服务采用 **Node.js 22 + SQLite**。团队为 A（杨凤琴）、B（孙瑞）、C（姜澜）。

**交付方向（2026-10-29）**：以 Android / iOS App 为主，H5 用于开发、课堂展示及备用访问；暂停微信小程序正式发布。现有微信源码和构建暂保留作兼容回归，本次不删除功能或调整构建依赖。

**[团队周报（监督查看）](docs/weekly-log.md)** · [main 固定周报入口](https://github.com/yangfengqin406/group-project/blob/main/docs/weekly-log.md) · [验证记录](docs/verification.md)

## 当前交付状态

| 项目 | 已完成与证据 | 仍待完成 |
| --- | --- | --- |
| Android | 0.1.3签名APK、27项核验及原身份/证书、完整编译指纹和完整公网下载SHA匹配；[最终证据](docs/assets/app-latency-2026-10-30/apk-verification-2026-10-30.json) | 新包真机卡顿/超时、声音与实际切源重启待验，未上架商店 |
| iPhone | 独立0.1.3 Android/iOS编译预检通过，[源码证据](docs/assets/app-latency-2026-10-30/source-verification.json)可查 | Apple会员/签名及分发未完成，无IPA |
| 真实后端 | 原库账号/上传保留，0.1.3无数据部署包及11项隔离HTTP验收通过；[部署记录](docs/deployment.md) | 当前SQLite与上传仍在电脑，未云部署/迁库；固定HTTPS、运维和手机完整验收待完成 |
| H5 备用 | [main 阶段演示](https://yangfengqin406.github.io/group-project/#/)；可在本机连接真实服务 | GitHub Pages 使用虚构本机演示数据，不能替代真实多人后端 |

## 最近合并与分支边界

- **B（孙瑞）**：[PR #43](https://github.com/yangfengqin406/group-project/pull/43) 已合入 main。搭子发帖使用五类必选按钮，发布/检索共用分类；技能求助仍可自由输入，历史分类兼容。属于 B 对搭子模块的协作，不改写 A 的原模块归属。
- **C（姜澜）**：[PR #44](https://github.com/yangfengqin406/group-project/pull/44) 已合入 main。前台约每5秒检查私信，底栏/广场未读角标、可点击/收起的提示及聊天自动更新已接入，保留草稿和历史；关闭应用后不提供离线推送。
- **A（杨凤琴）**：[PR #42](https://github.com/yangfengqin406/group-project/pull/42) 已合入 A 的 `codex/a-plaza-partner-pets`：完整互助、珍珠激励、本人待办、原画风融合及 App 适配。[PR #45](https://github.com/yangfengqin406/group-project/pull/45) 申请将 A 合入 main，当前有合并冲突，尚未完成。main 当前还不能使用 A 新增的 `build:app` 脚本；也不能把 A 的520项测试视为含 B/C 新变更的整合验收。

公开发帖与完成互助奖励、衣柜取消通关兑换门槛及原卡片内嵌互助/珍珠，均以 [A 分支设计](https://github.com/yangfengqin406/group-project/blob/4ca2a416985a075c53a2c0a0a58bda5600f3cd89/docs/superpowers/specs/2026-10-27-campus-contribution-design.md)和[效果图](https://github.com/yangfengqin406/group-project/blob/4ca2a416985a075c53a2c0a0a58bda5600f3cd89/docs/assets/original-style-integration-2026-10-28/home-original-desktop.png)为准，待 PR #45 整合后才成为 main 功能。旧 APK 和已运行服务不会因合并源码自动更新。

## App 构建与安装

App 源码及[完整步骤](https://github.com/yangfengqin406/group-project/blob/4ca2a416985a075c53a2c0a0a58bda5600f3cd89/docs/app-release-2026-10-27.md)目前在 A 分支。下面的编译命令仅在包含 App 适配的分支执行，需先使用 Node.js **22.22.0** 并安装依赖：

```powershell
npm ci
$env:CAMPUS_APP_ORIGIN='https://your-service.example'
$env:CAMPUS_DCLOUD_APP_ID='__UNI__YOUR_OWN_ID'
npm run build:app
```

实际服务地址和AppID留在本机私有配置。命令输出为 `dist/app/<时间戳>/` 中的HBuilderX源码项目及Android/iOS编译资源，**不是签名安装包**。本轮另经云打包生成0.1.3签名APK，并通过完整公网下载哈希核对；编译、验签、真机与iOS签名分发按[交付记录](docs/app-release-2026-10-27.md)分别登记。

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
- 虚拟伙伴支持四种预设、命名配色和原创正背面PNG/像素画稿，衣柜七类共23件；钓鱼、三关潜水及存档已接入真实服务。贡献奖励和直接兑换的新规则见上方 A 分支状态。
- 歇脚亭提供三人真实访客斗地主，无机器人填位或货币下注；需独立牌桌服务，三台物理设备仍待验收。
- 校园活动目前是明确标注的虚构样例，未接入真实活动报名。应用后台/关闭后的系统推送未实现。
- [10～11分钟演讲稿与操作流程](docs/showcase-10min-2026-10-27.md)、[部署候选与展示包](docs/release-2026-10-27.md)保留；现场使用前按实际版本重新排练。
- [项目头像](docs/assets/app-avatar-2026-10-25/app-avatar-v1.png)、[场景素材记录](docs/plaza-assets.md)、[音乐署名与许可](docs/music-credits.md)可查。已安装0.1.0的声音问题仍待新版包验证，不能用浏览器有声代替 App 真机结果。

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

当前 main 保留上述 H5/微信回归；App 编译预检在 App 适配分支使用 `npm run build:app`。H5 产物位于 `dist/build/h5`，微信兼容产物位于 `dist/build/mp-weixin`。构建成功、签名安装、真机验收和正式分发分别记录，不互相替代。产物、数据库、私有配置、证书和 node_modules 不提交，package-lock.json 必须保留。

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
