<template>
  <view class="page village-page village-home">
    <VillageHeader kind="home" title="账号与隐私" subtitle="管理自己的账号和联系边界。" compact />
    <view v-if="error" class="error" role="alert">{{ error }}</view>
    <view v-if="notice" class="panel" role="status">{{ notice }}</view>
    <view class="panel">
      <view class="section-title">数据与隐私</view>
      <view class="body">账号用于跨设备保存校园发布、私信、伙伴与装扮。独立账号不代表已核验学籍；密码以加盐摘要保存。</view>
      <view class="body">照片由你主动选择，用于发布、头像或原创宠物。公开发布和公开资料可被其他用户查看；站内私信仅会话参与者可读。</view>
      <view class="body">注销会撤销全部登录会话，清除个人资料与玩法存档，下架本人发布并安排上传文件清理；历史交流保留匿名账号标记，你发送的消息正文会删除。</view>
      <view v-if="config.appContactEmail" class="body">联系维护者：{{ config.appContactEmail }}</view>
      <view v-if="config.appPrivacyUrl" class="body policy-address">完整隐私政策：{{ config.appPrivacyUrl }}</view>
    </view>
    <view class="panel">
      <view class="section-title">已屏蔽的用户</view>
      <view class="muted">屏蔽会阻止双方新建会话和发送新私信；历史记录仍可查看。</view>
      <view v-if="isMock" class="muted">演示版不执行真实账号屏蔽或注销。</view>
      <view v-else-if="!session.user" class="muted">登录后管理本人的设置。</view>
      <template v-else>
        <view v-if="loading" class="muted">正在读取…</view>
        <view v-else-if="!blocked.length" class="muted">还没有屏蔽用户。</view>
        <view v-for="item in blocked" :key="item.userId" class="row blocked-row">
          <text>{{ item.nickname }}</text>
          <button class="secondary" :disabled="busy" @tap="unblock(item)">解除屏蔽</button>
        </view>
      </template>
    </view>
    <view v-if="!isMock && session.user" class="panel">
      <view class="section-title">注销账号</view>
      <view class="body">此操作不可恢复。确认前请处理尚未完成的交接，并保存需要的内容。</view>
      <input v-model="password" class="input" password maxlength="128" placeholder="输入当前账号密码" />
      <input v-model="confirmation" class="input" maxlength="4" placeholder="输入“注销账号”确认" />
      <button class="delete-button" :disabled="busy || confirmation !== '注销账号' || !password" @tap="deleteAccount">注销此账号</button>
    </view>
  </view>
</template>
<script setup>
import { ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { auth, user } from '../../services/index.js'
import { session } from '../../utils/session.js'
import { config } from '../../config/index.js'
import { errorText } from '../../utils/errors.js'
import VillageHeader from '../../components/village/VillageHeader.vue'

const password = ref(''), confirmation = ref(''), blocked = ref([])
const busy = ref(false), loading = ref(false), error = ref(''), notice = ref('')
const isMock = config.apiMode === 'mock'
let revision = 0, visible = false
async function load() {
  const version = ++revision, userId = session.user?.id
  blocked.value = []
  if (isMock || !userId) return
  loading.value = true
  try {
    const result = await user.listBlocked()
    if (visible && version === revision && session.user?.id === userId) blocked.value = result.items
  } catch (e) {
    if (visible && version === revision && session.user?.id === userId) error.value = errorText(e)
  } finally { if (version === revision) loading.value = false }
}
async function unblock(item) {
  if (busy.value) return
  const userId = session.user?.id
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await user.unblock({ userId: item.userId })
    if (session.user?.id === userId && visible) { notice.value = '已解除屏蔽'; await load() }
  } catch (e) { if (session.user?.id === userId && visible) error.value = errorText(e) }
  finally { busy.value = false }
}
async function deleteAccount() {
  if (busy.value || confirmation.value !== '注销账号' || !password.value) return
  const userId = session.user?.id
  const confirmed = await new Promise((resolve) => uni.showModal({
    title: '确认永久注销', content: '账号、存档和发布将按上方说明处理，注销后无法恢复。',
    confirmText: '确认注销', confirmColor: '#9b473d', success: (result) => resolve(result.confirm), fail: () => resolve(false)
  }))
  if (!confirmed || session.user?.id !== userId) return
  busy.value = true; error.value = ''
  try {
    await auth.deleteAccount({ password: password.value, confirmation: confirmation.value })
    password.value = ''; confirmation.value = ''
    if (!session.user) uni.reLaunch({ url: '/rooms/account/index' })
  } catch (e) { if (session.user?.id === userId && visible) error.value = errorText(e) }
  finally { busy.value = false }
}
watch(() => session.user?.id, () => {
  revision++; password.value = ''; confirmation.value = ''; blocked.value = []; error.value = ''; notice.value = ''; loading.value = false
  if (visible) load()
})
onShow(() => { visible = true; load() })
onHide(() => { visible = false; revision++; password.value = ''; confirmation.value = ''; loading.value = false })
onUnload(() => { visible = false; revision++; password.value = ''; confirmation.value = '' })
</script>
<style scoped>
.section-title { margin-top: 0; }
.body { margin-top: 12px; }
.input { margin-top: 14px; }
.blocked-row { padding: 12px 0; gap: 12px; }
.delete-button { margin-top: 16px; color: #fffaf4; background: #994c42; border-radius: 12px; }
.policy-address { word-break: break-all; }
</style>
