# 数据模型与状态

2026-10-25 本机真实服务新增：`campus.users` 保存本地账号名、加盐 scrypt 摘要和仅服务端可信角色；`campus.sessions` 仅保存随机令牌的 SHA-256 摘要、到期和撤销状态；RPC 资料白名单不返回摘要、角色或密码。`campus.uploads` 记录真实文件路径、MIME、字节数、所属账号、用途与确认状态，文件放忽略目录。A/B 内容和 C 消息共用 `c_records` 与同一事务；唯一索引保证账号、令牌、事件唯一及预约防超卖。独立账号未核验学籍。见[本机接入](local-campus-backend.md)。

校园业务部分是后端实现建议，尚未创建真实数据库集合；演示的单个本机对象不能直接用作生产数据库架构。文末另记独立斗地主服务的当前内存模型，它不替代校园用户或业务数据库。

| 实体 | 核心字段 | 关系 / 权限 |
| --- | --- | --- |
| User | id、nickname、campusId、skillTags、bio、avatarImageId | 各模块作者共用；公开资料不包含凭证、手机号等私有字段；avatarImageId 关联 Upload，展示时由服务解析出可访问地址（待群里确认） |
| PetAppearance | userId、species、palette、feature、accessory、name、art? | 当前账号的宠物外观，userId 由服务端身份决定；独立于公开 User，预设搭配使用白名单，原创画稿按下文校验 |
| Bulletin | id、title、body、createdAt、demo、kind、startAt、endAt、location、organizer、participation | 校园活动只读公告；本机种子明确标记演示，真实来源和报名待接入，不借用 event 实体 |
| FishingState | userId、catchCount、fishBook、collection、equipped、activeCast | 当前身份钓获与抛竿；collection/equipped 保留旧三种装饰的兼容视图，拥有物与多槽穿戴以 WardrobeState 为准 |
| FishingCast | id、status、biteAt、escapeAt、meterStartAt?、meterPeriodMs?、meterZone?、landDeadlineAt? | 每身份只有一个有效抛竿，服务侧时钟判定；新抛竿作废旧编号，结果消费编号 |
| WardrobeState | userId、owned、equipped、pearls、clearedLevels | 当前身份独立衣柜与奖励进度；catalog 为公共只读目录，身份、余额和发奖由服务决定，不加入 PetAppearance |
| DiveRun | id、userId、levelId、rulesVersion、seed、startedAt、expiresAt | 当前rulesVersion=2，每身份一个有效编号；旧版本失效，新局作废旧编号，最多60秒模拟、360秒活动有效期 |
| DiveSettlement | userId、runId、levelId、rulesVersion、status、collectedPearls、reward | status为cleared/returned/failed，回执按账号/编号/关卡/版本恢复；只读、一次结算，余额不用于推断本局结果 |
| Plan | id、ownerId、category、startAt、endAt、capacity、status | 关联作者、成员、邀请；检查校区、日期、时间和容量 |
| Membership | planId、userId、status | 正式数据库建议独立记录，planId+userId 唯一 |
| Invitation | id、senderId、recipientId、sourcePlanId、targetPlanId、status | 来源为被邀请人的单人计划，目标为邀请人的计划 |
| MarketPost | id、ownerId、marketType(sell/buy)、title、body、category、imageIds、priceCents(闲置)、condition、handoverCampus、budgetCents(求购)、keywords、appraisal?、status | 闲置/求购两类；图片存 imageIds，读时由 upload 服务解析为 images；appraisal仅闲置参考快照，区间/依据/固定参考声明校验见interfaces.md，不是鉴定凭证；改成求购删除旧快照。仅active可预约，已完成不可改/约 |
| Reservation | id、contentId、buyerId、sellerId、status、createdAt | 本机真实二手交接预约；同一商品仅一条pending/accepted，卖家接受/拒绝后双方可完成；重复操作幂等，状态冲突CONFLICT |
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

潜水活动编号由`diveRuns[userId]`保存；`dive.getState`的通关及余额来自衣柜，解锁由连续通关进度推导。当前Run带`rulesVersion:2`，旧版本失效重开；`start`只接受已解锁的1～3关，新编号替换旧编号，expiresAt为startedAt后360秒。`finish`仅收`{runId,ticks,trace}`，输入事件为`{tick,dx,dy,fire,returning?}`；省略returning按false兼容。按seed与50ms固定步长回放，最多1200步/1200条输入，检查经过时间、严格递增事件、身份与编号，不接受客户端结果或金额。终局为cleared/returned/failed，消费编号、入袋与回执一次完成；本机回放不等同生产防作弊。

