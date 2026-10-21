<template>
  <view class="page">
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
        <button class="primary" :disabled="sending || !body.trim()" @tap="send">
          发送留言
        </button>
      </view>
    </view>
  </view>
</template>
<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
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
const id = ref(''),
  current = ref(null),
  items = ref([]),
  body = ref(''),
  error = ref(''),
  sending = ref(false),
  loading = ref(false),
  cursor = ref(null)
onLoad(async (options) => {
  id.value = options.id
  try {
    let next = null
    do {
      const r = await conversation.list({ cursor: next })
      current.value = r.items.find((c) => c.id === id.value) || current.value
      next = r.nextCursor
    } while (next && !current.value)
    if (!current.value) throw new Error('会话不存在或没有权限')
    await load(true)
  } catch (e) {
    error.value = errorText(e)
  }
})
async function load(reset) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const r = await message.list({
      conversationId: id.value,
      cursor: reset ? null : cursor.value
    })
    items.value = reset ? r.items : [...items.value, ...r.items]
    cursor.value = r.nextCursor
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}
async function send() {
  if (sending.value) return
  sending.value = true
  error.value = ''
  try {
    await message.send({
      conversationId: id.value,
      body: body.value,
      idempotencyKey: idempotencyKey()
    })
    body.value = ''
    await load(true)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    sending.value = false
  }
}
</script>
