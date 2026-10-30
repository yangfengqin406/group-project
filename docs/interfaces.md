# 接口契约 v0.2

## 2026-10-29 App显示名称与图标

用户确认App显示名为“校园生活广场”，使用已提供的兔子抱小屋头像。调整公开manifest.name、h5.title和app-plus.distribute.icons，并将隐私欢迎文案及政策页标题的显示名称保持一致；图标按本机HBuilderX 5.26 schema的Android与iPhone/iPad字段准备确定性缩放PNG，放在static/app/icons专属目录。原始头像保持不变，来源与SHA256记录在docs/assets/app-brand-2026-10-29。appid、版本、包名、证书、业务接口、路由和存储不变；iOS图标资源不代表已签名IPA。原生启动画面及业务内文字不是本轮额外重设计。

## 2026-10-29 App 0.1.1重新打包整合（本机候选）

用户已恢复App打包授权。独立目录整合A（杨凤琴）的互助/珍珠/原画风/App适配和B（孙瑞）PR #43分类、C（姜澜）PR #44未读提醒/聊天更新；App生命周期同时保留音频后台停止与消息前台轮询。版本0.1.1/code101，原工作区、实际账号数据及现有服务保持；不在本目录记录私有AppID或签名。此为本机候选，不表示远端PR #45已解冲或main已包含整合代码。本轮531测试、check17页/87调用、H5/微信/App双目标预检及包体实际通过，13步双账号验收通过，详情见verification；APK与真机仍单独登记。

## 私信未读与前台提醒（2026-10-29）

- 新增 `conversation.unread({})` → `{total,items:[{id,unreadCount,peer,contentType,contentId,contentTitle,lastMessage}]}`，按最新未读留言排序，仅返回本账号有未读的会话，统计不受列表分页影响。`conversation.get/list` 另附 `unreadCount`。
- 新增 `conversation.markRead({conversationId,throughMessageId})`，只允许参与者确认同一会话中已展示的消息及其之前记录，返回 `{unreadCount}`。读位置只前进，不误读请求期间新到的消息；已读状态按账号持久保存，不向对方暴露阅读回执。
- App前台每5秒查询一次未读；底部消息角标、广场消息入口及各业务页面可点击提示共用统计。隐藏/退出/切账号停止并隔离旧响应。提示可收起，未读角标保留；同一消息不重复弹出，正在看的会话不弹提示。
- 聊天页前台每5秒刷新最新留言，保留已加载历史和输入草稿；读取成功后才提交已读位置。后台/关闭应用不承诺推送，本轮不接微信订阅发送或系统通知权限。

## 2026-10-28 原画风嵌入展示

按用户截图纠正，MyHelp新增可选embedded:boolean（默认false），为true时在资料卡内显示一行可展开入口，读取/错误/当前待办提示不随正文隐藏；展开仍使用原help.listMine及三栏分页。ContributionRewards新增可选embedded:boolean（默认false），在“我的宠物”内不再生成独立卡片，常显余额和规则入口，次数/规则/流水点开查看；showActions默认行为兼容，首页继续传false。均为展示属性，不新增RPC/路由/业务字段，不改变余额或发奖。

## 2026-10-28 业务页视觉整理

本轮无RPC、业务字段、路由或依赖变化。ContributionRewards新增可选展示属性showActions:boolean（默认true）：自己的家传false，与MyHelp的一组互助入口去重；衣柜等现有调用保持默认入口。规则与记录折叠仍读取同一鉴权状态，不改变余额或奖励。其余组件的事件、错误/重试/分页与身份隔离保持原契约；公开状态继续只用helpProgress，不引入私人待办到公开卡片。

## 我的互助与求助说明（2026-10-28，本机验证通过，未发布）

用户批准前三项体验改进，设计见[说明](superpowers/specs/2026-10-28-help-continuity-design.md)。help.create/update新增可选preferredTime（0～80字字符串，默认空）、estimatedMinutes（null或1～480整数，默认null）、meetingMode（flexible/online/offline，默认flexible）。未填字段兼容历史记录；更新未提供的新字段保留原值，选人后仍冻结编辑。时间为自由文本意愿，不是预约日期推断。

公开Content摘要对help附加helpProgress:'waiting'|'helping'|'awaiting_confirmation'|'resolved'|'closed'，从原帖与当前选定协作推导，页面不自行推断谁已确认。公开摘要只带说明和进度，不附本人申请、确认时间或申请数。

新增help.listMine({scope?:'todo'|'posted'|'applied',cursor?,pageSize?}) → {items,nextCursor}，默认todo。条目为{helpId,help:Content|null,application:Application|null,role:'owner'|'helper',pendingCount?,progress,actionRequired,actionLabel,availability:'available'|'unavailable',updatedAt}。身份由会话决定，拒绝客户端身份字段；作者看本人发帖，申请者按同帖最新本人申请去重；待办仅待选人与本人未确认，终态/已确认等待对方不列。筛选、去重后分页，游标绑定账号和scope。原帖私有/删除/注销后对申请者仅给不可访问占位及本人申请状态，不能包含原标题/正文/图片/作者或其他申请者，不能进入其详情。其他人的公开主页仍用user.listPublicContent。

微信静态复制产物仅排除4张当前从不渲染的挂饰背面帧：static/pets/wearables/{bubble-star,pearl-badge,clover-pin,glow-jelly}-back.webp。WardrobeLayers只在正面显示挂饰；源码及H5/App帧均保留，通用衣身/鞋/发型及旧背包回退不裁剪。构建末尾对已知4个文件精确排除，再实际检查2MiB原始目录预算；不改变功能、路由或素材内容。

## 校园贡献与珍珠（2026-10-27，用户已确认，实施中）

完整规则见[设计说明](superpowers/specs/2026-10-27-campus-contribution-design.md)。公开新发布 help/market（sell 与 buy）/lostFound/plan 每篇5珠，每账号北京时间每日前三篇共享额度；编辑、失败、私有发布及七天内同账号规范化同文不重复奖励。create 新增可选 idempotencyKey，新客户端网络重试复用；返回原 Content，可瞬态附加 reward:{eventId,delta,reason}，不将本人奖励信息写进公开 Content。奖励事件、余额、业务与回执同事务提交，零奖励决定也不跨日补领。

新增 rewards.getState() 仅读取本人余额、dayKey、daily:{publish:{awarded,limit:3},helpCompletion:{awarded,limit:2}}、rules 及 recent（最多20条本人贡献奖励）。仅服务端可信业务可发奖，客户端不能指定金额、身份或领奖事件。公开主页继续仅使用 user.listPublicContent。

