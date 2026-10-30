# 期末交付与双端部署

## 2026-10-30 App后端部署包与当前运行边界

已从bda2ddb/0.1.3源码重新生成`campus-server-0.1.3-20261030.zip`，8,872,456字节、747文件，SHA256为`14ddad41e0e5caae61b031e4b9278cfdce26bfea89dfeb24c8144b607e398ba8`，本轮重新计算ZIP哈希与交付receipt一致。包内包含同源真实H5、`/api`与`/game`服务及现有nginx/systemd/环境变量模板；Node.js22.22.0需另行安装。文件SHA清单及禁止项扫描已通过，无原账号数据库/上传/凭据、node_modules、真实AppID或临时域名；包内旧20261027文档已标历史，应先读“请先阅读.txt”和release.json。

独立临时空库先确认0账号，再以两个新虚构账号完成11项真实HTTP检查：实际上传字节、私有权限和公开关联/发帖奖励、B（孙瑞）学习分类、A（杨凤琴）互助申请/选人/双方确认及珍珠/衣柜、C（姜澜）真实未读、牌桌访客/大厅，以及关闭重启后的账号/内容/图片/余额/未读保留；SQLite完整性ok。临时验收数据已删除，原账号库未打开。反向代理仅使用本机模拟HTTPS头，未实际运行Linux/nginx/systemd或部署TLS/DNS；不当作真机、云部署或生产负载验收。[脱敏元数据与逐项结果](assets/server-package-2026-10-30/verification.json)。

这只是可部署的新包。当前真实账号与上传仍在维护电脑，尚未购买云环境、尚未迁移数据库或建立固定公网服务；电脑停止后临时后端仍不可用。部署/迁移、固定HTTPS与手机体验需要在实际环境继续验证，不能写为已独立上线。A（杨凤琴）协调本轮打包/隔离验收，B/C原业务归属不变；PR #47草稿未合A/main，根工作区仅同步交付记录，未复制候选业务。

10月27日手机续验：用户选择各用流量/不同Wi-Fi，已建立独立虚构数据的临时HTTPS真实服务，华为H5与开启调试后的原生微信场景/伙伴获实际确认。见[手机预览步骤](phone-preview.md)，不同于原8791回环演示；正式固定域名和审核仍未完成。

跨Windows→Linux迁移仍须执行以下核对；这些是前置条件，**当前没有实现或执行迁移工具、没有改写原库**：

1. SQLite使用WAL，先停写并形成一致备份，再在目标完整恢复和校验，不能在线仅复制主db而漏掉WAL。保留原账号ID、盐化密码、角色/会话、关联内容与珍珠/衣柜，以及`c_receipts`幂等回执和`c_settings.cursor_secret`；空部署包不会自动带入原账号。
2. `campus.uploads.filePath`与`campus.file_cleanup.filePath`都保存绝对路径。须核对filename/imageId/owner、文件SHA和目标目录边界后精确映射，并保留图片ID、归属和状态；**在目标首次启动前完成**，因为privacy启动会执行待清理任务且注销会检查目录。只复制库/uploads或只改URL不足以保留原图和清理行为。
3. 固定HTTPS和自管图片URL/引用（含头像、内容及回执）需精确迁移，不全库盲替换或改外站地址；配置Node.js22、数据目录权限、Nginx/systemd与实际可信代理，并验新域Cookie和图片权限。App换API源会隔离旧令牌、要求重新登录，原账号复用取决于原库正确迁入。
4. 珍珠奖励日界显式使用UTC+8，不依赖Linux时区，但服务器时钟须准确；会话及计划/活动局按绝对时间到期，停机不自动冻结。斗地主访客/队列/牌局/回执在进程Map中，迁移或重启须重新开局，不能当作SQLite校园数据或衣柜存档可恢复。

原部署ZIP及SHA保持不变；已完成的同目录本机重启验收不等于上述跨系统迁移、云TLS或运维已完成。

## 2026-10-27 新入口

[展示与部署包](release-2026-10-27.md)包含固定真实构建脚本、Windows便携8791服务、空数据正式部署模板；[展示手册](showcase-2026-10-27.md)提供流程/演讲稿/答辩。源码已适配HTTPS公共源与可信代理，实际公网部署与微信审核尚未完成；下文较早评估按日期阅读。

