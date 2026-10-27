# 本机与同 Wi-Fi 校园服务（2026-10-25）

## 2026-10-27 完整玩法与HTTPS发布配置

真实 `fishing.* / wardrobe.* / dive.*` 现已接入：服务端UUID、时钟/输入回放、消费局号与奖励同SQLite事务，按账号持久化，兑换重试不重复扣款。原创宠物像素/PNG也可保存，校验逻辑不放宽。正式服务仍不自动创建样例；独立展示脚本才在专用目录创建明确虚构的教学数据。

`CAMPUS_PUBLIC_ORIGIN` 配置严格HTTPS源；`CAMPUS_TRUSTED_PROXIES` 显式列出直连代理IP，默认忽略转发头；`CAMPUS_BIND_HOST` 可限定回环。HTTPS图片URL与Secure文件Cookie、可信链限流均有HTTP回归。详见[部署包](release-2026-10-27.md)。

用户已确认暂时没有云环境，本轮完成独立账号、实际图片上传和 SQLite 持久化校园业务；不把独立账号称为微信登录或已验证学籍。正式微信登录、公网 HTTPS 与审核仍需环境配置。

## 接入设计与协作

- Node.js 22 内置 HTTP、crypto、SQLite；复用 C（姜澜）的 `backend/c`，所有校园模块共用同一连接和同步事务。A（杨凤琴）负责本轮集成；原模块归属不变。
- `backend/campus/accounts.js` 负责账号、会话、文件登记。导出 `createAccounts({store, uploadsDir, uploadOrigin})`，返回 `invoke(method, params, context)`、`authenticate(token)`、`getUser(id)`、`publicUser(id)`、`getUploadByUrl(url)`、`receiveUpload({userId,usage,buffer,mime})`、`getUpload(id)`。
- `backend/campus/market.js` 导出 `createMarketService({store, accounts, content, notify})`，负责 market/reservation/appraisal/user/favorite/myContent。`content.get(type,id)`、`content.list(type)` 提供原始服务端内容，`content.summarize(item)` 生成公开响应。
- `backend/campus/plans.js` 导出 `createPlanService({store, accounts, content, notify})`，负责 plan/invitation/help。各模块 `invoke(method,params,{userId})` 使用现有契约；模块在内部完成同步事务，不能嵌套 `store.transaction`。通知通过同一连接写入，随业务一起提交/回滚。
- `content` 统一注册 `market`、`plan`、`help`、C 的 `lost` 集合；账号用 `campus.users`、会话 `campus.sessions`、上传 `campus.uploads`，其余集合使用 `campus.` 前缀。账号独立索引、权限与图片引用必须在服务端验证。
- HTTP `POST /api/rpc` 保留统一信封与 Bearer；`POST /api/upload?usage=content|avatar` 接收 `uni.uploadFile` 的单个 multipart 图片，最大 5 MiB，检查真实文件签名。`GET /api/files/:imageId` 仅服务端登记图片，临时或私有图片仅本人可读，公开内容引用后允许读取。
- 账号契约新增 `auth.register({studentId,password,nickname})`、`auth.logout({})`；`auth.login({type:'h5',studentId,password})` 校验真实密码，注册/登录返回 `{token,user}`。学号字段仅作本地账号名，不代表学校认证；密码仅保存加盐 scrypt 摘要，令牌仅保存摘要且可撤销。
- `upload.create({usage,data})` 在 HTTP 模式实际传输本地文件，返回 `{imageId,url}`；`upload.confirm` 检查所有权和关联目标。C 默认仍只接受 HTTPS；局域网集成显式传入受信任上传源，继续检查登记记录、所属账号、用途、确认状态、类型和大小。
- 真实服务不导入 `src/mock`，不添加虚构用户、内容或消息。活动读取返回空列表；报名与订阅发送未配置时明确返回未实现；游戏奖励已由真实SQLite服务结算。
- `campus:local` 构建独立 H5 到 `dist/local/campus-h5`，默认服务 `0.0.0.0:8788`；与现有 8787 演示和牌桌预览分开。持久数据和文件放忽略目录，不提交到 Git。
- 所有浏览器入口统一重定向至服务选定的本机网卡 IP，上传文件也使用该固定源，避免手机读取电脑上传照片时误访问手机自己的 127.0.0.1。可用 `CAMPUS_PUBLIC_HOST` 显式指定本机可达地址；换网卡 IP 后需要迁移旧文件 URL 或保持该地址，不承诺动态域名迁移。
- 本机数据库管理员可通过 `campus:admin -- grant <账号>` 授予举报权限，再用 `reports <账号>` 查看待处理举报、`resolve <账号> <举报编号> resolve|dismiss <说明>` 调用 C 的真实处理事务并通知举报者。普通账号注册和资料 RPC 均不能授予管理员角色。

## 验证目标

自动检查账号密码与令牌、图片实际传输和越权、A/B/C 业务双方流程、幂等/容量/事务、关闭重开后的持久化；运行 check、全部测试、H5 和微信构建。两个独立浏览器账号验证真实网络流程。物理双设备和微信真机只有实际执行后才能写通过。