help 新增 listApplications({helpId,cursor?,pageSize?}) → {items,nextCursor}；作者看本帖申请，其他人只看本人申请。新增 apply({helpId,idempotencyKey})、selectHelper/confirmCompletion/cancelCooperation({helpId,applicationId,idempotencyKey})，返回 {application,help,reward?}；reward 仅当前调用人可见。申请含 id/helpId/ownerId/helperId/status（pending/accepted/completed/cancelled）、ownerConfirmedAt/helperConfirmedAt、createdAt 和公开用户摘要。公开 help 可附加 selectedApplicationId，不附申请清单或钱包信息。选人后冻结编辑，旧 help.complete 不得绕过双方确认；未选人自行解决不发完成奖。任一参与方取消未完成协作不发奖，重新选人不沿用旧确认。

双方确认解决后，帮助者15珠、发布者5珠；每账号每天最多两次完成奖励，跨角色共享，各自独立判断满额，同一对账号同一天最多一次奖励。满额仍可完成，历史已结算事件不可重领。屏蔽禁止新的申请与选择；注销撤销未完成协作、清理本人奖励资料。所有日期由后端北京时间确定，独立账号未核验学籍，不宣称能防止小号互刷。

conversation.open 对 help 增加发布者联系真实申请人的入口：仅该帖发布者可联系本帖 pending/accepted/completed 的申请者，参与者仍由服务端验证，复用既有双人会话并检查屏蔽与账号有效；不得指定无申请的任意账号。其他内容继续只联系发布者。帮助者仍可通过原入口联系作者。

衣柜目录 unlockLevel 统一返回0并移除服务端通关兑换限制；clearedLevels 仍仅用于潜水顺序与首通奖励。旧余额、拥有物及固定游戏奖励保留。本节覆盖下方历史通关兑换门槛说明；H5/微信/App 源码均沿用该规则，本轮不打 APK。

## Android / iOS App 接入（2026-10-27，实施中）

0.1.1音频续修：用户确认华为安装、登录、伙伴与衣柜正常，但主动开启音乐且媒体音量正常仍无声。当前官方App SDK的obeyMuteSwitch为只读，平台适配只在属性可写时配置，不强写只读项；首次播放由调用方明确发起，不能把初始paused=false当作已播放。沿用同包名和云端证书递增版本，旧版本数据与已有账号不重置。新版是否有声仍以真机回验为准。

App业务图片仍保留接口返回的原始URL；`services/media`仅为显示下载本服务`/api/files/`图片，令牌只放请求头，不放URL，不发送给外部图片站点。临时显示文件在组件卸载或账号切换后清理，迟到下载不能回填其他账号；H5/微信沿用原图片路径，不增加RPC。

新增 `rooms/settings/index` 账号与隐私页面，沿用既有服务层。`VITE_APP_CONTACT_EMAIL` / `VITE_APP_PRIVACY_URL` 是可选公开展示配置，不得放密钥；正式发布构建要求提供实际联系方式、HTTPS隐私政策及真实DCloud AppID，开发预检仍明确区分未签名资源。账号注销产生的文件清理任务在SQLite提交后执行并持久重试，访问权限与会话先在事务内撤销。

用户确认改用原生 App 交付，同时支持 Android 和 iOS；先完成适配与 Android 安装包，Apple 会员/签名稍后由用户准备。沿用 uni-app 官方 App 平台、既有 HTTP RPC 和独立账号，完整保留四屋业务、消息、宠物、衣柜、钓鱼、潜水及三人斗地主；不将 H5 网页或编译资源称为已签名安装包。

App 构建新增与现有编译器完全同版本的 `@dcloudio/uni-app-plus`，构建时由 `CAMPUS_APP_ORIGIN` 指定 HTTPS 服务源，不将实际服务地址、DCloud AppID、证书或密码提交源码。原有 H5/微信构建继续可用，正式 App 不自动启用微信调试、不回退演示成功。PNG 导入新增 App 文件读取适配；声音及切后台沿用现有暂停规则。

已实现本人账号注销与用户屏蔽：`auth.deleteAccount({password,confirmation:'注销账号'})` 二次验证当前账号密码后撤销全部会话、删除本人资料与私有存档、下架本人发布并清理上传；不允许客户端指定待注销用户。`user.block({userId})` / `user.unblock({userId})` / `user.listBlocked({})` 只维护当前账号的屏蔽关系，任一方屏蔽后禁止建立新会话和发送新私信；历史消息保留双方的既有访问权限，屏蔽不伪装删除双方已发生的交互。新增契约已通过真实SQLite与隔离浏览器走查；原生App真机及正式发布另验，不由编译成功推定。
## 手机跨网络开发预览（2026-10-27）

同日续修：仅 `build-phone-preview.mjs` 显式设置公开构建标记 `VITE_PHONE_PREVIEW_DEBUG=true`。服务层在首个HTTP请求前等待微信开发/体验环境的调试准备，共享一次在途准备；release环境及默认H5/发布构建不自动开启。调试失败不回退mock、不伪造登录；真实网络失败分别提示域名拒绝、超时、TLS/普通连接失败。不增加RPC、账号字段或业务存储，也不替代微信后台合法域名与成员权限。

手机不能使用电脑回环地址。跨Wi-Fi/流量必须配置可达HTTPS源；`CAMPUS_PHONE_PREVIEW_ORIGIN`仅为手机预览构建指定真实API与牌桌HTTPS源，`CAMPUS_PHONE_PREVIEW_ASSET_ORIGIN`可指定同源静态图片地址，默认与前者一致。预览构建将运行时图片改为该源的/static路径并打开网络WebP解析，app.json底栏图标保持包内；不更改业务RPC、账号字段或演示回退策略，不把临时域名写入源码。默认8791模拟器构建及本机存储不变。原生开发预览的合法域名/调试权限与H5网页分别验收；临时公网连接并非正式微信上线。

## 完整真实小游戏与发布配置（2026-10-26）

沿用既有fishing/wardrobe/dive RPC及参数/返回字段，不新增玩家指定身份、余额或奖励入口。共享玩法模块只操作传入状态，不含浏览器存储；真实服务只允许当前认证账号，在SQLite同步事务内保存钓鱼、鱼册、衣柜、珍珠、关卡、有效局与上次结算。抛竿/潜水编号由服务端签发，潜水仍由相同规则回放并校验服务端经过时间；重复结算不得重复奖励，断线后通过getState读取已保存结算。既有独立访客斗地主契约不改。

