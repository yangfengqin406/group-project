# CloudBase 课程版部署与交付

2026-11-05：HTTP函数 Nodejs22.21.1 已部署至上海 CloudBase，原数据导入并核验；用户确认安卓0.1.3切换后测试正常，并选择保留全部数据。电脑关机后的手机操作及三台物理设备游戏仍待验收。当前适配源码与团队 App 源码一起维护，安装包、分支和验收进展见[验证记录](verification.md)。

## 运行结构

uni-app App/H5 → HTTPS HTTP函数 → 原账号/业务与权限 → CloudBase PostgreSQL 私有状态表、私有文件桶。后端不经过维护电脑、Cloudflare通道或原CVM。每个请求只在内存SQLite执行原规则，持久保存由PG原子版本更新完成；斗地主checkpoint随同保存，不能把函数本地磁盘作为数据库。

表结构为 id text主键、version bigint、state jsonb。开启RLS并撤销PUBLIC/anon/authenticated权限，只有服务端service_role可读写；图片桶public=false。客户端沿用原账号鉴权，不持有CloudBase管理密钥。

## 构建与配置

使用 Node 22 执行 `node scripts/build-cloudbase.mjs`，输出带时间戳的 `dist/cloudbase/campus-*/`：backend、server/landlord、所需domain/utils、真实同源H5、package.json和scf_bootstrap；无需安装运行时依赖。脚本不打包真实数据、.env或管理密钥。若需要同时生成安卓下载页，使用已验签并完整下载核对的APK，设置公开HTTPS下载链接 `CAMPUS_DOWNLOAD_URL`、准确文件字节数 `CAMPUS_DOWNLOAD_BYTES` 和对应版本 `CAMPUS_DOWNLOAD_VERSION`；不用写入服务端凭据。

函数启动：`node backend/cloudbase/entry.mjs`，HTTP端口默认9000；云端bootstrap使用 `/var/lang/node22/bin/node`。CloudBase函数配置：runtime Nodejs22.21、HTTP、256MB、3秒。将根路径 / 转发到此函数并传递完整路径；业务接口自行鉴权，网关不能额外要求用户持有CloudBase管理身份。

服务端私有配置：CAMPUS_CLOUDBASE_ENV、CAMPUS_CLOUDBASE_KEY、CAMPUS_PUBLIC_ORIGIN；可选CAMPUS_CLOUDBASE_TABLE（campus_runtime）、CAMPUS_CLOUDBASE_BUCKET（campus-private）、PORT、CAMPUS_STATIC_ROOT。KEY为服务端API key，当前设90天有效期，须在到期前轮换函数配置；不得提交密钥、写进VITE_或H5、发到聊天。部署工具的授权与运行时服务密钥不是同一用途。

## 迁移与保护

使用 `prepareCloudMigration()`，默认只核验；confirmEmpty=true才上传并初始化，目标非空拒绝覆盖。源须为独立一致性快照；核对旧服务停写边界、原库/图片备份、账号和私信、序号与回执，再导入。文件支持私有pg:// locator，源路径不作为任意文件读取入口。发生未知提交结果不自动重放、不删除可能已提交的图片。

本次导入前本机原8788等后端未监听，Node进程检查未发现原后端；重新取得源快照，导入61记录、12条用户记录、3图片。逐条核对凭据/会话、6幂等回执、settings/sequence和全部图片字节通过。12条用户记录不等于12名活跃用户。原CVM历史副本与本机备份保留，未自动删除或覆盖。

0.1.4构建通过 `CAMPUS_APP_ORIGIN` 将CloudBase设置为默认源，使用原账号登录。已有其他自定义地址的安装可在设置中选择「恢复默认地址」。0.1.3可在「我的 → 账号与隐私 → 测试服务地址」操作，资料加载失败可从「我的」直接进测试服务地址，未登录则从登录页底部进入。填写完整HTTPS源（不带/api、/#/或账号密码），点「检查并切换」后重新登录。版本和实际签名状态见[交付记录](app-release-2026-10-27.md)。

## 实际验证与边界

Node22完整测试628项：627通过、1跳过（Windows符号链接权限），check17页面/87调用、H5和微信兼容构建通过。实际云端临时账号验证注册、登录、pet、衣柜、发帖奖励、双方私信与幂等、第三人私信拒绝、私有图片先鉴权、上传下载字节一致，匿名直读数据库401；测试账号随后注销。普通业务采样159～715ms，注册/小图上传约903～1761ms；5MiB有效PNG上传200、4325ms，下载200且SHA一致。均为本次网络样本，不能承诺所有手机相同。安卓原签名0.1.3 APK已另放公共下载桶并完整读回核对SHA；公共桶只有安装包，原用户图片仍为私有。

免费体验版目前自动续费和超额付费关闭，函数固定3秒/256MB，默认域名只作课程测试；正式上架和长期运营条件另行办理。单状态4MiB与全状态CAS适合课程小数据集；高并发、容量增长需按业务拆分持久层。文件删除队列在后续请求重试，异常上传孤儿对账仍需维护。手机切源、关机验收、完整玩法及iOS分发不得用源码测试代替。

课程版的请求引擎关闭常驻推送桥，前台私信仍走既有未读检查。要启用系统后台通知，还需为此运行方式配置独立队列处理、推送平台及厂商通道，详见[系统通知配置](app-system-push.md)。
