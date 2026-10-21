# 团队与工具修改约定

- 项目是 uni-app + Vue 3 + JavaScript，同时交付 H5 与微信小程序构建。
- 页面只调用 `src/services/`，不要在页面直接调用 `uni.request` 或操作业务存储。
- 演示存储只允许出现在 `src/mock/`；真实接口失败不能回退为演示成功。
- 修改公共字段、接口、路由、依赖前，先同步 docs/interfaces.md / docs/collaboration.md。
- 广场只有二手、搭子、失物、自己的家四栋房子，消息属于底部栏目。
- 其他人的主页使用 user.listPublicContent，只展示公开发布。
- VITE_ 环境变量会进入前端；不允许提交密钥、私有配置或 node_modules。
- 演示登录、订阅、上传不能假装为真实功能；未实现明确提示。
- 共用文件维护人见 docs/collaboration.md。维护人是负责协调，不是禁止其他人协作。
- 按用户要求固定保留main及A/B/C三个人的工作分支；分支对应表见docs/collaboration.md。不能仅因PR已合并就删除人员工作分支，清理分支前先确认用途。
- 完成改动后运行 check、test 和两端 build；涉及功能还需按 docs/acceptance.md 人工验收。

## 文档更新与交付

- 开始任务前阅读 README.md、docs/requirements.md、docs/interfaces.md 和 docs/collaboration.md，确认本次任务及公共文件影响。
- 完成代码时，按 docs/collaboration.md 的文档对应表检查并更新受影响的文档；文档和代码放在同一个 PR。只修改与本次变化相关的内容，不为凑更新改动整份文档。
- 每次交付都说明完成了什么、剩余工作、实际验证结果和文档修改点。PR 描述必须填写具体内容；无需修改文档时，写明原因，不能留空或只保留模板。
- 验证结果以实际执行为准：未运行、失败和不适用分别写明，不得把未实现的演示功能或未执行的检查写成完成。
- docs/status.md 与 tasks.csv 的总进度由 A（集成负责人）汇总。B/C 在各自 PR 提供任务编号或模块、状态及验证依据；需要直接修改总进度时先协调。
- 面向监督人的每周工作汇总记入docs/weekly-log.md，通过文档PR合入main并由README提供固定入口；A汇总三人的完成、证据、问题和下一步。技术细节链接verification.md，不编造未提供的工作、不把演示计为真实交付；周报不是自动生成的程序。
- 这些是 Codex 与队员共同执行的约定，不是自动生成文档的程序；审核人合并前检查文档和 PR 说明是否反映实际改动。
