# 数据模型与状态

这是后端实现建议，尚未创建任何真实数据库集合。演示的单个本机对象不能直接用作生产数据库架构。

| 实体 | 核心字段 | 关系 / 权限 |
| --- | --- | --- |
| User | id、nickname、campusId、skillTags、bio、avatarImageId | 各模块作者共用；公开资料不包含凭证、手机号等私有字段；avatarImageId 关联 Upload，展示时由服务解析出可访问地址（待群里确认） |
| PetAppearance | userId、species、palette、feature、accessory、name、art? | 当前账号的宠物外观，userId 由服务端身份决定；独立于公开 User，预设搭配使用白名单，原创画稿按下文校验 |
| Bulletin | id、title、body、createdAt、demo、kind、startAt、endAt、location、organizer、participation | 校园活动只读公告；本机种子明确标记演示，真实来源和报名待接入，不借用 event 实体 |
| FishingState | userId、catchCount、fishBook、collection、equipped、activeCast | 当前身份钓获与抛竿；collection/equipped 保留旧三种装饰的兼容视图，拥有物与多槽穿戴以 WardrobeState 为准 |
| FishingCast | id、status、biteAt、escapeAt、meterStartAt?、meterPeriodMs?、meterZone?、landDeadlineAt? | 每身份只有一个有效抛竿，服务侧时钟判定；新抛竿作废旧编号，结果消费编号 |
| WardrobeState | userId、owned、equipped、pearls、clearedLevels | 当前身份独立衣柜与奖励进度；catalog 为公共只读目录，身份、余额和发奖由服务决定，不加入 PetAppearance |
| DiveRun | id、userId、levelId、seed、startedAt、expiresAt | 每身份一个有效关卡编号，按种子回放输入核验后一次性结算；新开局作废旧编号 |
| DiveSettlement | userId、runId、levelId、status、reward | 每身份最近一局服务核验后的只读回执；getState仅返回当前身份lastSettlement。只按本局编号恢复结果，不依赖余额推断；重复finish仍冲突，不再次发奖 |
| Plan | id、ownerId、category、startAt、endAt、capacity、status | 关联作者、成员、邀请；检查校区、日期、时间和容量 |
| Membership | planId、userId、status | 正式数据库建议独立记录，planId+userId 唯一 |
| Invitation | id、senderId、recipientId、sourcePlanId、targetPlanId、status | 来源为被邀请人的单人计划，目标为邀请人的计划 |
| MarketPost | id、ownerId、marketType(sell/buy)、title、body、category、imageIds、priceCents(闲置)、condition、handoverCampus、budgetCents(求购)、keywords、status | 闲置/求购两类；图片存 imageIds，读时由 upload 服务解析为 images；仅 active 可预约，已完成不可改/约 |
| Reservation | id、contentId、buyerId、sellerId、status、createdAt | 本机二手交接预约；同一商品只允许一条pending，状态冲突返回CONFLICT；后续respond/complete仍待实现 |
| LostFoundPost | id、ownerId、lostKind、category、images、location、status | lostKind 为丢失/拾获；category 为卡片/钥匙/杂物；1～3 张图片；作者确认完成 |
| HelpPost | id、ownerId、category、body、status | category 首版为所需技能；后续匹配 User.skillTags |
| Conversation | id、participantIds、contentType、contentId、createdAt | 同一内容与参与者组合去重；仅参与者访问；按来源筛选后，以最新Message.createdAt（无消息取会话createdAt）倒序分页，同时间稳定排序 |
| Message | id、conversationId、senderId、body、createdAt | 发送者取登录态；会话权限由后端校验 |
| Comment | id、contentType、contentId、authorId、body、createdAt | 首版用于失物公开评论；发布者收到站内通知 |
| Notification | id、recipientId、contentType、contentId、read | 业务事件去重；本人读写；模板发送与业务事务分开 |
| Favorite / Report | userId、contentType、contentId 等 | 收藏唯一；举报处理管理员专用 |
| Upload | imageId、ownerId、usage、mime、size、status、url | usage 为 content/avatar；create 返回 imageId 与可访问 url；confirm 后归属业务内容；业务服务校验 ownerId 与数量（≤3）（待群里确认） |

内容通用字段及分页形状见 interfaces.md。MemberIds 数组仅是当前演示实现，不替代正式成员权限表。

宠物演示外观保存在 `src/mock/` 管理的 `petAppearances[userId]` 中；旧的 version=1 演示存档缺少该字段时返回默认外观，不清空原有发布和消息。四款预设仍返回 species/palette/feature/accessory/name 五字段。原创使用 `species: 'custom'`、`palette: 'cream'`、`feature: 'art'`、`accessory: 'none'`，增加 `art: { front, back }`；不将画稿混入公开 User 字段。

每个 ArtFrame 为 32×32 的像素数组（1024 项，透明 null 或 `pet-art.js` 允许的 16 色）或 PNG data URI。正面须非空，背面允许 null；PNG 每张不超过 256 KiB、宽高各不超过 512 像素，并校验真实格式和可解码性。保存、读取与编辑草稿之间深度复制，避免像素数组或正背面对象互相污染。

这些原创数据只用于本机演示保存，文件导入不代表公共上传。真实预设同步需要后端实现 `pet.get/save`；真实原创保存当前明确返回 NOT_IMPLEMENTED，公共上传和后端存储接入后再开放。