三关均为3爱心、40/42/45秒氧气、3/4/5颗目标珍珠。缺氧归零先扣1心，之后每100步扣1心；同一步碰撞与缺氧最多扣1心。引擎快照的returningTicks为0～40，持续静止返航40步且未受伤才returned，移动、松开、受伤打断；oxygenDamageTicks为0～100，缺氧后表示距下一次扣心的步数。暂停不推进模拟、不恢复血氧，新开局恢复满状态。

场内每颗珍珠形成1枚未入袋收获；returned只把已拾数量加到衣柜，不记通关、不发套装。cleared带回收获并发下表奖金，reward.pearls为本次实际新增总额；首通合计33/49/65，重游11/16/23。failed的reward为null，只丢本局收获，不扣已有余额、装扮或通关；collectedPearls仍记录实际拾取数，以解释丢失或带回数量。返航0收获的reward为`{firstClear:false,items:[],pearls:0}`。未结算的采集计数不能即时当成钱包余额。

| 关卡 | 首通装扮 | 首通额外奖金 | 重游额外奖金 |
| --- | --- | --- | --- |
| 1 浅湾拾光 | 水手衫、贝壳鞋 | 30 | 8 |
| 2 珊瑚小径 | 云朵发髻、贝壳挎包 | 45 | 12 |
| 3 星光海沟 | 贝壳皇冠、星星魔杖、珍珠徽章 | 60 | 18 |

真正首通把关卡写入`clearedLevels`并发固定装扮；返航不消耗首通机会，后续通关不能重复领套装。`diveSettlements[userId]`保存最近一次只读回执的runId/levelId/rulesVersion/status/collectedPearls/reward，重读不重复入袋，重复finish仍冲突。衣柜、鱼册及潜水按身份隔离并深拷贝；不涉及交易、付费或真实货币，真实业务仍需后端存储、认证与事务。

公告通过 `bulletin.list` 只读分页。演示校园活动使用 `kind: 'campus-activity'`，相对当前北京时间生成未来 1/2/3 天的三条活动，过滤已结束项后分页；包含起止时间、地点、组织方和参与方式，明确为虚构内容，不写入报名、event 或私信状态。

状态约定：Plan open/full/closed/completed/expired；Invitation pending/accepted/rejected/cancelled/expired；Market active/reserved/completed/closed；Lost active/returned/closed；Help open/completed/closed。

2026-10-22 A状态规则补齐：计划 `open/full` 由容量和成员数计算，到结束时间转 `expired`；`closed/completed/expired` 不因编辑容量恢复。待处理邀请不再满足公开性、来源单人、时间重叠、容量等推荐条件时永久转 `expired`。沿用既有状态，无新增字段；真实存储的事务校验仍待接入，详见interfaces.md。

真实后端的索引建议：校区+类别+状态、作者+时间、会话参与者、conversationId+消息时间、recipientId+通知时间。把容量校验、来源计划关闭和成员写入放在一次事务中；不要让客户端控制状态流转。

## 三人斗地主：独立服务内存模型

`server/landlord/service.mjs`使用独立访客令牌、players、sessions、queue及rooms，不写入校园User、mock存档或衣柜钱包。客户端凭证按服务地址隔离保存；服务从Bearer令牌确定playerId，昵称不是校园账号认证。

| 对象 | 核心字段与约束 |
| --- | --- |
| Guest | id、nickname、lastSeen、roomId、operations；45秒内有有效请求才算在线，无牌桌闲置6小时清理 |
| Session | 随机token→playerId映射；只返回本人，不返回其他访客令牌 |
| Queue | 去重的在线playerId队列，三人原子匹配；离线、已进桌或主动取消移出，不用机器人补位 |
| Room | id、playerIds、hands、bottomCards、phase、turn、revision、deadline、landlordId、bids、lastPlay、auto、winnerTeam、winnerIds及时间；服务持有所有未出手牌，客户端只收到本人hand和对手公开张数/动作 |
| Operation receipt | 每访客最近256次成功写操作的operationId、规范化参数指纹和深拷贝结果；同编号不同参数冲突，超出窗口不承诺长期重放 |

phase为bidding/playing/finished，正常回合20秒，超时/离线明确切为托管，可回来接手。结束桌10分钟后清理，活动旧局最长30分钟后清理且不编造胜负；服务重启即丢失全部会话、排队、牌桌及操作回执。该内存模型不提供数据库持久化、多实例事务或生产校园权限，不与珍珠/装扮结算关联。
