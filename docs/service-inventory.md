# 接口维护清单

完整函数定义在 src/services，具体输入返回看 interfaces.md；表中“演示”只表示本机实现。

2026-10-25：C 下列失物/会话/消息/评论/通知/举报接口新增 `backend/c/` SQLite 参考服务（详见其 README），已提供持久化及权限集成测试；尚未接 B 认证/上传、未部署和双设备验收。表中较早的“真实后端待实现”按此补记更新为“C服务代码已有，团队适配及线上接入待完成”。订阅发送仍未实现。

| 接口 | 负责人 | 当前状态 |
| --- | --- | --- |
| auth.login | B | H5参数非空时切固定演示身份；不验证学号密码，微信明确未实现；真实认证待接 |
| user.getProfile | B | 本机演示；真实后端待实现 |
| user.updateProfile | B | 本机演示；真实后端待实现 |
| user.listPublicContent | B | 本机演示；真实后端待实现 |
| pet.get | A | 当前身份预设或原创外观，本机演示；真实后端待实现 |
| pet.save | A | 本机校验并保存预设或原创正背面；真实预设走 RPC 待后端，真实原创明确 NOT_IMPLEMENTED |
| bulletin.list | A | 未来校园活动只读分页，含时间/地点/组织方/参与方式；明确演示、非真实报名，真实来源待接入 |
| fishing.getState | A | 当前身份鱼册与有效抛竿；旧三装饰/单件佩戴为衣柜兼容视图，本机演示；真实后端待实现 |
| fishing.cast | A | 本机创建唯一有效抛竿，新编号替换旧编号；真实后端待实现 |
| fishing.hook | A | 本机按服务时钟判定咬钩窗口，错过返回逃脱并消费编号；真实后端待实现 |
| fishing.land | A | 本机按服务时钟判定绿区收线，装饰进入同一衣柜，发奖后消费编号；真实后端待实现 |
| fishing.equip | A | 兼容旧三装饰戴/摘并同步对应衣柜槽位，不覆盖其他装扮，独立于 pet.save；真实后端待实现 |
| wardrobe.getState | A | 本机七槽23件目录（含unlockLevel）、拥有数、穿戴、珍珠与通关进度；新身份空衣柜，保留旧拥有物并迁移旧钓鱼装饰；真实后端待实现 |
| wardrobe.equip | A | 本机只穿戴已拥有且部位匹配的物品，同槽替换、null脱下该槽；真实后端待实现 |
| wardrobe.redeem | A | 本机先校验指定关卡已通关再按目录价格兑换；未解锁FORBIDDEN且不扣款，已拥有物重试不重复扣款；真实后端待实现 |
| dive.getState | A | 本机通关进度、顺序解锁、珍珠及有效关卡编号；真实后端待实现 |
| dive.start | A | 本机创建已解锁关卡和种子，新编号替换旧编号；真实后端待实现 |
| dive.finish | A | 本机固定步长回放输入并一次性结算，首通固定装扮与珍珠、重玩只发珍珠；不等同生产防作弊，真实后端待实现 |
| upload.create | B | 本机记录content/avatar用途与临时地址，返回imageId；无云存储/文件类型大小校验，真实上传待接 |
| upload.confirm | B | 本机校验图片归属并标记confirmed；真实业务关联与存储待接 |
| conversation.open | C | 本机演示；真实后端待实现 |
| conversation.get | C | 参与者直接读取会话；mock 与 C 服务端已有，线上待接入 |
| conversation.list | C | 本机演示；真实后端待实现 |
| message.send | C | 本机演示；真实后端待实现 |
| message.list | C | 本机演示；真实后端待实现 |
| comment.create | C | 失物公开评论本机演示；真实后端待实现 |
| comment.list | C | 失物公开评论本机演示；真实后端待实现 |
| notification.list | C | 本机演示；真实后端待实现 |
| notification.markRead | C | 本机演示；真实后端待实现 |
| favorite.set | B | 本机演示；真实后端待实现 |
| favorite.list | B | 本机演示；真实后端待实现 |
| myContent.list | B | 本机演示；真实后端待实现 |
| report.create | C | 本机演示；真实后端待实现 |
| report.adminResolve | C | C 服务端校验真实管理员角色后处理并通知；演示仍未实现，管理员后台待接 |
| plan.create | A | 本机演示；真实后端待实现 |
| plan.update | A | 本机演示；真实后端待实现 |
| plan.get | A | 本机演示；真实后端待实现 |
| plan.list | A | 本机演示；真实后端待实现 |
| plan.close | A | 本机演示；真实后端待实现 |
| plan.complete | A | 本机演示；真实后端待实现 |
| plan.getCandidates | A | 本机演示；真实后端待实现 |
| invitation.create | A | 本机演示；真实后端待实现 |
| invitation.list | A | 本机演示；真实后端待实现 |
| invitation.respond | A | 本机演示；真实后端待实现 |
| invitation.cancel | A | 本机演示；真实后端待实现 |
| help.create | A | 本机演示；真实后端待实现 |
| help.get | A | 本机演示；真实后端待实现 |
| help.list | A | 本机演示；真实后端待实现 |
| help.update | A | 本机演示；真实后端待实现 |
| help.complete | A | 本机演示；真实后端待实现 |
| help.getCandidates | A | 仅预留，未实现 |
| market.create | B | 本机演示；真实后端待实现 |
| market.update | B | 本机演示；真实后端待实现 |
| market.get | B | 本机演示；真实后端待实现 |
| market.list | B | 本机演示；真实后端待实现 |
| market.close | B | 本机演示；真实后端待实现 |
| market.complete | B | 发布者标记completed本机演示；真实权限/事务待接 |
| market.reserve | B | 本机非本人/active商品只允许一条pending预约；真实后端待接 |
| market.getCandidates | B | 本机发布者查看该商品pending预约分页；真实后端待接 |
| reservation.respond | B | 仅预留，未实现 |
| reservation.complete | B | 仅预留，未实现 |
| lostFound.create | C | 本机演示；真实后端待实现 |
| lostFound.update | C | 本机演示；真实后端待实现 |
| lostFound.get | C | 本机演示；真实后端待实现 |
| lostFound.list | C | 本机演示；真实后端待实现 |
| lostFound.markReturned | C | 本机演示；真实后端待实现 |
| event.list | A | 仅预留，未实现 |
| event.get | A | 仅预留，未实现 |
| event.createPlan | A | 仅预留，未实现 |
| appraisal.estimate | B | 仅预留，未实现 |
| subscription.send | C | 仅预留，未实现 |