微信审核前先按[H5备用方案与上线条件](h5-backup-and-release.md)提供固定浏览器入口；公网演示、现场真实业务与正式运营分别交付，当前源码已适配HTTPS公共源和可信代理，实际环境仍需按发布说明部署与验收后再开放。

## 微信本机模拟器真实服务调试

2026-10-26模拟器实测：同机127.0.0.1健康200，而当前LAN请求返回502；电脑直接请求两者均200。故电脑模拟器继续使用回环地址，不要求把校园WLAN改为专用网络，不更改系统代理/防火墙。LAN失败的具体代理环节未确证，手机同网可达性仍需另验。

先使用Node.js22.22.0，再运行：

```bash
npm run campus:weixin
```

命令验证本机 `/api/health`：未启动时用原数据库/上传目录启动服务，已运行时只复用已确认的真实校园后端；502、错误JSON或陌生服务不会被当成已就绪。随后构建 `dist/build/mp-weixin`，API和牌桌固定到同机127.0.0.1。回微信工具点击编译，并保持提供后端的终端运行；重新编译小程序不会自动启动Node服务。局域网HTTP仅供开发，在工具本地设置关闭域名/TLS/HTTPS证书校验，不改系统代理或防火墙，正式上线恢复合法HTTPS配置。

手机调试在PowerShell设置 `$env:CAMPUS_WEIXIN_HOST = '<当前电脑WLAN的IPv4>'` 后重跑命令；公共图片仍使用服务端选定的LAN源。电脑换网卡IP需重新构建手机地址，127只供同机模拟器。可用 `CAMPUS_PUBLIC_HOST` 显式指定公共文件源；自动候选已排除169.254等未配置接口。`CAMPUS_PORT` 可选其他端口。切换API地址会使用不同令牌存储键，需要重新登录，账号数据库不会清空；旧IP图片URL迁移边界仍按下文说明。

重新构建后，工具可只清除“编译缓存”再编译，勿清空存储或授权。微信代码质量定向检查为 `npm run check:mp-quality`：验证产物按需注入，以及斗地主专用服务只放rooms分包；它不能替代工具完整扫描。源码服务仍在src/services，Vite仅对微信打包位置做调整，H5规则不变。CI在微信构建后执行此检查。

本机H5可始终从 `http://127.0.0.1:8788/#/` 打开，再由服务跳到当前公共地址。微信工具的CLI服务端口仅用于自动化，与校园8788后端不是同一服务；不必为正常手动调试开启CLI安全端口。

课程要求：Web 必须有可访问 URL；小程序最好审核通过，开发阶段或无法审核时必须提供 H5 替代。建议从第一周就打通 H5 部署，不把最后一天押在审核上。

## GitHub Pages 阶段演示（2026-10-22）

