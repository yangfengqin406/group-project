# 接口契约 v0.2

## 调用层约定

页面调用 src/services 中的模块函数，例如 `market.list({ keyword, cursor, pageSize })`。call 内部在 mock/http 模式之间切换。

真实 HTTP 适配建议统一 RPC：`POST <VITE_API_BASE_URL>/rpc`，body 为 `{ method, params }`，登录后带 `Authorization: Bearer <token>`。这是本骨架约定，**还没有实现服务器**。如果后端采用 CloudBase 云函数，在 transport.js 增加云函数适配；页面调用名称和输入结果不变，不要把 CloudBase 环境 ID 当成 HTTP URL。

返回 envelope：`{ code: 'OK', message: '', data, requestId }`。call 成功只返回 data，失败抛 ServiceError，不回退演示数据。错误有 INVALID_ARGUMENT、UNAUTHENTICATED、FORBIDDEN、NOT_FOUND、CONFLICT、SERVICE_UNAVAILABLE；骨架补充 NOT_IMPLEMENTED / NOT_SUPPORTED，明确尚未实现或平台不支持。

列表统一 `{ items: [], nextCursor: null }`，pageSize 默认 20，最多 50；cursor 必须由服务端返回。演示用 offset 字符串，真实数据库可使用不透明 cursor。所有内容 ID 是字符串，详情与修改统一用 `{id}`；plan.getCandidates 使用 `{planId}`。

## 第一阶段列表与广场交互补充

- 搭子和技能互助列表组合使用既有 `keyword`、`category`、`status`、`cursor`、`pageSize`。`category` 为与发布内容一致的完整类别/技能字符串，`status` 为既有状态值；空字符串表示不限制。后端先完成筛选再分页，后续页保留同一组已生效条件；只编辑输入框而未提交搜索时，不影响加载更多。
- `FeedList` 的可选属性为 `showFilters: Boolean`（默认关闭）、`categoryOptions: Array<String>`、`statusOptions: Array<{label,value}>`。预设类别用于快捷选择，允许手动填写已有分类；不得把它们当成新的公共枚举或限制发布。
- 广场坐标按背景宽高归一化到 `[0,1]`。移动工具的 `createPlazaWalker` 对外提供 `getState()`、`moveTo(point)`、`advance(seconds)`、`stop()`：目的地投影到闭合步道，沿较短方向行走，不穿越中心树岛；这是本地场景状态，不持久化业务数据，也不表示多人位置同步。

## 宠物外观（本地版本）

- 新增 A 维护的 `pet.get()`、`pet.save(appearance)`，统一通过 `src/services/pet.js` 调用。返回当前账号的 `{ species, palette, feature, accessory, name }`，不接受指定其他用户或作者；尚未保存时返回默认糯叶兔外观。演示数据按虚构账号分别保存，旧演示存档无宠物字段时仍可读取默认值。
- `species` 为 mushroom/capybara/rabbit/squirrel；`palette`、`feature`（耳朵或蘑菇帽型）、`accessory` 使用 `src/utils/pet-appearance.js` 中明确允许的组合，名称去首尾空白后为 1～12 个 Unicode 字符。无效外观保存返回 INVALID_ARGUMENT，不影响上一次保存。
- 页面编辑的是草稿；切换物种时采用该物种的默认耳朵/帽型，保留配色、配饰和名字；点击“保存并去广场”成功后才生效。页面内“回到广场”会确认放弃草稿；系统返回离开不保存修改。保存失败保留草稿并显示错误。
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
- 关卡首通固定奖及30/45/60珍珠、重玩8/12/18珍珠不变；未获首通装扮可继续收集珍珠自选兑换。界面显示尚需通关的关卡、兑换价格和首通目标，并从衣柜直接进入既有潜水弹层，不新增页面。
- 四款预设发型按头皮、耳根和帽檐分别绘制正背专属局部，鞋替换裸脚区域并连接脚踝；双肩包正面只显示肩带、背面显示包体。外部PetAvatar调用及服装服务字段不变；原创画稿仍使用通用定位，不识别任意头/脚形状。

