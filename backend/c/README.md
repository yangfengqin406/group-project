# C：失物与统一消息服务

C（姜澜）第二阶段代码。这里写入服务端 SQLite 文件，不读 `src/mock` 或浏览器存储；**尚未接入团队真实登录/上传、部署公网或完成双设备验收**。前端默认仍为演示模式。

## 已实现

失物发布/修改/详情/筛选与归还；四类内容共用会话；参与者校验；幂等留言；失物评论；站内通知与本人标读；管理员举报处理。原内容链接保留，私有/删除后历史可读、新留言受限。失物状态、通知和留言回执使用事务；唯一组合与事件由数据库索引保证。

`store.js` 是零额外依赖的 Node.js **22.22.0** SQLite 参考存储。服务器需使用持久磁盘，数据库不能放静态托管目录或临时云函数磁盘；部署、备份和文件权限由后端统一配置。SQLite 文件及 WAL 不提交 Git。若 B 选择云数据库，迁移本模块须保留事务、唯一性、服务端身份和游标绑定，不能把异步云查询直接塞进当前同步事务。

## B 接入契约

`createCService({store,getUser,getExternalContent,getUploadByUrl})` 的三个读取适配均为**同步可信服务端查询**。同一 SQLite 架构时使用 `store.database` 的连接读取 B/A 表；外部系统需在正式后端实现等价事务/版本校验，避免权限检查和写入之间的并发窗口。

| 适配 | 返回值 | 必须保证 |
| --- | --- | --- |
| `getUser(userId)` | `{id,nickname,campusId,campusName,roles?,disabled?}` 或 null | 从真实账号库读取；角色不采信请求参数；禁用/注销账号不通过认证；仅返回白名单公开资料 |
| `getExternalContent(type,id)` | 二手/搭子/互助内容或 null | 至少 id/type/ownerId/title/visibility/status；deletedAt 代表已删除；取 A/B 真实内容 |
| `getUploadByUrl(url)` | `{url,ownerId,usage,status,mime,size}` 或 null | 查受控已确认的上传记录；类型/大小来自实际文件检测，不采信客户端声明；JPEG/PNG/WebP、每张≤5MiB、1～3张 |
| `authenticate(bearer)` | Promise 或 `{userId}`/null | B 校验 token 签名/有效期/撤销后返回真实账号；不得把 token 文本直接当 userId |

失物沿用既有 `images` URL 数组。B 公共上传完成且 confirm 后再提交，后端按 URL 回查记录；非公开桶由 B 提供稳定受控引用策略。当前前端真实失物选图仍阻止本机临时地址，需与 B 最终上传协议一起连接。

B 的公开主页、我的发布和收藏在真实接入时也需调用 C 读取失物，不能只查 B 的商品表。可复用 `lostFound.list({ownerId,...分页})` / `lostFound.get({id})` 并传认证 principal，可见性由 C 再次检查。不会自动把本机演示存档导入服务器。

服务端组合示意（不是可直接启动的登录示例）：

```js
import { openCStore } from './store.js'
import { createCService } from './service.js'
import { createCRpcHandler } from './rpc.js'

const store = openCStore(databaseFile) // 父目录须存在，路径由服务器配置
const service = createCService({ store, getUser, getExternalContent, getUploadByUrl })
const handler = createCRpcHandler({ service, authenticate, onError })
// B 的总 RPC 路由按 service.methods.has(method) 分发给 C，不覆盖 A/B 接口。
// handler 是仅 C 的可挂载 Node HTTP 参考处理器，用于独立集成测试。
```

直接分发用 `service.invoke(method, params, {userId})`，principal 只能由 B 的可信认证层创建，不可从客户端 payload 复制。HTTP 返回统一 envelope；业务失败使用现有错误码，不回退演示，不将 token、正文或原始异常写入响应。B 统一配置 HTTPS、受限 CORS、请求限速及认证。

## A/B 业务通知

可信服务端调用 `service.notify({eventId,recipientId,title,contentType,contentId,conversationId?})`。同一接收人+事件编号只生成一条通知；编号由业务事件决定，如 `invitation:<id>:accepted`。该函数未注册 RPC，客户端不能任选接收人发送通知。A/B 业务与通知若不在同一事务，需用事务 outbox 重试投递；C 去重不等于跨库原子提交。

联系/归还通知包含 conversationId，点击进入原会话；旧通知没有该字段时继续打开原内容。微信授权不等于成功发送，`subscription.send` 仍明确未实现，不影响站内通知。

举报审核使用 `report.adminResolve({reportId,action:'resolve'|'dismiss',resolution})`；需账号库中的 admin 角色，只记录处理结果及通知。管理员后台、举报查询入口和跨模块屏蔽策略另行接入，不提供公开举报列表。

## 验证与剩余工作

运行 `node --test tests/c-backend.test.js` 或全组 `npm test`。测试使用临时 SQLite 文件，关库重开验证持久化，两个工作线程的独立连接验证并发重试。测试账号、上传记录和 bearer 仅为桩，不是生产登录。HTTP 测试绑定本机随机端口，结束即关闭。

上线仍需 B 认证/上传和数据库适配、A/B 内容与通知接入、真实前端上传、HTTPS 部署、两个账号两台设备走查、微信真机和订阅发送。具体检查及两端构建结果见 docs/verification.md，不把尚未执行的线上联调计为完成。
# 本轮本机集成补记

`backend/campus` 将真实账号、文件登记和 A/B 内容接到本模块，并共用 SQLite 连接。`createCService` 默认只接受 HTTPS 图片；仅本地集成显式传 `trustedUploadOrigins` 允许指定 HTTP 源，继续检查真实登记、所有权、用途、确认、类型和大小。`notifyInTransaction` 只供同连接事务内的可信 A/B 服务使用，不在公开 RPC 目录；独立调用仍用 `notify`。原业务归属 C（姜澜）。

