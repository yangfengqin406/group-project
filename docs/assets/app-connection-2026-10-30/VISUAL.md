# 连接设置的390px视觉fixture

本记录仅检查浏览器中的视觉布局，不是原生App切换服务、保存偏好、联网或重启验收。使用实际`AppConnectionSettings.vue`的script setup、模板和scoped样式，由现有Vue编译器编译；复用实际`theme.scss`和登录页卡片样式，以390 CSS像素的隔离Edge无头窗口渲染。服务被明确stub，不访问业务API、真实账号或原库，也不保存地址。

主题rpx按固定390/750比例转换。fixture使用浏览器的input/button及少量基础标签复位，因此不能代表原生软键盘、触摸、系统字体或Android WebView的全部行为。账号表单仅为无账号数据的视觉容器。

- [默认收起](visual-collapsed-390.png)：仅新增一行“测试服务地址”，高度约41px，保持奶油卡片和原色调。
- [展开](visual-expanded-390.png)：地址、输入和两按钮均在390px内，两动作同排；没有水平溢出。
- [损坏偏好错误](visual-error-390.png)：错误明确显示，较长地址可换行；即使当前为默认源，“恢复默认地址”仍可操作。截图中的`.invalid`地址是不可访问的示例。

三张图片均已目视复核，输入框与两按钮没有遮挡/水平溢出；展开后的完整卡片可以超过首屏，本记录使用整页截图。浏览器运行错误0，量测和实际源文件SHA见[visual-fixture.json](visual-fixture.json)。真实App原生布局、重新登录、写入/回滚及重启仍须在新安装包上另行验证。