### 分类衣柜、精绘宠物与水下闯关（2026-10-16，本地扩展）

- 用户确认固定首通奖励＋珍珠自选兑换。新增 `wardrobe` 与 `dive`（A），仍只通过 services 调用；业务存储仅在 mock，真实失败不回退演示。新衣柜不向 pet.save 增加字段，既有预设/原创外观兼容。
- 衣柜7槽为 `hair/head/outfit/feet/bag/hand/charm`，同槽替换、不同槽叠穿。共享目录 `src/utils/wardrobe-catalog.js` 提供 `WARDROBE_SLOTS`（id/label）、`WARDROBE_ITEMS`（id/name/slot/cost/source/description）及 `STARTER_ITEMS`。23件：hair=acorn-bob/cloud-bun/sea-braid；head=lily-pad/reed-bow/straw-hat/shell-crown；outfit=sailor-shirt/moss-cape/coral-dress；feet=rain-boots/shell-shoes/leaf-slippers；bag=leaf-backpack/shell-pouch/bottle-bag；hand=tiny-net/clover-umbrella/star-wand；charm=bubble-star/pearl-badge/clover-pin/glow-jelly。每个槽有一件入门物可直接搭配，其余由钓鱼/首通/珍珠兑换获取。
- `wardrobe.getState()` → `{catalog,owned:[{id,count}],equipped:{hair,head,outfit,feet,bag,hand,charm},pearls,clearedLevels:[1,2,3]}`。`wardrobe.equip({slot,itemId:string|null})` → state，只能穿已拥有且槽位匹配的物品；null摘下该槽。`wardrobe.redeem({itemId})` → state，按目录价格扣珍珠，重复兑换已拥有物不重复扣款；不能伪造价格/余额/身份。
- 旧 fishing.collection 的荷叶/芦苇结/水泡星迁移为衣柜拥有物，旧单件佩戴迁移到对应槽，不清空存档、不重复累计；后续钓获进入同一衣柜。fishing旧5方法保留兼容。`PetAvatar` 新可选 `wardrobe:Object|null`；传入时按衣柜多槽显示，否则保留旧ornament。新bag覆盖旧satchel，新head覆盖旧flower，避免同部位叠两件。
- 四款预设改为参照用户概念图的透明精绘像素插画，提供真实正背面及对应耳型/帽型；保留四种配色显示（cream标为“原色”）。原创画布/PNG继续可用；衣柜为独立层，不伪造原创背面。
- `dive.getState()` → `{clearedLevels,unlockedLevel,pearls,activeRun:Run|null}`；`dive.start({levelId:1|2|3})` → `Run:{id,levelId,seed,startedAt,expiresAt}`，只可开已解锁关卡，新run使旧run失效。每关为固定步长50ms的泡泡冒险：方向操作、发射泡泡、怪鱼/海胆碰撞、珍珠收集、找到出口；3爱心与氧气时限。
- `dive.finish({runId,ticks,trace})` → `{status:'cleared'|'failed',reward:{firstClear,items:[id],pearls}|null,wardrobe:WardrobeState,state:DiveState}`。trace为输入改变事件数组 `{tick,dx,dy,fire}`，dx/dy为-1..1，fire布尔；工具 `src/utils/dive-game.js` 用 seed 重放固定步长输入核验结果。服务侧拒绝超长/越界/旧或他人编号、客户端直接提交成功/奖励；编号结算一次，失败不发奖。演示回放不等同生产防作弊或在线服务器。
- 首通L1送sailor-shirt＋shell-shoes及30珍珠；L2送cloud-bun＋shell-pouch及45珍珠；L3送shell-crown＋star-wand＋pearl-badge及60珍珠。重玩通关分别8/12/18珍珠，不重复发首通套装；失败不扣已拥有装扮，不消耗购买资源。全为不可交易本机装扮，无付费或真实货币。
- `FishingPond` 与宠物收纳袋复用分类衣柜，池边增加“潜水闯关”入口；仍不新增业务房子或路由，潜水以独立弹层打开。亭子真人麻将不属于本轮。

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
- `PlazaScene` 可用独立 `pond`/`pavilion` 场景地点及支路，不计入四栋业务建筑；走到池边后触发 `pond`，亭子触发 `pavilion` 展示规划状态，不能伪造真人匹配。原四楼 `enter` 和消息入口保持。
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
| market.create | `{ marketType:'sell'|'buy', title, body, category, imageIds?, priceCents?, condition?, handoverCampus?, budgetCents?, keywords? }` | 保存后的二手内容；闲置需 priceCents/condition，求购需 budgetCents/keywords；imageIds 服务校验归属与 ≤3 张 |
| market.update | `{ id, ...可更新字段 }` | 仅发布者可改，已完成/已下架不可改；imageIds 同 create 校验 |
| market.get | `{ id }` | 二手详情，images 为服务解析出的可访问地址数组 |
| market.list | `{ keyword?, category?, campusId?, marketType?, status?, cursor?, pageSize? }` | 二手列表分页，pageSize 默认 20 上限 50 |
| market.close | `{ id }` | 发布者下架，status=closed |
| market.complete | `{ id }` | 发布者标记交易完成，status=completed；完成后不可预约/修改 |
| market.reserve | `{ id }` | 非发布者预约交接，status=active 才可预约；同商品不可重复预约，冲突返回 CONFLICT |
| market.getCandidates | `{ id }` | 发布者查看该商品的待处理预约列表 |
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
| conversation.list | `{cursor?,pageSize?}` | 当前用户会话分页，含 peer 摘要、lastMessage 与原内容字段 |
| message.list | `{conversationId,cursor?,pageSize?}` | Message 分页，含 sender 摘要，按新到旧排列 |
| message.send | `{conversationId,body,idempotencyKey}` | 保存的 Message |
| comment.list | `{contentType,contentId,cursor?,pageSize?}` | 公开评论分页，含 author 摘要 |
| comment.create | `{contentType,contentId,body}` | 当前仅 lost_found；保存评论并给非本人发布者生成站内通知 |
| notification.list/markRead | 分页 / `{notificationId}` | 通知分页 / 保存的通知 |
| favorite.set/list | `{contentType,contentId,selected}` / 分页 | `{selected}` / 收藏分页 |
| report.create | `{contentType,contentId,reason}` | 举报编号与状态 |

所有预留的方法名称及维护人见 src/contracts/catalog.json；未实现项见 docs/status.md。reservation、event、appraisal 和服务器订阅发送只留调用位置，不伪造成功。

## 推荐与邀请规则

匹配目标计划必须由当前用户拥有、仍有空位且未结束。候选同校区、同类别、北京时间同日、有效时间严格重叠、仍为单人 open 计划，排除本人。返回 overlap 和理由，不返回虚假的成功率。

邀请 targetPlanId 是邀请人自己的计划，sourcePlanId 是被邀请人的单人计划。接收人接受后加入 target，source 关闭并记录 joinedPlanId。真实后端需用事务同时检查权限、容量、来源状态、成员唯一性和幂等。第一版不处理整队合并。

通知与业务结果分开：订阅发送失败不撤销组队。requestSubscription 只在微信端用户点击时申请授权；subscription.send 必须服务端受控，不能任意从前端调用发送模板消息。

## 服务端必须校验

身份来自登录态；不接受前端伪造 ownerId/currentUserId。查看公开与本人内容分开；修改检查作者；会话/消息检查参与者；通知标读检查归属；管理员处理举报需要管理员权限；上传校验类型、大小、归属。演示检查只能辅助理解，不能当作生产安全措施。
