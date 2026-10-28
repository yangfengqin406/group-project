# 我的互助、求助说明与进度

2026-10-28 用户认可上轮建议，先实施前三项：自己的家集中找回互助、补充可选求助说明、列表直接显示协作进度。继续暂停打包，不扩展感谢/评价或新手引导，不改既有奖励金额、四屋及路由。

## 已确认体验

自己的家增加“我的互助”，分为“待我处理 / 我发出的 / 我申请的”。卡片点击回既有求助详情。待办仅包含需要当前账号选择帮助者或确认解决的内容；申请等待回应、已自行确认等待对方、结束记录仍可在对应历史栏找回。我的申请同帖多次撤回重申请只展示最新一份。

求助发布新增可选 preferredTime（期望时间文本，0～80字，例如周六下午，时间可商量）、estimatedMinutes（预计用时，null或1～480整数分钟）、meetingMode（flexible/online/offline，默认flexible）。时间只表达用户意愿，不承诺日历预约或解析成准确时刻。旧帖子/旧客户端不填仍可用；不强制增加必填项。已有选人后的编辑冻结保持。

公开列表和详情使用 helpProgress：waiting（等待帮助）、helping（已有帮助者）、awaiting_confirmation（等待双方确认）、resolved（已解决）、closed（已结束）。仅暴露进度枚举，不暴露谁确认、谁申请或申请数量。实际状态由原帖子和当前选定申请推导，不用珍珠或客户端点击推测完成。

## 私有查询契约

新增 help.listMine({scope:'todo'|'posted'|'applied',cursor?,pageSize?})，默认todo，返回 {items,nextCursor}。每项 {helpId,help:Content|null,application:Application|null,role:'owner'|'helper',pendingCount?,progress,actionRequired,actionLabel,availability:'available'|'unavailable',updatedAt}；progress取公开helpProgress，申请已撤回且未完成可为closed，不可访问为unavailable。

身份来自会话，不接受ownerId/helperId/userId；分页先筛选、同帖申请去重再分页，游标绑定账号与scope并防篡改。作者可以读取自己的私有帖子及本帖待处理数量；帮助者仅能读取本人申请。原帖改私有、删除或作者注销后，对申请者只返回不可访问占位和本人申请状态，不回填标题/正文/图片/作者资料，不导航到不可访问详情。

todo：作者未选人且有pending申请→选择帮助者；当前accepted且本人尚未确认→确认已解决。已确认等待对方不重复列待办。终态不列待办。posted包含本人未删除求助，applied按每帖最新本人申请汇总，私有状态不跨账号泄露。公用Content摘要只附helpProgress及用户填写的公开说明，不附待办、申请清单或数量。

## 实施与验证

先登记 interfaces/collaboration，再并行实现共享说明/进度与真实私有分页、演示适配、发布/详情/卡片UI，最后整合自己的家私有面板。页面仅调用services；共享规则不含存储。新确认/发布奖励流程维持原事务和幂等逻辑，原账号数据库及现有公网实例不作测试。

测试覆盖旧帖子兼容、说明字段类型/范围、字段更新保留、进度转换与取消、跨模块摘要无私有字段、待办双方顺序/撤回重选/单方完成、本人申请去重、筛选后分页/游标绑定、私有/注销占位、账号切换与迟到结果、回详情入口。运行check、全量test、H5/微信build、WXSS/定向质量与原始包体预算，两个隔离真实H5账号实际走查。当前微信主包接近项目2MiB预算，新面板优先复用现有组件并按真实产物调整，不能略过预算失败。

本设计沿用用户刚批准的三项范围，不增加奖励/评价机制。writing-plans技能未安装，本文记录实施次序与验收。实现前自检：无额外必填、无公开申请隐私、无客户端指定待办或奖额、无新业务房子、无自动更新安装包的承诺。