部署入口：[校园生活广场 H5](https://yangfengqin406.github.io/group-project/#/)。10月22日[PR #17](https://github.com/yangfengqin406/group-project/pull/17)合入后，[首次发布](https://github.com/yangfengqin406/group-project/actions/runs/39803225930)的 build/deploy 均成功，HTTPS 首页实际返回200。以后当前版本以[发布工作流](https://github.com/yangfengqin406/group-project/actions/workflows/deploy-h5.yml)最近一次成功运行为准；详细验收见[验证记录](verification.md)。

此站只展示 main 已审阅的 A/B/C 阶段成果，固定使用本机演示数据。页面中的账号、消息、发布和装扮记录只保存在各自浏览器，不能跨设备同步，不是真实校园业务上线。2026-10-24 A的PR #15及B的PR #20均已审阅合入main，自动重新部署的结果以对应Actions运行状态为准。

本轮新增的斗地主需要独立Node牌桌服务；GitHub Pages只托管静态H5，不会运行`server/landlord`，目前没有公网牌桌地址。未配置`VITE_GAME_BASE_URL`时页面明确不能匹配，不填虚构在线人数；本地试玩按下节启动。此说明不代表本轮代码已经合入main或重新发布。

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

## 局域网三人斗地主（本轮本地实现）

需要一台安装Node.js 22.22.0的主机保持运行，三位玩家连接同一Wi-Fi。校园发布、账号、消息及装扮仍使用各自浏览器的mock数据；只有牌桌访客、排队和出牌通过主机真实HTTP服务同步。它不是B（孙瑞）的校园认证后端，不声称全站已接真实数据。

1. 主机在项目根目录执行：

   ```bash
   npm ci
   npm run game:local
   ```

   脚本先以`VITE_API_MODE=mock`、`VITE_GAME_BASE_URL=/game`、根资源路径构建H5，成功后启动`server/landlord/index.mjs`。默认监听`0.0.0.0:8787`，同源托管`dist/build/h5`和`/game/rpc`；主机终端会打印本机及各网卡地址。

2. 三台设备各自打开终端中与当前Wi-Fi对应的“同Wi-Fi设备打开”链接，格式为`http://<主机当前IPv4>:8787/#/`。IP以这次终端输出为准；有多张网卡时选择Wi-Fi/热点的地址，不能把VPN/虚拟网卡地址发给同学。`0.0.0.0`是监听地址，`127.0.0.1`只适用于主机自己，都不是给其他手机的地址。
3. 从广场进入“亭子 → 去亭子匹配”，每台填写昵称并“坐下看看”，再点“开始三人匹配”。在线人数来自有效访客心跳，凑齐三位排队真人才开桌；没有机器人补位。三张同一浏览器标签可能共享访客令牌，不能当成三位独立玩家的验收依据。
4. 依次叫分选地主、选择手牌出牌或过牌，检查三端轮次、已出牌及剩余张数一致。正常回合20秒；超时、离线或主动离开会显示托管，返回后可“我来接手”。结束后可回亭子再匹配，无珍珠、装扮或真实货币输赢。
5. 试玩期间保持主机与终端运行。`Ctrl+C`停止服务；重启会清空全部访客、队列、牌桌和操作回执，需要重新入座。结束桌10分钟后、活动旧局最长30分钟后收起；无牌桌闲置访客6小时后清理。

仅当已经有本轮正确配置的`dist/build/h5`时，才可用`npm run game:serve`直接托管；该命令不构建，也不改变产物里的接口地址。代码或公开配置修改后重新运行`npm run game:local`构建，不要以为刷新网页会重新编译。Node监听参数可由主机环境变量`GAME_HOST`和`GAME_PORT`调整，默认分别为`0.0.0.0`、`8787`；它们不属于VITE前端配置。

连接排查先从主机自身链接开始：若页面提示文件不存在或服务未配置，确认已执行`game:local`且打开了8787端口的新产物；若主机能开、手机打不开，检查是否同一Wi-Fi、主机防火墙是否允许Node在当前可信专用网络接受连接、主机是否休眠。校园/访客Wi-Fi可能启用客户端隔离，可改用允许设备互访的个人热点；不用关闭全部防火墙。手机能开页面但不能联机时，检查终端服务是否仍运行及是否误开GitHub Pages/旧构建地址。

当前仅有本地实现与回归依据，三台物理设备同Wi-Fi实测、公网牌桌部署和微信联网仍未验收；执行后应在`verification.md`记录主机地址/版本、设备与结果。公网部署还需另行安排HTTPS、访问来源、进程运行及持久化方案；不能把本机IP当成老师可长期访问的交付链接。

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

斗地主的`/game`相对地址用于局域网同源H5，不能直接当微信小程序服务地址。微信联机需另部署可访问的HTTPS牌桌服务，构建时配置绝对`VITE_GAME_BASE_URL`、平台网络域名白名单及服务访问来源，并进行开发者工具和真机验收；目前均未接入。网络配置参见[uni.request官方说明](https://uniapp.dcloud.net.cn/api/request/request.html)，工具中关闭校验的结果不能计为正式发布通过。

## 最终提交物

微信构建后运行 `npm run check:mp-styles`，阻断已知的WXSS通配选择器兼容错误；检查与部署CI均已加入此步骤。它不是完整微信编译器。10月26日潜水样式引起的白屏已修复，并用本机微信编译器验证全部32份样式通过，证据见 verification.md；模拟器与真机画面仍按实际执行记录。

构建后运行`node scripts/report-build-size.mjs`或`--json`复核目录体积，并运行`node scripts/check-weixin-package.mjs`；每包2MiB原始目录预算检查已加入PR与main部署工作流。本轮新增`rooms`独立分包容纳斗地主页面，Node服务代码不打入小程序，当前主包/分包字节数以[最新验证记录](verification.md)为准。2062368字节是此前A素材优化、未分包时的快照，2075448字节是PR #20整合后的快照，均不能代替本轮分包测量。

仍须微信开发者工具依赖分析、实际上传与真机验收，不能凭build/预算通过声称微信已发布。本机AppID修改保留且不提交，不提交私有工具配置或密钥。

仓库地址、README、可访问 URL / 小程序码、演示账号说明（不含管理员密钥）、功能完成表、验收记录及分工。构建通过只表示可生成产物，不表示已审核或公网可用。

官方参考（2026-10-14 核对）：
- https://uniapp.dcloud.net.cn/quickstart-cli.html
- https://uniapp.dcloud.net.cn/tutorial/platform.html
- https://cloud.tencent.com/document/product/876

GitHub Pages 参考（2026-10-22 核对）：
- [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Vite 项目子目录部署](https://vite.dev/guide/static-deploy.html#github-pages)

## 广场现成背景音乐（2026-10-25，本地待交付）

广场配乐为Kevin MacLeod《Carefree》，作者及CC BY4.0署名、下载来源和格式压缩说明见[music-credits.md](music-credits.md)，项目页面提供“音乐来源”入口。H5的完整压缩录音和许可文件位于`src/static/h5/audio`，构建后同路径复制；播放器使用BASE_URL匹配根路径或GitHub Pages前缀。H5播放无需运行时去第三方下载原曲。

微信构建忽略static/h5目录，背景音乐通过InnerAudioContext请求作者官方HTTPS原曲；不能将普通小程序主包跨分包访问私有资源当成已支持方案。实际合法域名、网络加载、系统静音和后台恢复须在微信工具/真机另验；失败会提示，不回退旧合成曲。双端构建与目录预算通过不等于微信音频或公网更新已经通过。
# 本机与同 Wi-Fi 真实校园服务

使用项目约定的 Node.js 22.22.0，在项目目录执行：

```bash
npm ci
npm run campus:local
```

命令以真实 HTTP 模式构建 `dist/local/campus-h5`，再启动 8788 服务。电脑和同网络设备都用终端打印的网卡 IP；127.0.0.1 入口会转到同一地址，避免手机误读自己的环回地址。各自注册账号后共用发布、图片和消息，主机需保持运行且端口可达。账号未核验学籍，请勿使用学校统一密码。

数据库在 `.local-campus/campus.sqlite`，真实照片在 `.local-campus/uploads`，均忽略且不提交 Git。停服务后备份整个目录；主机或端口改变会影响已保存的绝对图片 URL，本轮不自动迁移。`npm run campus:serve` 只启动已有真实版构建。可设置进程变量 `CAMPUS_PORT`、`CAMPUS_DATA_DIR`、`CAMPUS_PUBLIC_HOST`；私有配置不能用 VITE_ 前缀。

本机举报管理：先注册账号，再由持有数据库的管理员运行 `npm run campus:admin -- grant <账号>`；`reports <账号>` 列待处理记录，`resolve <账号> <举报编号> resolve <说明>` 或 `dismiss` 处理并通知。普通注册/资料更新不能提升权限。

微信开发构建使用 `VITE_API_MODE=http` 和绝对 `VITE_API_BASE_URL=http://<主机IP>:8788/api`，牌桌为同主机 `/game`。局域网 HTTP 仅供开发调试；微信正式域名、HTTPS、登录/订阅服务端配置和真机另验。GitHub Pages 不能运行 Node/SQLite，本轮没有部署公网真实后端。验收要求与实际结果见 [acceptance.md](acceptance.md)、[verification.md](verification.md)。