服务端新增可选CAMPUS_PUBLIC_ORIGIN（严格HTTPS源，不含路径/凭据）与CAMPUS_TRUSTED_PROXIES（明确代理IP列表）；不带VITE_前缀、不进入前端。固定公共源用于跳转、来源校验与上传URL；只信任配置代理提供的客户端地址，登录文件Cookie在HTTPS源下带Secure。本机未配置时保留原HTTP/LAN行为。私有演示数据与密码目录独立于真实用户目录，部署/演示包排除实际用户数据库。

真实pet.save同时支持通过既有外观/PNG校验的原创画稿，仍只保存当前账号，不接受外链或SVG。仅pet.save的RPC允许最多1MiB请求信封以容纳两张受限PNG；其余RPC仍为64KiB，单张画稿256KiB/512像素限制不变。

发布构建脚本固定读取既有VITE_API_MODE/VITE_API_BASE_URL/VITE_GAME_BASE_URL；CAMPUS_RELEASE_WECHAT_ORIGIN仅在构建时指定微信HTTP/HTTPS源，默认电脑模拟器127.0.0.1:8791，正式构建需改实际HTTPS源。CAMPUS_SHOWCASE_PORT/DATA_DIR仅用于隔离展示进程，样例目录与原真实数据库分开，正式启动不自动创建样例；不新增业务字段、路由或依赖。

## 广场与潜水声音（2026-10-25，本地表现层）

`services/soundscape.js` 提供本次会话的声音状态和控制，不新增RPC、账号字段、业务存储或依赖。按用户最新要求，广场音乐改为已发布录音《Carefree》/Kevin MacLeod（作者授权CC BY4.0），不再使用合成BGM；默认关闭、点击“音乐”播放，可通过“音乐来源”查看署名、来源与转码说明。潜水水声默认开启，在点击出发后解锁；音乐与水声可独立关闭，暂停潜水、离开广场或切后台均停止声音。

`soundscape.musicCredit`是只读展示资料，包含曲名、作者、作者页、许可页及格式压缩说明，不进入业务User或存储。H5在平台层通过原生Audio播放`static/h5/audio/carefree.mp3`并处理play拒绝，路径跟随部署BASE_URL；微信通过InnerAudioContext播放作者官方HTTPS原曲，网络/域名/真机仍需另验。H5专用静态目录不进入微信包，普通小程序不从主包加载rooms私有素材。水声继续使用Web Audio/微信WebAudioContext。迟到播放不能在关闭或离页后继续响，加载、解码或播放失败明确提示，不回退旧合成曲；音频资源、许可和来源记录同源码交付。

页面只通过该服务调用`unlock/toggleMusic/toggleEffects/setVisible/setScene/setPaused/effect`；平台音频操作放在`src/platform`，原创PCM合成放在`src/utils`。音效由实际气泡发射、珍珠拾取、扣心及结局状态触发，不表示结算成功或另行发奖；开关仅保留在当前运行会话，不跨账号写业务资料。

## 调用层约定

微信构建的斗地主专用JS（landlord、game-transport、game-session）归rooms分包，源码服务仍保留于src/services；不更改页面URL、访客令牌或RPC契约。组件通过mp-weixin.lazyCodeLoading=requiredComponents按需注入，H5输出保持原构建方式。

页面调用 src/services 中的模块函数，例如 `market.list({ keyword, cursor, pageSize })`。校园业务的call在mock/http模式之间切换；斗地主独立走`game-transport.js`的真实访客HTTP服务，见文末，不复用mock身份或校园令牌。

真实校园HTTP统一RPC：`POST <VITE_API_BASE_URL>/rpc`，body为`{method,params}`，登录后带`Authorization: Bearer <token>`；本机Node22/SQLite实现见[接入契约](local-campus-backend.md)，公网HTTPS适配及验收尚待完成。独立`server/landlord/`仅实现牌桌访客与牌局。若后续改用CloudBase云函数，在transport.js增加适配，页面调用名称和输入结果不变；不要把CloudBase环境ID当成HTTP URL。

返回 envelope：`{ code: 'OK', message: '', data, requestId }`。call 成功只返回 data，失败抛 ServiceError，不回退演示数据。错误有 INVALID_ARGUMENT、UNAUTHENTICATED、FORBIDDEN、NOT_FOUND、CONFLICT、SERVICE_UNAVAILABLE；骨架补充 NOT_IMPLEMENTED / NOT_SUPPORTED，明确尚未实现或平台不支持。

列表统一 `{ items: [], nextCursor: null }`，pageSize 默认 20，最多 50；cursor 必须由服务端返回。演示用 offset 字符串，真实数据库可使用不透明 cursor。所有内容 ID 是字符串，详情与修改统一用 `{id}`；plan.getCandidates 使用 `{planId}`。

## 第一阶段列表与广场交互补充

- 搭子和技能互助列表组合使用既有 `keyword`、`category`、`status`、`cursor`、`pageSize`。`category` 为与发布内容一致的完整类别/技能字符串，`status` 为既有状态值；空字符串表示不限制。后端先完成筛选再分页，后续页保留同一组已生效条件；只编辑输入框而未提交搜索时，不影响加载更多。
- 搭子发布页的类别自 10-28 起改为固定选择：选项来自公共常量 `src/constants/plan.js`（电影、散步、运动、学习、游戏），发帖页与找搭子检索页共用同一份，发布时必选；技能求助仍为自由输入。历史自定义类别内容仍可经关键词/类别筛选查到，列表筛选后端不限定取值。
- `FeedList` 的可选属性为 `showFilters: Boolean`（默认关闭）、`categoryOptions: Array<String>`、`statusOptions: Array<{label,value}>`。找搭子检索页快捷类别直接传入 `planCategories`；技能求助检索仍允许手动填写已有分类。
- 广场坐标按背景宽高归一化到 `[0,1]`。移动工具的 `createPlazaWalker` 对外提供 `getState()`、`moveTo(point)`、`advance(seconds)`、`stop()`：目的地投影到闭合步道，沿较短方向行走，不穿越中心树岛；这是本地场景状态，不持久化业务数据，也不表示多人位置同步。

## 宠物外观（本地版本）

