# 技术决定与待填写项

已落实：uni-app Vue 3 JavaScript、锁定依赖、Node 22.22.0、H5 hash 路由、四栋房子、三项底部导航、共用公开主页/消息/表单、统一 services 与可替换 transport。

已确认成员：A（杨凤琴）、B（孙瑞）、C（姜澜）；人员工作分支对应表见collaboration.md。团队仓库为 `yangfengqin406/group-project`；H5阶段演示已使用GitHub Pages：[固定浏览入口](https://yangfengqin406.github.io/group-project/#/)，main合入后发布，人员分支不直接更新公网。本机演示与真实后端/小程序审核分别验收。

| 尚待团队决定 | 负责协调 |
| --- | --- |
| B/C的GitHub身份、main保护规则与PR审查安排最终核对 | A（杨凤琴）协调，全组确认 |
| 微信主体、AppID、备案与审核材料 | 全组 |
| CloudBase 或其他后端，环境 ID、成员权限 | B |
| 微信登录与 H5 登录方式 | B |
| 真实数据集合、索引、访问权限和事务 | 各模块负责人 |
| 图片存储、图片展示 URL 与有效期 | B |
| 微信订阅模板、授权与事件发送策略 | C |
| H5真实服务配置、域名与跨设备验收（阶段托管已完成） | B（孙瑞）协调，全组验收 |

AppID 不是 AppSecret；可以在协作中统一公开配置，但任何密钥只留服务端，私有开发工具配置不进 Git。上面的决定未填完前仍可跑本机骨架。