钓鱼演示状态由 `src/mock/` 管理的 `fishingStates[userId]` 保存；旧存档没有该字段时读取空鱼册、无有效抛竿。旧接口的 `collection` 与单件 `equipped` 保留兼容，分别投影衣柜中 lily-pad（小荷叶）、reed-bow（芦苇结）、bubble-star（水泡星）的拥有数量与实际佩戴；不能把兼容投影再次写回旧计数而重复迁移。新钓获仍进入同一衣柜。

分类衣柜保存在 `wardrobes[userId]`。公共目录共有 23 件，槽位为 `hair/head/outfit/feet/bag/hand/charm`；返回 `{catalog,owned:[{id,count}],equipped:{七槽:null|id},pearls,clearedLevels}`。按2026-10-19用户新要求取消七件赠送：新身份owned为空、七槽未穿戴、珍珠为0、通关列表为空；旧拥有物、旧装备及通关不删除。目录物品含`id/name/slot/cost/unlockLevel/source/description`，价格25～90珍珠；`unlockLevel`为0～3，只有三种钓鱼饰品为0，其余兑换前必须在服务保存的clearedLevels中包含该关。叶子背包需第二关及90珍珠。已拥有物兑换重试优先返回、不扣款不增数量；未解锁返回FORBIDDEN，余额不足返回CONFLICT，失败均不改变原状态。

旧钓鱼装饰按每项已迁移数量的最高记录补入增量，旧单件佩戴仅迁移一次且不覆盖已有衣柜槽位；重复读取、重新穿戴或兑换旧三件不能重复增长拥有数量。迁移标记只留在 mock 内，不进入公开返回结构。穿戴同槽替换、跨槽并存；只接受已拥有且槽位匹配的物品，null 脱下该槽。`PetAvatar.wardrobe` 有值时使用多槽显示，旧 `ornament` 仅作兼容；衣柜不写入 `pet.save`，不随外观草稿还原，读取和结果均深度复制。

Cast 仅持有 waiting/hooked 状态：抛竿后约 1.4～2.5 秒咬钩，咬钩窗口持续 2.4 秒；有效提竿后 150ms 开始标尺，1600ms 完成左右往返，绿色区域为 [0.28,0.78]，提竿后 10 秒内收线。服务以自身时钟判定，成功计入鱼册、首次赠小荷叶，后续成功按 35% 概率掉落随机装饰并累加。caught/escaped 是操作结果，都会清空 activeCast；重复、过期或他人编号不能再次发奖，客户端不得传入成功、鱼种、奖励或身份。

潜水活动编号由 `diveRuns[userId]` 保存；`dive.getState` 的通关列表和珍珠来自衣柜，解锁关卡由连续通关进度推导。`start` 只接受已解锁的 1～3 关，新编号替换旧编号；`finish` 只接受 `{runId,ticks,trace}`，输入改变事件为 `{tick,dx,dy,fire}`。工具按 seed 和 50ms 固定步长重放方向及泡泡操作；限定输入范围、记录长度和实际经过时间，拒绝旧编号、他人编号及客户端奖励声明，结果为 cleared 或 failed，完成后消费编号。本地数据和回放可供演示校验，不能作为生产防作弊方案。

三关均为三颗爱心，氧气分别为 40/42/45 秒，目标为收齐 3/4/5 颗关卡珍珠并到达出口。场内收集数是通关条件，不直接写入衣柜余额；只有服务确认通关后按固定规则发奖，失败不发奖、不扣现有装扮。

| 关卡 | 首通装扮 | 首通珍珠 | 重玩通关珍珠 |
| --- | --- | --- | --- |
| 1 浅湾拾光 | 水手衫、贝壳鞋 | 30 | 8 |
| 2 珊瑚小径 | 云朵发髻、贝壳挎包 | 45 | 12 |
| 3 星光海沟 | 贝壳皇冠、星星魔杖、珍珠徽章 | 60 | 18 |

首通把关卡写入 `clearedLevels` 并发固定装扮；后续有效通关只发重玩珍珠，不能重复领套装。同一 run 不能重复结算，所有衣柜、鱼册和潜水编号均按身份隔离且返回独立副本；不涉及交易、付费或真实货币。真实服务仍需独立后端存储、认证和事务。

公告通过 `bulletin.list` 只读分页。演示校园活动使用 `kind: 'campus-activity'`，相对当前北京时间生成未来 1/2/3 天的三条活动，过滤已结束项后分页；包含起止时间、地点、组织方和参与方式，明确为虚构内容，不写入报名、event 或私信状态。

状态约定：Plan open/full/closed/completed/expired；Invitation pending/accepted/rejected/cancelled/expired；Market active/reserved/completed/closed；Lost active/returned/closed；Help open/completed/closed。

2026-10-22 A状态规则补齐：计划 `open/full` 由容量和成员数计算，到结束时间转 `expired`；`closed/completed/expired` 不因编辑容量恢复。待处理邀请不再满足公开性、来源单人、时间重叠、容量等推荐条件时永久转 `expired`。沿用既有状态，无新增字段；真实存储的事务校验仍待接入，详见interfaces.md。

真实后端的索引建议：校区+类别+状态、作者+时间、会话参与者、conversationId+消息时间、recipientId+通知时间。把容量校验、来源计划关闭和成员写入放在一次事务中；不要让客户端控制状态流转。