- 新增 A 维护的 `pet.get()`、`pet.save(appearance)`，统一通过 `src/services/pet.js` 调用。返回当前账号的 `{ species, palette, feature, accessory, name }`，不接受指定其他用户或作者；尚未保存时返回默认糯叶兔外观。演示数据按虚构账号分别保存，旧演示存档无宠物字段时仍可读取默认值。
- `species` 为 mushroom/capybara/rabbit/squirrel；`palette`、`feature`（耳朵或蘑菇帽型）、`accessory` 使用 `src/utils/pet-appearance.js` 中明确允许的组合，名称去首尾空白后为 1～12 个 Unicode 字符。无效外观保存返回 INVALID_ARGUMENT，不影响上一次保存。
- 页面编辑的是草稿；切换物种时采用该物种的默认耳朵/帽型，保留配色、配饰和名字；点击“保存并去广场”成功后才生效。页面内离开与还原先确认，系统返回/刷新按平台能力提醒，不自动保存；衣柜穿戴独立自动保存。原创正背面各保留20步页面内撤销历史，切面/打开衣柜不清空，导入新图仅重置对应面；不新增业务存储。保存失败保留草稿并显示错误，旧账号的导入/保存响应不能覆盖新账号。
- 新页面 `/pages/pet/index` 从“自己的家 → 我的宠物”和广场入口进入，不新增房子或底部栏目。广场每次显示读取当前账号已保存的外观，NPC 仍为装饰角色。
- 真实模式继续走现有 RPC；后端尚未实现这两个方法时必须报错，不能显示演示保存成功。本次不改 User 公开字段、登录/上传与消息接口。
- 原创宠物增加 `species: 'custom'`，固定 `palette: 'cream'`、`feature: 'art'`、`accessory: 'none'`，增加 `art: { front: ArtFrame, back: ArtFrame | null }`。预设四款保持既有五字段。ArtFrame 为 `{type:'pixels',pixels:Array<1024>}`（32×32，像素为允许色板十六进制或 null）或 `{type:'png',data:'data:image/png;base64,...'}`。至少有非空正面才可保存；背面可后补。
- 原创 PNG 只接受真正的 PNG 数据，单张不超过 256 KiB，宽高各不超过 512px；拒绝 SVG、外链、其他 MIME 或任意文件数据。导入只读取用户选中的本地文件，不代表云上传。像素画布提供前/背面、画笔/橡皮擦、撤销和清空。
- `PetAvatar` 增加本地显示属性 `view: 'front' | 'back'`，与左右 `facing` 独立。四款预设的背面隐藏脸部并显示对应后脑、尾巴/帽檐和配饰背部；编辑页原创缺背面时明确留空提示。广场里没有背面画稿的原创始终使用实际正面，保留原稿朝向，不镜像冒充。
- 本机演示通过 pet 服务保存原创数据并按身份隔离；真实模式暂不开放原创保存，明确 NOT_IMPLEMENTED，须与 B 的公共上传及后端存储协调后启用。预设宠物的真实 RPC 行为不变。

## 沉浸式广场（本地调整中）

- 广场使用自定义导航占满可用窗口，隐藏该页原生底栏；消息、自己的家和宠物搭配以场景内入口访问，离开后恢复正常导航。四栋房子的模块归属不变，不增加消息建筑。
- 点击建筑或门牌先下达行走指令，经中心步道与对应支路抵达门口后只触发一次 enter 事件，再跳转模块。新目标、离开页面和导航失败需取消/释放前一次待进入状态；不得点击即假装已走进门。
- 中心公告栏可点击，新增 `bulletin.list({cursor?,pageSize?})`（A 维护）返回公告分页 `{items:[{id,title,body,createdAt,demo}],nextCursor}`。本机种子公告明确标为演示；真实模式走 RPC，失败报错。公告面板提供前往现有消息中心的私信入口，沿用 C 的 conversation/message/notification 契约。
- 广场支持横竖窗口的场景缩放/探索；横屏展示更多地图，不承诺 H5 可强制锁定设备方向。场景按钮和角色大小使用有上限的像素尺寸，避免浏览器宽度变化导致角色与门牌过大。

## 数据基础

### 闯关解锁装扮与贴身发型/鞋（2026-10-19要求，10月20日本地实现）

- 新演示身份不再赠送七件入门装扮；`owned`初始为空，七槽初始为null，珍珠为0。已有拥有物、通关、珍珠和旧钓鱼迁移保留，不删除可能已经获得的装扮。
- `WARDROBE_ITEMS`及`wardrobe.getState().catalog`新增`unlockLevel: 0|1|2|3`：0为三种钓鱼饰品；其余在首次通关指定关卡后才可按目录标价兑换。`wardrobe.redeem`在服务侧校验`clearedLevels`，未满足时返回FORBIDDEN且不扣款；已拥有物的重试仍直接返回当前状态，不重复扣款。请求/状态其余字段、RPC名称和pet.save不变。
- 关卡首通固定装扮及30/45/60珍珠奖金、重游8/12/18珍珠奖金不变；版本2另计本局带回的每颗1枚收获，见下方潜水契约。界面显示尚需通关的关卡、兑换价格和首通目标，并从衣柜直接进入既有潜水弹层，不新增潜水页面。
- 四款预设发型按头皮、耳根和帽檐分别绘制正背专属局部，鞋替换裸脚区域并连接脚踝；双肩包正面只显示肩带、背面显示包体。外部PetAvatar调用及服装服务字段不变；原创画稿仍使用通用定位，不识别任意头/脚形状。

### 分类衣柜、精绘宠物与水下闯关（2026-10-16，本地扩展）

