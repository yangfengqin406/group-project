# Android / iOS App 适配与交付

用户已确认：复用 uni-app、保留完整功能，先完成双端适配与 Android 安装包，Apple 会员稍后准备。本文为已确认方案的实施记录；“计划”与“已验证”分开填写。

## 实施方案

1. 增加同版本 App 编译器和独立 App 构建命令，服务地址从构建环境注入，沿用现有真实 RPC、SQLite 与权限；不复制真实用户数据，不停止既有展示服务。
2. 适配 App 相册 PNG 导入、背景音乐/水声、前后台暂停、安全区和必要权限；保留所有页面与玩法，H5/微信构建继续验证。
3. 补齐本人账号注销、用户屏蔽/解除及界面入口，真实后端事务处理并覆盖越权、旧会话及账号切换；演示仅在 mock 实现，不把失败写成成功。
4. 生成可复现的 App 构建资源、HBuilderX 导入/打包配置与操作说明。Android APK 必须实际签名打包后才能称为安装包；iOS 编译资源不是可直接安装的 IPA。

## 外部条件

- DCloud 免费开发者账号：用户已注册并完成本机登录；本轮已在用户账号下取得真实 AppID，保留在忽略的打包项目中。离线 SDK 也需要与 AppID/包名/签名一致的 AppKey，不伪造。
- Android 签名由本机私有配置维护；不提交密钥、证书密码或发布账号。
- Apple Developer Program 会员、Bundle ID、签名及分发配置：用户确认尚无会员，后续由用户办理；不得代购或假称 iPhone 已可面向普通用户分发。
- 真实公网后端需要持续运行与备份；临时展示域名不是生产部署。App备案、UGC内容管理及游戏发行/商店要求另行核对。

## 验证与交付状态

2026-10-27 实际通过：check（17页/78个接口调用位置）、428项测试、H5/微信/Android/iOS四端编译；33份WXSS兼容门禁及微信定向质量检查。新增原生PNG读取、音频、前后台暂停及鉴权图片下载；原生图片适配在没有浏览器URL构造器时仍通过回归，不向外站发送会话令牌。微信不能使用对象式v-bind转发属性，图片组件已改为显式属性并通过重建。

独立Edge浏览器390×844实际完成登录、聊天屏蔽、设置解除、密码及确认文字注销；逐次核对SQLite结果、全部会话失效及另一账号保留，运行异常0。这是共享页面的H5验收，不代替Android/iOS真机验收。详细证据见[验证记录](verification.md)。

Android APK：用户已完成手机号绑定，0.1.0 已实际云端签名生成，apksigner 验证 v1/v2 签名；用户确认华为安装、登录、伙伴和衣柜正常。主动开音乐且媒体音量正常仍无声，已依据固定版本SDK只读属性复现并修正初始化和首次播放，音频回归与两端编译通过；0.1.1 尚未重新打包或取得有声真机结果。用户随后明确暂停打包，先实现校园贡献激励，旧APK不会自动获得本轮新功能。开屏、悬浮及其他广告SDK未勾选，未支付费用；iOS IPA 未生成，等待Apple会员及签名。安装成功不代表商店审核或全部原生能力验收通过。

## 可复现构建

使用Node22及当前终端的环境变量执行，不会自动读取其他人的私有配置：

```powershell
$env:CAMPUS_APP_ORIGIN='https://your-service.example'
$env:CAMPUS_DCLOUD_APP_ID='__UNI__YOUR_OWN_ID'
npm run build:app
```

输出位于独立的`dist/app/<时间戳>/`，`dist/app/latest.json`记录实际目录及构建条件。

- `hbuilder-project`：导入HBuilderX的完整源码项目，真实HTTP接口和公共隐私配置已写入该忽略目录，重新编译不依赖临时终端环境，也不静默使用mock。
- `app-android`、`app-ios`：两端资源编译预检结果，均不是安装包。
- `app-build.json`：编译回执；APK/IPA状态须另据实际产物登记，`bound`仅表示已配置AppID，不表示平台已核验归属或完成签名。

首次打包在HBuilderX导入`hbuilder-project`，打开manifest获取本人AppID并保存，选择“发行 → App-Android/iOS-云打包”。先在[DCloud官方资料页](https://dev.dcloud.net.cn/pages/user/info)完成账号手机号绑定；新应用选择云端证书或自有证书，不能沿用旧教程的公共测试证书。仅勾Android，关闭广告及无关SDK，不购买加速或额度。保管正式签名备份，私钥和密码不得进入源码或聊天。若工具要求付费，应停止在付款前，不把免费额度视作永久承诺。规则见[DCloud官方云打包说明](https://uniapp.dcloud.net.cn/dev/app/cloud-build.html)，最终以实际提交校验为准。

正式发布构建另设`CAMPUS_APP_RELEASE=true`、`VITE_APP_CONTACT_EMAIL`和`VITE_APP_PRIVACY_URL`；构建守卫要求真实AppID、HTTPS服务源及公开联系/政策信息。Android启动隐私模板引用包内政策，拒绝后退出；同意/拒绝及选择照片权限仍须在实际安装包中核验。AppID、签名、政策和服务地址变更后重新构建，不能只改旧JS资源的文件名。

## 安装后的验收

按[验收清单](acceptance.md)验证账号跨设备、场景/伙伴/衣柜、图片发布及私信、钓鱼/三关潜水/三人牌桌、原创PNG、声音及切后台。两台手机分别用流量验证同一真实服务；拒绝权限须有可理解反馈。测试账号注销只能操作专门新建的测试账号，不能注销展示/团队账号。iPhone须先完成合法签名及分发，编译资源不能直接让普通iPhone安装。

官方参考：[uni-app App打包](https://uniapp.dcloud.net.cn/dev/app/cloud-build.html)、[App离线SDK/AppKey](https://nativesupport.dcloud.net.cn/AppDocs/)、[Apple会员](https://developer.apple.com/help/account/membership/program-enrollment)、[App审核准则](https://developer.apple.com/app-store/review/guidelines/)。
