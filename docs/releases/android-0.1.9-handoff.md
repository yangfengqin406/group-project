# Android 0.1.9 源码、运行时与 H5 交付

整理日期：2026-11-18（北京时间）。Android版本为0.1.9/code109；源码归档tag为`android-0.1.9-source`，与原APK标签`android-0.1.9`分开，原标签不移动。代码与文档通过交付分支`codex/release-019-source-handoff-20261118`的[PR #53](https://github.com/yangfengqin406/group-project/pull/53)同步到main；在main分支查看本记录时即已随该PR合入，审阅分支阶段以PR实际状态为准。[源码标签](https://github.com/yangfengqin406/group-project/tree/android-0.1.9-source) · [全部交付附件](https://github.com/yangfengqin406/group-project/releases/tag/android-0.1.9)。

## 交付文件

| 文件名 | 内容与用途 |
| --- | --- |
| [campus-plaza-0.1.9-source.zip](https://github.com/yangfengqin406/group-project/releases/download/android-0.1.9/campus-plaza-0.1.9-source.zip) | 可继续开发的uni-app源码、真实后端、测试、脚本和公开文档；不含前端依赖、实际账号数据或私有打包配置。 |
| [campus-plaza-0.1.9-cloudbase-runtime.zip](https://github.com/yangfengqin406/group-project/releases/download/android-0.1.9/campus-plaza-0.1.9-cloudbase-runtime.zip) | 已验证的302文件CloudBase运行时，含同源真实H5；保持原文件字节，供既有环境代码更新。 |
| [campus-plaza-0.1.9-h5.zip](https://github.com/yangfengqin406/group-project/releases/download/android-0.1.9/campus-plaza-0.1.9-h5.zip) | 与运行时 `public` 相同的H5静态文件，ZIP根为 `index.html`、`assets`、`static` 等；需由同源真实后端提供API。 |
| [SHA256SUMS.txt](https://github.com/yangfengqin406/group-project/releases/download/android-0.1.9/SHA256SUMS.txt) | 源码、运行时、H5及既有APK/二维码的SHA-256；源码ZIP由对应tag提交导出，清单放在包外避免循环自哈希。 |

源码包采用明确白名单导出，保留 `src`、`backend`、`server`、`scripts`、`deploy`、`uniCloud-aliyun`、`tests`、`docs`、仓库工作流、锁文件与安全的 `.env.example`。排除 `.git`、`.release-private`、`node_modules`、`dist`、`unpackage`、数据库/上传、运行日志、真实 `.env`、真实 `cloudbaserc.json`、个人工具配置、私钥、keystore及厂商私有配置，拒绝链接和包外路径。App生成音频沿用既有构建脚本；原始配乐及署名保留在源码中。

运行时ZIP直接包含以下根目录结构，不能再套一层外目录：

```text
backend/
server/landlord/
src/domain/
src/utils/
public/
package.json
scf_bootstrap
```

ZIP共306项，其中302项为原运行文件，另4项为部署说明、空配置模板及许可；H5 ZIP共240项，其中237项原文件、3项说明/许可。源码ZIP由Git按仓库行尾规范归档，业务源码按LF规范化后核对；运行时ZIP保留原始字节。302文件来自0.1.9已验证运行时。11月18日离线重算该清单的字节数和SHA-256，302项全部匹配；这项离线核对未访问CloudBase。原部署目录外的私有 `cloudbaserc.json` 和部署前计划文件不进入ZIP，也不作为当前上线状态的证据。

## 源码安装与本地构建

使用Node.js **22.22.0**。接收方在源码根目录安装锁定依赖，再执行检查；`npm ci`会访问依赖源。本交付文档的命令是接收方操作步骤，不代表本轮已经全部执行。

```powershell
node --version
npm ci
npm run check
npm test
npm run build:h5
npm run build:mp-weixin
```

默认H5开发/构建使用mock，每个浏览器独立保存虚构记录。需要本机真实HTTP业务时，指定新的空测试数据目录后运行：

```powershell
$env:CAMPUS_DATA_DIR = '<新的空测试目录绝对路径>'
npm run campus:local
```

该命令构建同源H5并启动本机SQLite后端，地址以终端输出为准；自己注册测试账号，保留后端终端。不要把手机自身的 `127.0.0.1` 当成维护电脑或公网服务。

`node scripts/build-cloudbase.mjs`可在本地重新生成运行时及同源 `/api`、`/game` 的真实H5，但不会自动部署。新编译文件需另行校验，不能沿用原302文件的哈希作为新结果。旧 `build-release.mjs` / `package-release.mjs` 仍含20261027展示与本机微信流程，不直接用于这次源码归档。

## App身份注入与安装

仓库 `src/manifest.json` 保留0.1.9/code109，AppID保持空配置。维护者通过构建环境注入原DCloud身份和公开HTTPS源：

```powershell
$env:CAMPUS_APP_ORIGIN = 'https://your-service.example'
$env:CAMPUS_DCLOUD_APP_ID = '__UNI__YOURID'
$env:CAMPUS_APP_PUSH = 'true'
npm run build:app
```

示例值须替换为维护者提供的值。构建会把公开接口地址和能力开关写入生成的HBuilderX工程，同时准备Android/iOS编译资源；不把CloudBase管理密钥写进 `VITE_` 变量。原包名、DCloud AppID、云端签名证书及厂商绑定由维护者在官方打包流程保持，源码包不附私钥或账号密码。`CAMPUS_APP_PUSH=true`保留019的SDK选项，云端后台/锁屏推送仍未启用。

已发布的[0.1.9 APK与二维码](https://github.com/yangfengqin406/group-project/releases/tag/android-0.1.9)属于11月14日交付记录。手机可按系统提示覆盖安装，再用新课程环境已有账号登录；曾保存旧服务源的先在“测试服务地址”恢复默认并重启。11月13日以前的旧环境账号与数据未迁入新环境。安装后仍需实机验证首次联系、文字提示、各入口红点/已读、Wi-Fi和流量及原有伙伴/衣柜/玩法。

## CloudBase部署与回退

运行时使用Node.js 22内置模块，不需要安装前端依赖。HTTP函数默认监听9000；`scf_bootstrap`在 `/var/user` 启动 `backend/cloudbase/entry.mjs`，根路径 `/` 必须转发至函数并保留完整路径。

服务端所需配置名为 `CAMPUS_CLOUDBASE_ENV`、`CAMPUS_CLOUDBASE_KEY`、`CAMPUS_PUBLIC_ORIGIN`，以及可选的 `CAMPUS_CLOUDBASE_TABLE`、`CAMPUS_CLOUDBASE_BUCKET`、`PORT`、`CAMPUS_STATIC_ROOT`。实际值仅由维护者在私有环境配置。更新既有环境时只换代码，保留原状态表、私有桶、环境变量、路由和权限，不重新初始化、清库或导入演示数据。全新空环境不会自动初始化，须另行制定并批准表/桶/权限与初始化方案。

部署前保留旧运行时及其哈希，并单独保留服务端配置和数据的私有备份。需要回退时，先核实旧代码是否兼容当前联系事件和已有业务状态；确认兼容后只回退代码，保留当前数据。不要用旧数据库快照覆盖新账号、新消息或新存档。App回退另核实版本码、签名及本机数据兼容，不能把卸载清数据作为通用操作。具体云更新、在线检查和回退按维护者批准的范围执行。

## H5入口与额度

| 入口 | 数据模式与当前说明 |
| --- | --- |
| [CloudBase真实课程H5](https://golden-tahr-d5gk8koz72e46de2a-1530477186.ap-shanghai.app.tcloudbase.com/#/) | 与019配套的真实账号和共享业务；资源和API请求会使用CloudBase额度。11月18日未打开或请求该入口，当前可用性未复核。 |
| [GitHub Pages课程演示](https://yangfengqin406.github.io/group-project/#/) | 静态页面与浏览器本机虚构数据，身份切换不是实际登录，记录不跨设备共享。 |
| 本机 `campus:local` | 真实HTTP+SQLite规则，使用所选本机测试目录，不连接CloudBase。 |

H5 ZIP不能通过双击 `index.html` 获得真实服务。应由同一HTTPS源提供静态页面、`/api`与`/game`；单独上传到GitHub Pages不会部署账号、上传、消息或数据库。本轮没有云端访问许可，未重新请求真实页面或健康接口；如需线上复核，先说明访问/验收范围并取得同意。超额按量、自动续费、定时扫描和推送工作器沿用11月14日的关闭状态，本轮未修改云配置。

## 素材许可与成果归属

保留[音乐署名与许可](../music-credits.md)、[广场素材来源](../plaza-assets.md)及实际随包的第三方许可。Carefree配乐由Kevin MacLeod创作，沿用CC BY 4.0署名和压缩说明，不能记作团队原创；压缩/归档不得去掉来源说明。项目自身的使用范围以仓库实际许可与维护者授权为准，不另行宣称第三方资源版权。

A（杨凤琴）负责协作整合、打包与归档说明；B（孙瑞）账号/二手、C（姜澜）私信等原业务成果归属保持。本说明与唯一[团队周报](../weekly-log.md)随本次PR交付，不另建个人周报。

## 已有证据与尚待完成

11月13日至14日的历史记录包括：724项测试中723通过、1项Windows符号链接权限跳过，H5/微信及Android/iOS编译预检，隔离浏览器五组流程，51项APK检查、原证书v1/v2验签、公开APK完整下载哈希核对，以及更新1个现有API后的1次健康和18次RPC验收；测试账号已注销。详见[验证记录](../verification.md#2026-11-14-安卓019与配套后端交付)。这些数字不作为11月18日重新运行的结果。

本轮已整理固定交付入口、归档/构建/许可/部署说明，并离线确认302文件运行时一致；三个ZIP及SHA清单的生成和归档复核、新一轮本地检查、PR/main同步与源码tag发布尚待整合任务实际完成后补录。物理手机完整验收、后台/锁屏通知及iOS签名分发仍未完成，不由源码归档或编译成功推定。