- 用户确认固定首通奖励＋珍珠自选兑换。新增 `wardrobe` 与 `dive`（A），仍只通过 services 调用；业务存储仅在 mock，真实失败不回退演示。新衣柜不向 pet.save 增加字段，既有预设/原创外观兼容。
- 衣柜7槽为 `hair/head/outfit/feet/bag/hand/charm`，同槽替换、不同槽叠穿。共享目录 `src/utils/wardrobe-catalog.js` 提供 `WARDROBE_SLOTS`（id/label）、`WARDROBE_ITEMS`（id/name/slot/cost/source/description）及 `STARTER_ITEMS`。23件：hair=acorn-bob/cloud-bun/sea-braid；head=lily-pad/reed-bow/straw-hat/shell-crown；outfit=sailor-shirt/moss-cape/coral-dress；feet=rain-boots/shell-shoes/leaf-slippers；bag=leaf-backpack/shell-pouch/bottle-bag；hand=tiny-net/clover-umbrella/star-wand；charm=bubble-star/pearl-badge/clover-pin/glow-jelly。最初的七件入门赠品已取消，STARTER_ITEMS为空，新身份通过钓鱼/首通/满足关卡门槛后兑换获取装扮，旧拥有物保留。
- `wardrobe.getState()` → `{catalog,owned:[{id,count}],equipped:{hair,head,outfit,feet,bag,hand,charm},pearls,clearedLevels:[1,2,3]}`。`wardrobe.equip({slot,itemId:string|null})` → state，只能穿已拥有且槽位匹配的物品；null摘下该槽。`wardrobe.redeem({itemId})` → state，按目录价格扣珍珠，重复兑换已拥有物不重复扣款；不能伪造价格/余额/身份。
- 旧 fishing.collection 的荷叶/芦苇结/水泡星迁移为衣柜拥有物，旧单件佩戴迁移到对应槽，不清空存档、不重复累计；后续钓获进入同一衣柜。fishing旧5方法保留兼容。`PetAvatar` 新可选 `wardrobe:Object|null`；传入时按衣柜多槽显示，否则保留旧ornament。新bag覆盖旧satchel，新head覆盖旧flower，避免同部位叠两件。
- 四款预设改为参照用户概念图的透明精绘像素插画，提供真实正背面及对应耳型/帽型；保留四种配色显示（cream标为“原色”）。原创画布/PNG继续可用；衣柜为独立层，不伪造原创背面。
- 当前潜水契约为2026-10-24版本2，替代旧的“氧气归零直接失败”规则。`dive.getState()` → `{clearedLevels,unlockedLevel,pearls,activeRun:Run|null,lastSettlement:null|Settlement}`；`Settlement:{runId,levelId,rulesVersion:2,status:'cleared'|'returned'|'failed',collectedPearls,reward:{firstClear,items:[id],pearls}|null}`。旧存档无回执可为null；旧回执没有版本时不能用于恢复版本2本局。界面仅按当前账号、同一runId/levelId/rulesVersion恢复已结束本局，不根据余额或历史首通推断成功；结果不明先读回执并刷新衣柜，不重复发奖，重复finish仍返回CONFLICT。
- `dive.start({levelId:1|2|3})` → `Run:{id,levelId,rulesVersion:2,seed,startedAt,expiresAt}`；只可开已解锁关卡，新run替换旧run，缺少版本或旧版本编号明确失效重开。模拟固定步长50ms，最多1200步（60秒）；活动有效期为startedAt后360秒，其中包括暂停/请求恢复余量，不能把有效期当成模拟氧气。客户端拒绝规则版本不符的开局。
- 3爱心，氧气40/42/45秒。氧气归零先扣1心，此后每100步（5秒）扣1心，同一步碰撞与缺氧最多扣1心。持续静止按住返航40步（2秒）且未受伤后为returned，移动、松开或受伤打断；暂停/后台停止模拟、不回血。引擎快照增加`rulesVersion:2`、`returningTicks:0..40`、`oxygenDamageTicks:0..100`，后两项是返航进度及缺氧后下次扣心的步数，不是钱包字段。
- `dive.finish({runId,ticks,trace})` → `{status:'cleared'|'returned'|'failed',rulesVersion:2,collectedPearls,reward:{firstClear,items:[id],pearls}|null,wardrobe:WardrobeState,state:DiveState}`。trace为输入改变事件数组`{tick,dx,dy,fire,returning?}`；dx/dy仅-1/0/1，fire及可选returning为布尔，省略returning按false兼容。ticks为1～1200整数，trace最多1200项，事件tick严格递增且小于ticks。服务按seed回放并检查实际经过时间，拒绝非法/超长/多余终局步数、旧或他人编号及客户端直接指定结果、身份或金额；只有服务核验终局才能消费编号。
- 每颗场内珍珠先计1枚待带回收获，不即时入袋。returned只入袋已拾数量，reward为`{firstClear:false,items:[],pearls:collectedPearls}`（可为0），不记通关或解锁；cleared入袋本局收获，另发首通固定装扮及30/45/60奖金，重游奖金8/12/18；故首通合计33/49/65，重游11/16/23。failed的reward为null，仅丢本局收获，历史余额、装扮及通关保留。首通L1送sailor-shirt＋shell-shoes；L2送cloud-bun＋shell-pouch；L3送shell-crown＋star-wand＋pearl-badge，不重复领套装。回执与入袋同一次结算，编号仅消费一次，返回对象深拷贝、按身份隔离；本机回放不等同生产防作弊，无付费或真实货币。
- `FishingPond`与宠物收纳袋复用分类衣柜，潜水以原有弹层打开，不新增业务房子；“离开冒险”和“选择关卡”需确认放弃本局，不能等同返航入袋。亭子最初四人麻将仅为历史规划，当前改为文末的三人斗地主分包。

### 穿戴表现调整（2026-10-18，仅显示层）

- 23件衣柜目录、拥有数量、装备槽、价格及 pet/wardrobe/fishing/dive 服务契约保持原样。本轮将显示层改为同画风透明装扮素材、四物种身体锚点与前后遮挡；不新增持久化字段或依赖。
- `WardrobeLayers` 内部增加可选 `appearance` 与渲染分组信息，用于与精绘身体、头部、耳朵和爪子分层组合；`PetAvatar` 的外部调用属性不变。预设按身体适配，原创画稿保留通用穿戴定位，不推断任意用户绘画的肢体位置。
- 2026-10-19 用户复核否定通用衣服叠图的贴身效果。本次按物种和正背面提供专属已着装躯干，穿衣时替换裸躯干区域，原头耳、脚和尾巴按边界组合；避免裸腹外轮廓与衣服同时出现。仅改变内部美术和渲染，外部属性、七槽目录、服务与存档字段不变。

### 池边钓鱼与活动公告补充（2026-10-15，本地扩展）

本节记录最初钓鱼范围；潜水、分类穿戴与珍珠兑换已由上方 2026-10-16 扩展覆盖。旧钓鱼方法和掉落概率继续兼容；付费与玩家交易仍未实现。

