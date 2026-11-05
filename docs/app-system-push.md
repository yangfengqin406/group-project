# 手机系统私信通知交接（2026-11-05）

本增量由 C（姜澜）负责，只交付源码、测试与配置说明。已安装的 App、GitHub Pages 和 CloudBase 实例不会自动更新；本轮不生成 APK/IPA，不登录推送控制台、不配置真实凭据、不部署服务。原消息正文与原内容跳转继续由既有统一消息中心提供。

## 原因与实现

原提醒每约5秒在前台读取未读；onHide 停止。轮询无法在 App 进程被手机结束后送通知。本增量使用 uni-push 2：私信事务同时写消息、站内通知和每设备任务，提交后 worker 才通过签名推送桥调用官方 sendMessage。私信发送不等待推送平台；平台失败只重试任务，不将私信显示为发送失败。

消息页的“手机通知”由用户主动开启；Android 13申请 POST_NOTIFICATIONS，Android 8以上创建高重要性、锁屏隐藏正文的私信渠道，iOS使用手动注册。登录会话恢复及App返回前台时更新绑定；退出/注销/会话失效使任务不可发送，换号不继承原账号授权。点击通知只接收固定类型和编号，核验收件账号及 conversation.get 权限后进入既有聊天路由，不接受任意URL。通知正文固定为“你收到一条新私信，点击查看”，不把私信正文发给推送平台。

## 后端负责人

1. 现有 Node22 + SQLite 服务（也可运行在 CloudBase 云托管容器）使用本增量 `backend/campus`。配置环境变量 `CAMPUS_PUSH_BRIDGE_URL` 和至少32字符随机值 `CAMPUS_PUSH_BRIDGE_SECRET` 后重启；从服务管理器/容器环境注入，`campus:serve`不会自行加载.env。secret只放后端，不得设置为VITE_、写进前端或提交仓库。
2. 在项目的 uniCloud 空间上传 `uniCloud-aliyun/cloudfunctions/campus-system-push`，启用自带的 `uni-cloud-push` 扩展库，并配置URL化HTTPS入口。桥函数环境设置相同secret及原 `CAMPUS_PUSH_APP_ID=__UNI__...`；不要另建一个AppID。代码中的 aliyun 是空间目录选择，不要求把业务后端迁移到阿里云；如果团队选择uniCloud腾讯云空间，将同一函数/数据库定义导入对应空间。
3. 创建 `campus-push-receipts`（随仓库提供schema，客户端读写全部拒绝）。按[官方部署要求](https://uniapp.dcloud.net.cn/unipush-v2.html)准备扩展库依赖的 `opendb-tempdata`、`opendb-device`、`uni-id-device`，保持官方schema权限。业务账号仍使用原系统，推送按经过业务鉴权绑定的CID定向发送，不依赖uni-id登录。
4. 现有常驻服务每5秒扫描持久队列，单实例内避免并发重复；生产只安排一个该队列worker。当前 CloudBase 课程版为 HTTP 函数，请求内使用短生命周期引擎，显式关闭常驻推送桥。启用离线推送需将事务入队和定时处理接入实际持久层与触发器，另行联调厂商通道和 APNs。现有源码与测试不能视为 CloudBase 已接通系统推送。
5. 任务默认一小时内有效，5秒起指数退避、最多8次；每次发送前复查参与者、公开内容、账号、屏蔽、设备会话与未读位置。已读、关闭、失效绑定丢弃，注销清理设备及收件队列。桥用HMAC-SHA256和两分钟时间窗鉴权、按request_id持久去重；已发送但回执丢失时保守标记不确定，不换ID重复轰炸。后台记录accepted表示平台受理，不等于手机已展示。

桥收据只含任务摘要ID、状态和创建时间。生产可按运维规则清理七天前的收据和终态队列；不要清理仍需排查的不确定任务。两套云服务的开通/费用由负责人按团队实际账户确认，本次没有购买或部署。

## App负责人

1. 使用原 AppID、Android包名/签名和iOS Bundle ID，在DCloud后台开通 **uni-push 2**；后台填对应厂商配置。用户此前使用华为，优先核对华为HMS、包名、SHA256签名及agconnect-services.json；其他厂商按实际机型申请，iOS须配置有效APNs推送证书及描述文件。应用未开通不能勾Push就直接云打包。
2. 既有生成脚本增加 `CAMPUS_APP_PUSH=true`；配置原有 `CAMPUS_APP_ORIGIN`、`CAMPUS_DCLOUD_APP_ID` 后由负责人执行既有build:app流程。脚本只在忽略的生成项目中启用Push模块、uni-push version2/offline、Android通知权限及iOS manual。若直接在HBuilderX维护项目，也需手动勾选 **uni-push 2 + 离线推送**，保留上述设置；仅在线推送不满足本需求。
3. 保留 `nativeResources/android/AndroidManifest.xml` 的关闭自动请求meta-data（官方要求HBuilderX5.22以上），由页面按钮控制Android权限。更旧的基座可能自行在启动时询问，不得声称已实现相同时机控制。标准运行基座不代表安装包，需使用包含Push模块的正式签名包或自定义基座。
4. 按团队发布流程核对推送SDK/厂商隐私清单及厂商消息分类权益。设备上的横幅、声音、锁屏、勿扰模式由系统控制；普通权限不代表可绕过系统设置或强制停止限制。未配置厂商通道时不能宣称杀进程后仍可靠收到。

## 验收

用两个独立测试账号和真实安装包：B在消息页开启手机通知，A从二手/失物/搭子联系B；分别验证前台、退到桌面、锁屏以及正常关闭进程后的系统通知，点击返回正确聊天和原内容。拒绝权限时仍能正常使用站内消息；从系统设置开启后回App可重新检查。再验证已读后不补旧提醒、退出/换号/关闭本设备通知、屏蔽/注销不再新增推送，伪造或旧账号通知不打开其他人的聊天。

Android各厂商/iPhone分别记录实机、包版本和通知设置。已经交给厂商的通知可能在退出后仍残留，点击仍必须通过当前账号鉴权。App全新安装、升级、离线恢复也应验；自动测试仅验证权限调用、队列/签名/账号逻辑，不验证真实送达。本轮实际测试结果见 [verification](verification.md)。

参考：[uni-push 2官方接入](https://uniapp.dcloud.net.cn/unipush-v2.html)、[原生配置与通知权限](https://uniapp.dcloud.net.cn/tutorial/app-push-unipush.html)、[客户端API](https://uniapp.dcloud.net.cn/api/plugins/push.html)、[sendMessage服务端API](https://doc.dcloud.net.cn/uniCloud/uni-cloud-push/api.html)。
