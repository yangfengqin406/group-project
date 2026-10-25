# 接口维护清单

本清单记录2026-10-25本机真实服务整合；本轮尚未合入main，交付状态见weekly-log.md。默认演示和公网GitHub Pages仍为mock。

完整函数定义在 src/services，具体输入返回看 interfaces.md；表中“演示”只表示本机实现。

本轮复用 C（姜澜）backend/c，以 backend/campus 接上独立账号、上传和 A/B 内容，真实 HTTP 和两隔离浏览器流程已实测。物理双设备、微信真机和公网真实后端未验，订阅未实现。

| 接口 | 负责人 | 当前状态 |
| --- | --- | --- |
| auth.login | B | 本机独立账号真实密码校验/令牌；不核验学籍，微信未配置时明确拒绝 |
| auth.register | B | 本机真实注册，唯一账号、加盐scrypt；不能提交角色或伪造学籍 |
| auth.logout | B | 本机真实撤销会话，旧令牌失效 |
| user.getProfile | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| user.updateProfile | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| user.listPublicContent | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| pet.get | A | 本机真实读取当前账号预设外观；默认演示仍支持原创 |
| pet.save | A | 本机真实保存预设外观；真实原创仍明确NOT_IMPLEMENTED，演示支持正背画稿 |
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
| upload.create | B | HTTP由services实际multipart上传，校验PNG/JPEG/WebP签名、大小和尺寸，文件持久存储；mock仍用临时图 |
| upload.confirm | B | 本机校验所有权；绑定目标需服务端验证目标和图片引用，确认不会直接公开私有图 |
| conversation.open | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| conversation.get | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| conversation.list | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| message.send | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| message.list | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| comment.create | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| comment.list | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| notification.list | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| notification.markRead | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| favorite.set | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| favorite.list | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| myContent.list | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| report.create | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| report.adminResolve | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| plan.create | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| plan.update | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| plan.get | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| plan.list | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| plan.close | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| plan.complete | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| plan.getCandidates | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| invitation.create | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| invitation.list | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| invitation.respond | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| invitation.cancel | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| help.create | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| help.get | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| help.list | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| help.update | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| help.complete | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| help.getCandidates | A | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| market.create | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| market.update | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| market.get | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| market.list | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| market.close | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| market.complete | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| market.reserve | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| market.getCandidates | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| market.matchCandidates | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| reservation.respond | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| reservation.complete | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| lostFound.create | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| lostFound.update | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| lostFound.get | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| lostFound.list | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| lostFound.markReturned | C | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| event.list | A | 仅预留，未实现 |
| event.get | A | 仅预留，未实现 |
| event.createPlan | A | 仅预留，未实现 |
| appraisal.estimate | B | 本机真实 SQLite + 权限/事务已接；已纳入 HTTP 与联合回归，公网及物理设备/微信真机另验 |
| subscription.send | C | C服务明确NOT_IMPLEMENTED，真实模板/服务端发送及真机未完成 |
