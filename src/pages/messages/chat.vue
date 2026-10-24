<template>
  <view class="page village-page village-chat">
    <VillageHeader kind="messages" title="邻里留言" subtitle="围绕原来的发布，好好说句话。" compact />
    <DemoNotice />
    <view v-if="error" class="error">{{ error }}</view>
    <view
      v-if="current"
      class="panel"
      @tap="openContent(current.contentType, current.contentId)"
    >
      <text class="tag">{{ contentNames[current.contentType] }}</text>
      <view class="link" style="margin-top: 14rpx">
        {{ current.contentTitle }} · 查看原内容 ↗
      </view>
      <view v-if="current.peer" class="muted" style="margin-top: 8rpx">
        与 {{ current.peer.nickname }} 联系
      </view>
    </view>
    <view class="row">
      <text class="muted">当前为留言模式，点击刷新读取新消息</text>
      <button class="secondary" :disabled="loading" @tap="load(true)">
        刷新
      </button>
    </view>
    <view v-for="m in items" :key="m.id" class="panel">
      <view class="row">
        <text class="link" @tap="openProfile(m.senderId)">
          {{ m.sender.nickname }} ↗
        </text>
        <text class="muted">{{ formatTime(m.createdAt) }}</text>
      </view>
      <view class="body">{{ m.body }}</view>
    </view>
    <button v-if="cursor" class="secondary" @tap="load(false)">更多留言</button>
    <view class="panel">
      <textarea
        class="input textarea"
        v-model="body"
        placeholder="围绕原内容留下消息"
        maxlength="1000"
      />
      <view class="actions">
        <button class="primary" :disabled="sending || !current || !body.trim()" @tap="send">
          发送留言
        </button>
      </view>
    </view>
  </view>
</template>
<script setup>
import { ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { conversation, message } from '../../services/index.js'
import {
  contentNames,
  openContent,
  openProfile,
  formatTime,
  idempotencyKey
} from '../../utils/routes.js'
import { errorText } from '../../utils/errors.js'
import DemoNotice from '../../components/DemoNotice.vue'
import VillageHeader from '../../components/village/VillageHeader.vue'
import { session } from '../../utils/session.js'
const id = ref(''),
  current = ref(null),
  items = ref([]),
  body = ref(''),
  error = ref(''),
  sending = ref(false),
  loading = ref(false),
  cursor = ref(null)
let loadVersion = 0
let visible = false
let initialized = false
let pendingSend = null
async function initialize() {
  const version = ++loadVersion
  const userId = session.user?.id
  const currentRequest = () => version === loadVersion && userId === session.user?.id
  loading.value = true
  current.value = null
  items.value = []
  cursor.value = null
  error.value = ''
  try {
    let next = null
    do {
      const r = await conversation.list({ cursor: next })
      if (!currentRequest()) return
      current.value = r.items.find((c) => c.id === id.value) || current.value
      next = r.nextCursor
    } while (next && !current.value)
    if (!current.value) throw new Error('会话不存在或没有权限')
    await load(true)
  } catch (e) {
    if (currentRequest()) error.value = errorText(e)
  } finally {
    if (currentRequest()) loading.value = false
  }
}
onLoad((options) => {
  id.value = options.id
})
async function load(reset) {
  // 刷新必须使旧读取失效，发送成功后不能被较早的列表覆盖。
  if (!reset && (loading.value || !cursor.value)) return
  const version = reset ? ++loadVersion : loadVersion
  const userId = session.user?.id
  const currentRequest = () => version === loadVersion && userId === session.user?.id
  loading.value = true
  error.value = ''
  try {
    const r = await message.list({
      conversationId: id.value,
      cursor: reset ? null : cursor.value
    })
    if (!currentRequest()) return
    const known = new Set(reset ? [] : items.value.map((item) => item.id))
    items.value = [...(reset ? [] : items.value), ...r.items.filter((item) => !known.has(item.id))]
    cursor.value = r.nextCursor
  } catch (e) {
    if (currentRequest()) error.value = errorText(e)
  } finally {
    if (currentRequest()) loading.value = false
  }
}
async function send() {
  if (sending.value || !current.value || !body.value.trim()) return
  const userId = session.user?.id
  const conversationId = id.value
  const text = body.value
  const currentRequest = () => userId === session.user?.id && conversationId === id.value && visible
  const fingerprint = JSON.stringify([userId, conversationId, text])
  if (pendingSend?.fingerprint !== fingerprint)
    pendingSend = { fingerprint, key: idempotencyKey() }
  sending.value = true
  error.value = ''
  try {
    await message.send({
      conversationId,
      body: text,
      idempotencyKey: pendingSend.key
    })
    pendingSend = null
    if (!currentRequest()) return
    if (body.value === text) body.value = ''
    await load(true)
  } catch (e) {
    if (['INVALID_ARGUMENT', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'UNAUTHENTICATED'].includes(e?.code)) pendingSend = null
    if (currentRequest()) error.value = errorText(e)
  } finally {
    sending.value = false
  }
}
watch(() => session.user?.id, () => {
  ++loadVersion
  body.value = ''
  items.value = []
  current.value = null
  pendingSend = null
  if (visible) initialize()
})
onShow(() => {
  visible = true
  if (!initialized || !current.value) { initialized = true; initialize() }
  else load(true)
})
onHide(() => { visible = false; ++loadVersion; loading.value = false })
onUnload(() => { ++loadVersion; pendingSend = null })
</script>