- 经用户选择，池边先做钓鱼收集，潜水冒险后续。`fishing`（A）独立维护，不修改既有 pet 外观五/六字段；钓获、背包和佩戴状态按当前身份保存在 mock，页面和组件只调用服务。真实模式继续 RPC，未接入时明确失败，不回退演示奖励。
- `fishing.getState()` → `{catchCount,fishBook:[{id,name,count}],collection:[{id,name,count}],equipped:string|null,activeCast:Cast|null}`。装饰 ID 为 `lily-pad`（小荷叶）、`reed-bow`（芦苇结）、`bubble-star`（水泡星）；`PetAvatar` 增加独立可选显示属性 `ornament`，用于预设及原创，不改 pet.save 数据格式。
- `fishing.cast()` → `Cast`，每身份只有一条有效抛竿，新抛竿替换旧编号。Cast 包含 `{id,status:'waiting'|'hooked',biteAt,escapeAt,meterStartAt?,meterPeriodMs?,meterZone?,landDeadlineAt?}`，时间均为毫秒时间戳。`hook({castId})` 必须在 biteAt～escapeAt 内，返回 `{status:'hooked',cast}` 或 `{status:'escaped',reason,state}`。`land({castId})` 以服务侧时钟核对三角往返标尺是否落在 meterZone 内，返回 `{status:'caught',fish,reward,state}` 或逃脱结果。结果写入后消费编号，重复或他人编号不得重复发奖；页面不传鱼种、奖励或成功声明。
- `fishing.equip({decorationId:string|null})` → 最新 state；只能佩戴背包已有装饰，null 可摘下。首次成功钓获赠小荷叶，后续成功有35%概率随机得到上述装饰，重复获得累加数量；无消耗、购买、付费或奖励交易。
- `PlazaScene`的`pond`/`pavilion`为独立场景地点及支路，不计入四栋业务建筑；池边触发`pond`，亭子触发`pavilion`。本节最初的四人麻将规划已由2026-10-24三人斗地主实现取代，未配置服务时不显示虚构在线或匹配。原四屋`enter`及消息入口保留。
- `bulletin.list` 原公告字段兼容，校园活动条目增加 `{kind:'campus-activity',startAt,endAt,location,organizer,participation}`。演示活动由 mock 相对当前时间生成，过滤已结束活动后分页；不得将虚构活动描述为本校真实活动或已完成报名。顶部居中活动公告入口与中央公告热点打开同一面板；活动详情展示时间、地点、组织方和参与方式，真实活动来源/报名另接。

contentType 为 plan / help / market / lost_found / event。当前 content/detail 只支持前四项；event 在第二周实现对应入口再开放通知。

内容共有 id/type/ownerId/title/body/category/location/campusId/campusName/images/visibility/status/createdAt；列表和详情附公开 owner 摘要。2026-10-21合并PR #6：二手create/update额外使用imageIds数组（≤3），通过upload.create取得，服务校验归属并在列表/详情解析为images；失物、搭子和技能求助继续使用既有images，不强制改为imageIds。失物要求1～3张照片。当前upload演示仅记录本机临时地址，不是云上传；非二手发布在真实模式不能发送本机临时图片冒充公共上传，需先接入真实上传。头像通过avatarImageId引用上传记录。

失物额外包含 `lostKind: 'lost'|'found'`；`category` 固定为 `card|key|misc`，分别对应卡片（身份证、校园卡、银行卡等）、钥匙和杂物。创建失物要求 1～3 张图片；演示地址只在本机当前环境有效，真实版本必须走公共上传。失物状态为 active/returned/closed，作者通过 markReturned 将有效发布更新为 returned（界面显示“已完成”）。

Plan 增加 startAt/endAt/capacity/memberIds；Market 增加 priceCents。时间使用 ISO 8601；前端输入和活动日期按北京时间 +08 判断，存储可用 UTC。价格为整数分。

## 常用模块

| 模块 | 输入要点 | data |
| --- | --- | --- |
| auth.login | `{ type: 'h5', studentId, password }`仅校验非空并切到固定演示身份，不验证真实学号密码；`{ type: 'wechat', code }`演示明确未实现 | `{ token, user }`；token不记录到日志；真实登录仍需后端认证 |
| user.getProfile | `{userId?}`；省略取本人 | 公开 User：id/nickname/campusId/campusName/skillTags/bio/avatarImageId/avatarUrl（avatarUrl 由服务解析 upload 返回，待群里确认） |
| user.updateProfile | `{nickname?, bio?, skillTags?, avatarImageId?}` | 保存后的 User；服务校验昵称 1～12 字、简介 ≤200、标签 ≤10、头像归属当前账号（待群里确认） |
| user.listPublicContent | `{userId,cursor?,pageSize?}` | 该用户公开发布分页；不包含私有内容 |
| upload.create | `{ usage: 'content'|'avatar', data }` | `{ imageId, url }`；当前mock仅检查用途/非空数据并记录本机临时地址，尚未实现文件类型/大小检查或云存储；真实后端必须另验 |
| upload.confirm | `{ imageId, contentType?, contentId? }` | `{ imageId, status: 'confirmed' }`；确认图片归属当前账号与业务内容（待群里确认） |
| market.create | `{ marketType:'sell'|'buy', title, body, category, imageIds?, priceCents?, condition?, handoverCampus?, budgetCents?, keywords?, appraisal? }` | 保存后的二手内容；闲置需 priceCents/condition，求购需 budgetCents/keywords；imageIds 服务校验归属与 ≤3 张；appraisal 为发布者提交的参考快照，非鉴定凭证。仅闲置可传：min/max为非负安全整数分且min≤max，basis.category/condition/rule为字符串，rule固定“类别+成色示例估价”，note固定参考声明；缺结构或不合规则拒绝，改为求购清除旧快照 |
| market.update | `{ id, ...可更新字段 }` | 仅发布者可改，已完成/已下架不可改；imageIds 同 create 校验 |
| market.get | `{ id }` | 二手详情，images 为服务解析出的可访问地址数组；闲置若已估价则含 appraisal 快照 |
| market.list | `{ keyword?, category?, campusId?, marketType?, status?, cursor?, pageSize? }` | 二手列表分页，pageSize 默认 20 上限 50 |
| market.close | `{ id }` | 发布者下架，status=closed |
| market.complete | `{ id }` | 发布者标记交易完成，status=completed；完成后不可预约/修改 |
| market.reserve | `{ id }` | 非发布者预约交接，status=active 才可预约；同商品不可重复预约，冲突返回 CONFLICT |
| market.getCandidates | `{ id }` | 发布者查看该商品的待处理预约列表 |
| market.matchCandidates | `{ buyId, cursor?, pageSize? }` | 仅求购发布者查看匹配到的公开在售闲置：`{items:[{...闲置摘要, reasons:string[]}], nextCursor}`；同类别+同校区+价格≤预算，排除私有、本人、已下架/已完成，先筛选再分页；reasons至少含「同类别、同校区、价格在预算内」，命中关键词时追加「包含求购关键词」；无匹配返回空数组，不返回成功率 |
| appraisal.estimate | `{ imageId, category?, condition? }` | `{ minCents, maxCents, basis:{category,condition,rule}, note }`；note 固定为「参考估价，仅供参考，最终价格由发布者决定」；basis.rule 说明估价依据（示例规则为「类别+成色示例估价」），不得伪装为 AI 估价；category/condition 取发布表单值，缺失时按空字符串处理 |
| myContent.list | `{contentType?,status?,cursor?,pageSize?}` | 当前用户发布分页；身份取后端会话 |
| plan/help/market/lostFound.list | `{keyword?,category?,lostKind?,campusId?,marketType?,ownerId?,status?,cursor?,pageSize?}` | Content分页；lostKind仅失物使用，marketType/campusId仅market生效；筛选后分页，其余模块不受专属字段影响 |
| 模块.get | `{id}` | 单条内容与公开作者摘要 |
| 模块.create/update | 内容字段；update 含 id | 保存后的 Content；作者与校区由后端确定 |
| plan.getCandidates | `{planId,cursor?,pageSize?}` | `{items:[{candidatePlanId,ownerId,owner,plan,overlap,reasons}],nextCursor}` |
| invitation.create | `{sourcePlanId,targetPlanId,idempotencyKey}` | Invitation；当前用户拥有 targetPlanId |
| invitation.list | `{cursor?,pageSize?}` | 当前用户发出/收到的邀请分页，附 sender/recipient 公开资料 |
| invitation.respond | `{invitationId,action,idempotencyKey}` | `{invitation,targetPlan}`；action=accept/reject/cancel |
| invitation.cancel | `{invitationId,idempotencyKey}` | 与 respond(cancel) 一致 |
| conversation.open | `{contentType,contentId,peerUserId}` | 会话，含原内容链接和 participantIds |
| conversation.list | `{contentType?,cursor?,pageSize?}` | 当前用户会话先按来源筛选、按最近消息时间（无消息时按创建时间）倒序，再分页；contentType省略/空串表示全部，非空为plan/help/market/lost_found。含peer摘要、lastMessage与原内容字段 |
| message.list | `{conversationId,cursor?,pageSize?}` | Message 分页，含 sender 摘要，按新到旧排列 |
| message.send | `{conversationId,body,idempotencyKey}` | 保存的 Message |
| comment.list | `{contentType,contentId,cursor?,pageSize?}` | 公开评论分页，含 author 摘要 |
| comment.create | `{contentType,contentId,body}` | 当前仅 lost_found；保存评论并给非本人发布者生成站内通知 |
| notification.list/markRead | 分页 / `{notificationId}` | 通知分页 / 保存的通知 |
| favorite.set/list | `{contentType,contentId,selected}` / 分页 | `{selected}` / 收藏分页 |
| report.create | `{contentType,contentId,reason}` | 举报编号与状态 |

所有预留的方法名称及维护人见 src/contracts/catalog.json；未实现项见 docs/status.md。reservation、event、appraisal 和服务器订阅发送只留调用位置，不伪造成功。

## 推荐与邀请规则

匹配目标计划必须由当前用户拥有、公开、仍有空位且未结束。候选也必须公开，同校区、同类别、北京时间同日、有效时间严格重叠、仍为有空位的单人 open 计划，排除本人和已加入目标的成员。返回 overlap 和理由，不返回虚假的成功率；私有计划不得通过推荐摘要泄露。

邀请 targetPlanId 是邀请人自己的计划，sourcePlanId 是被邀请人的单人计划。接收人接受后加入 target，source 关闭并记录 joinedPlanId。真实后端需用事务同时检查权限、容量、来源状态、成员唯一性和幂等。第一版不处理整队合并。

### A 第二阶段首批：计划与邀请状态（2026-10-22）

- 沿用现有方法、字段和状态枚举，不新增RPC、路由或依赖。计划在读取/操作时按服务时间判断是否结束：招募中/满员计划到期转为 `expired`，已关闭/已完成的终态保持不变。
- 发布者可更新 `open/full` 计划；容量不能小于现有成员数。更新后人数达到容量为 `full`，扩容后有空位为 `open`；不能恢复已关闭、已完成或已过期计划。新建计划开始时间必须在未来；已开始但未结束的计划可保持原开始时刻修改说明/扩容，或改到未来，但不能另设过去的开始时间，结束时间必须晚于当前服务时间。`plan.close({id})` 为取消整个计划，`plan.complete({id})` 为完成，均只允许发布者操作有效的 `open/full` 计划，不等于成员退队。
- 邀请已有 `pending/accepted/rejected/cancelled/expired` 状态。待处理邀请的来源或目标关闭、完成、过期、转私有、满员或不再符合原推荐条件时，转为 `expired`；来源加入另一计划也使相关旧邀请失效。读取列表和执行计划/邀请操作时校验，不依赖页面自行写状态；失效后不能因重新扩容等操作自动恢复。
- 接受、拒绝及发送者取消仍校验身份；非法或失效操作返回原有错误码，不增加成员或重复通知。接受最后空位后同步使其他待处理邀请失效；已成功操作的相同幂等编号重试仍返回原结果。
- 前端在详情提供有确认的取消入口；消息仅对 `pending` 显示处理按钮，失效后解释原因范围；服务冲突后刷新状态。推荐页返回时重读服务，并由现有邀请分页恢复待确认标记，不以页面内数组冒充服务记录。
- 本批是演示业务规则与真实接口对接前的准备；没有部署后端、接入真实认证或验证数据库并发事务。

通知与业务结果分开：订阅发送失败不撤销组队。requestSubscription 只在微信端用户点击时申请授权；subscription.send 必须服务端受控，不能任意从前端调用发送模板消息。

## 广场邻里展示（2026-10-21，本地调整）

- `PlazaScene` 的 `guide` 为本地展示事件，打开公告面板的“广场指南”；原 `board` 仍打开校园活动。指南沿用现有四屋和池边入口，不新增路由、服务方法或业务字段。
- 三位漫步邻居和小狗向导是场景角色，不是在线同学、公开 User 或私信联系人。邻居靠近问候有冷却，点击查看简短提示；状态仅在场景内存中，离开或进入房屋时关闭。
- 下方石板路连接集市前、池边支路与自己家门前支路；普通路点不会触发房屋跳转，仍须抵达已有门口。

## 2026-10-23 体验与质量调整（A协调，未接真实后端）

- 沿用现有RPC、字段及状态，不增加业务依赖。`pages/content/publish?type=plan&id=<计划ID>` 用于编辑本人有效计划；读取用 `plan.get`，提交用 `plan.update`。`id` 仅在计划编辑时使用，其他类型继续新建。修改后的容量、时间及旧邀请失效按现有服务校验，不在页面伪造状态。
- 商品完成/关闭只接受合法的当前状态，终态操作返回冲突；收藏读取与预约复用内容可见性规则。失物评论沿用 `comment.list` 的 `cursor/nextCursor` 分页，不能丢弃早期线索。
- 精简筛选、卡片时间与名额、邀请/会话摘要均使用已有返回字段；高级条件折叠不改变已提交筛选或加载更多的快照。旧响应、隐藏页面和旧账号不能覆盖新界面。
- 表单保护与首次指路属于界面状态；本轮不增加草稿RPC或本地业务存储，不改变 `pet.save`、衣柜拥有物和奖励结算。锁定装扮只能预览，不得提前装备或发奖。
- 后台暂停与主动离开分别处理；界面暂停不能冒充服务结算或真实跨设备同步。微信专有能力仍需工具和真机验证。

## H5 公网演示部署（2026-10-22）

- GitHub Pages 仅发布 main 已审阅的阶段演示；使用 hash 路由和 `/group-project/` 资源前缀，不新增业务路由或服务方法。
- 发布构建固定 `VITE_API_MODE=mock`，真实接口地址及订阅模板为空；数据保留在当前浏览器，不提供真实认证、公共上传或跨设备通信。
- 部署前缀由构建环境 `UNI_H5_BASE` 提供；本地开发及微信构建沿用原配置。以后接入真实服务须另行验收并修改部署配置，不能把本次静态托管计为真实后端交付。

## 服务端必须校验

身份来自登录态；不接受前端伪造 ownerId/currentUserId。查看公开与本人内容分开；修改检查作者；会话/消息检查参与者；通知标读检查归属；管理员处理举报需要管理员权限；上传校验类型、大小、归属。演示检查只能辅助理解，不能当作生产安全措施。

## 2026-10-24 潜水返航与三人斗地主（A，本地实现契约）

潜水以本文“分类衣柜、精绘宠物与水下闯关”的版本2契约为准：返航保存本局收获，真正通关另发奖金和首通礼物；失败不扣历史余额。旧氧气归零直接失败、结果仅cleared/failed的描述不再是现行接口。

斗地主使用独立真实局域网访客会话，不复用固定mock身份，不称真实校园账号认证。公开配置`VITE_GAME_BASE_URL`为空时明确未配置；`npm run game:local`构建时设为`/game`，由`server/landlord`同源托管H5。接口统一`POST <GAME_BASE>/rpc`，body为`{method,params}`，envelope为`{code,message,data}`；网络与服务错误不回退mock。session.open返回`{token,playerId,nickname}`，后续`Authorization: Bearer <访客令牌>`；身份从令牌取得，不接收伪造playerId。访客失效使用`UNAUTHORIZED`，与校园业务的UNAUTHENTICATED分开处理；客户端凭证按牌桌服务地址隔离，不向页面暴露令牌。

| method | params | data/规则 |
| --- | --- | --- |
| session.open | {nickname} | {token,playerId,nickname}；有效令牌可恢复本人访客，昵称1—12字 |
| landlord.getLobby | {} | {onlineCount,queueCount,roomId,matchStatus}；有效心跳去重的在线访客与排队人数 |
| landlord.joinQueue / cancelQueue | {operationId} | 最新lobby；三人原子匹配；取消与已匹配竞态返回已匹配状态 |
| landlord.getRoom | {roomId} | 本人牌桌快照，含roomId/revision/selfId/phase/currentPlayerId/deadline/serverTime/landlordId/highestBid/highestBidderId/bids/bottomCards/seats/hand/lastPlay/winnerTeam/winnerIds/message；对手不返回未出手牌 |
| landlord.bid | {roomId,score:0..3,operationId,expectedRevision} | 最新本人快照；只接受轮到的玩家叫分 |
| landlord.play | {roomId,cardIds,operationId,expectedRevision} | 服务校验本人持牌、牌型、轮次与压制，合法才移牌 |
| landlord.pass | {roomId,operationId,expectedRevision} | 首出不能过牌；两人都过后原出牌者重新领出 |
| landlord.hint | {roomId} | {cardIds}；只读取本人的合法建议，不泄露对手手牌 |
| landlord.setAuto | {roomId,enabled,operationId,expectedRevision} | 本人托管开关，超时/断线有明确托管标记 |
| landlord.leave | {roomId?,operationId} | 排队取消；进行中离开由托管继续，不伪造胜负；结束可回亭子再匹配 |

牌桌phase为`bidding/playing/finished`；Card为`{id,rank,suit,label}`，rank为3～17（16小王、17大王），suit为spades/hearts/clubs/diamonds/joker。seats公开`{playerId,nickname,seatIndex,handCount,auto,connected,role,lastAction}`，role为null/landlord/farmer；lastAction只公开已经作出的叫分、过牌或已出的牌。bottomCards在地主确定前为空，确定后公开三张底牌；hand始终只包含请求者本人。lastPlay为null或`{playerId,cards,pattern}`，pattern含type/main/length/size。服务校验单张、对子、三张/三带、顺子、连对、飞机及带牌、四带、炸弹与王炸，不接受客户端指定牌型或胜者。

前台约1秒读取牌桌新版本，异步结果按会话/页面/版本隔离；在线为45秒内有有效请求的独立访客，正常回合20秒，超时/离线切为有标记的托管，可接手。写操作按访客operationId及参数指纹幂等，仅保留最近256个成功回执；网络结果不明重试复用同次参数与编号，旧revision冲突后刷新，超出保留窗口不承诺无限期回放。

数据仅在服务进程内存；结束桌10分钟后收起，活动旧局最长30分钟收起且不虚构胜负，无牌桌闲置访客6小时后清理；重启清空会话、排队与牌桌。页面`/rooms/landlord/index`放在`rooms`分包，服务端规则不打入前端；亭子仍为场景地点，四栋业务房子不变，无货币下注或兑换接口。三独立会话的自动化/浏览器验证与三台物理设备分开记录；公网、微信联网及三台物理设备尚未验收。
# 2026-10-25 本机真实服务增量

用户选择先完成本机/同 Wi-Fi 账号、上传和持久化服务；新增 `auth.register`、`auth.logout` 和真实 multipart 上传，既有业务 RPC 字段保持兼容。账号名不代表学籍认证，微信登录未配置时明确拒绝。详细契约与集成责任见 [本机校园服务](local-campus-backend.md)。本节先于代码接入登记，验证结果以 verification.md 为准。

`market.getCandidates({id})` 返回本人商品预约分页（含 buyer/seller）；`reservation.respond({reservationId,accept:boolean})` 由卖家确认/拒绝，`reservation.complete({reservationId})` 由买卖任一方完成已确认预约，重复操作结果一致。新增 `rooms/account/index` 分包账号页面用于独立账号注册/登录；401 业务错误转向该页，退出会话撤销服务端令牌。

本地 `help.getCandidates({helpId})` 仅供本人公开进行中的求助，按同校区真实账号 `skillTags` 与 `category` 忽略大小写完全一致匹配，返回账号与规则理由；不代表 AI 能力评估。`pet.get/save` 将预设外观保存到当前账号，游戏奖励暂不接入校园数据库。
