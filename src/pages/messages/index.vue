<template>
  <view class="page village-page village-messages">
    <VillageHeader kind="home" title="邻里信箱" subtitle="每一次联系，都从一件校园小事开始。" compact />
    <DemoNotice />
    <view class="row">
      <view class="section-title">消息中心</view>
      <button class="secondary" :disabled="loading || busy" @tap="load">刷新</button>
    </view>
    <view class="subtitle">二手、失物和搭子的联系都在这里</view>
    <view class="message-tools">
      <view class="source-tabs">
        <button
          v-for="option in sourceOptions"
          :key="option.value"
          class="source-tab"
          :class="{ selected: source === option.value }"
          @tap="source = option.value"
        >
          {{ option.label }}
        </button>
      </view>
      <button class="secondary subscribe-button" @tap="subscribe">
        订阅重要通知
      </button>
    </view>
    <view v-if="subscriptionTip" class="muted subscription-tip">
      {{ subscriptionTip }}
    </view>
    <view v-if="error" class="error">{{ error }}</view>
    <view class="section-title">搭子邀请</view>
    <view v-for="i in invitations" :key="i.id" class="panel">
      <view>{{ i.sender.nickname }} 邀请 {{ i.recipient.nickname }}</view>
      <view v-if="i.targetSummary" class="invitation-summary">
        <view class="summary-title">一起去：{{ i.targetSummary.title }}</view>
        <view>{{ formatTime(i.targetSummary.startAt) }} ～ {{ formatTime(i.targetSummary.endAt) }}</view>
        <view>{{ i.targetSummary.location || '地点待商量' }} · {{ i.targetSummary.memberIds?.length || 0 }}/{{ i.targetSummary.capacity }} 人</view>
      </view>
      <view v-else class="muted invitation-tip">计划摘要暂不可用，请先查看目标计划。</view>
      <view class="muted">状态：{{ labels[i.status] || i.status }}</view>
      <view v-if="i.status === 'expired'" class="muted invitation-tip">
        这次邀请的计划安排已有变化，可能已结束、取消、满员或调整公开范围。可以查看目标计划，合适时再约一次。
      </view>
      <view class="actions">
        <button class="secondary" @tap="openContent('plan', i.targetPlanId)">
          查看目标计划
        </button>
        <template v-if="i.status === 'pending'">
          <template v-if="i.recipientId === session.user?.id">
            <button
              class="primary"
              :disabled="busy || loading"
              @tap="respond(i, 'accept')"
            >
              接受
            </button>
            <button
              class="secondary"
              :disabled="busy || loading"
              @tap="respond(i, 'reject')"
            >
              暂不接受
            </button>
          </template>
          <button
            v-else-if="i.senderId === session.user?.id"
            class="secondary"
            :disabled="busy || loading"
            @tap="respond(i, 'cancel')"
          >
            取消邀请
          </button>
        </template>
      </view>
    </view>
    <button v-if="inviteCursor" class="secondary" :disabled="loading || busy" @tap="moreInvites">
      更多邀请
    </button>
    <view class="section-title">联系消息</view>
    <view
      v-for="c in filteredConversations"
      :key="c.id"
      class="panel"
      @tap="chat(c.id)"
    >
      <view class="row">
        <text>{{ c.contentTitle }}</text>
        <text class="link">进入 →</text>
      </view>
      <text class="muted">
        {{ contentNames[c.contentType] }} · {{ peerName(c) }} · 保留原内容链接
      </text>
      <view class="last-message">{{ c.lastMessage?.body || '还没有留言，来打个招呼吧。' }}</view>
      <text v-if="c.lastMessage" class="muted">{{ formatTime(c.lastMessage.createdAt) }}</text>
    </view>
    <button
      v-if="conversationCursor"
      class="secondary"
      :disabled="loading || busy"
      @tap="moreConversations"
    >
      更多会话
    </button>
    <view class="section-title">通知</view>
    <view v-for="n in notifications" :key="n.id" class="panel" @tap="read(n)">
      <view class="row">
        <text>{{ n.title }}</text>
        <text class="tag">{{ n.read ? '已读' : '未读' }}</text>
      </view>
      <text class="muted">{{ formatTime(n.createdAt) }} · 查看原内容 →</text>
    </view>
    <button v-if="noteCursor" class="secondary" :disabled="loading || busy" @tap="moreNotes">
      更多通知
    </button>
    <EmptyState
      v-if="
        !loading &&
        !error &&
        !invitations.length &&
        !conversations.length &&
        !notifications.length
      "
      title="暂时没有消息"
      description="去联系一个发布者，或向相近计划发出邀请。"
    />
  </view>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { invitation, conversation, notification, plan } from '../../services/index.js'
import { session } from '../../utils/session.js'
import {
  contentNames,
  openContent,
  formatTime
} from '../../utils/routes.js'
import { runInvitationOperation } from '../../utils/invitation-operations.js'
import { errorText } from '../../utils/errors.js'
import DemoNotice from '../../components/DemoNotice.vue'
import EmptyState from '../../components/EmptyState.vue'
import VillageHeader from '../../components/village/VillageHeader.vue'
import { requestSubscription } from '../../platform/subscription.js'
const invitations = ref([]),
  conversations = ref([]),
  notifications = ref([]),
  error = ref(''),
  busy = ref(false),
  loading = ref(false),
  inviteCursor = ref(null),
  conversationCursor = ref(null),
  noteCursor = ref(null)
const source = ref('')
const subscriptionTip = ref('')
let loadVersion = 0
let visible = false
const sourceOptions = [
  { label: '全部', value: '' },
  { label: '二手', value: 'market' },
  { label: '失物', value: 'lost_found' },
  { label: '搭子', value: 'plan' }
]
const filteredConversations = computed(() =>
  source.value
    ? conversations.value.filter((item) => item.contentType === source.value)
    : conversations.value
)
const labels = {
  pending: '等待确认',
  accepted: '已接受',
  rejected: '未接受',
  cancelled: '已取消',
  expired: '已失效'
}
async function withSummaries(rows, current) {
  const summaries = new Map()
  await Promise.all([...new Set(rows.map((item) => item.targetPlanId))].map(async (id) => {
    try { summaries.set(id, await plan.get({ id })) } catch { /* 不显示已无权限读取的内容。 */ }
  }))
  return current() ? rows.map((item) => ({ ...item, targetSummary: summaries.get(item.targetPlanId) || null })) : []
}
async function load({ preserveError = false } = {}) {
  const version = ++loadVersion
  const userId = session.user?.id
  const current = () => version === loadVersion && userId === session.user?.id
  loading.value = true
  if (!preserveError) error.value = ''
  try {
    const [i, c, n] = await Promise.all([
      invitation.list(),
      conversation.list(),
      notification.list()
    ])
    if (!current()) return
    invitations.value = i.items
    inviteCursor.value = i.nextCursor
    conversations.value = c.items
    conversationCursor.value = c.nextCursor
    notifications.value = n.items
    noteCursor.value = n.nextCursor
    const summarized = await withSummaries(i.items, current)
    if (current()) invitations.value = summarized
  } catch (e) {
    if (current() && (!preserveError || !error.value)) error.value = errorText(e)
  } finally {
    if (current()) loading.value = false
  }
}
async function more(service, items, cursor) {
  if (loading.value || busy.value || !cursor.value) return
  const version = loadVersion
  const userId = session.user?.id
  const current = () => version === loadVersion && userId === session.user?.id
  loading.value = true
  try {
    const r = await service.list({ cursor: cursor.value })
    if (service === invitation) r.items = await withSummaries(r.items, current)
    if (!current()) return
    const known = new Set(items.value.map((item) => item.id))
    items.value.push(...r.items.filter((item) => !known.has(item.id)))
    cursor.value = r.nextCursor
  } catch (e) {
    if (current()) error.value = errorText(e)
  } finally {
    if (current()) loading.value = false
  }
}
function moreInvites() {
  more(invitation, invitations, inviteCursor)
}
function moreConversations() {
  more(conversation, conversations, conversationCursor)
}
function moreNotes() {
  more(notification, notifications, noteCursor)
}
function chat(id) {
  uni.navigateTo({ url: `/pages/messages/chat?id=${encodeURIComponent(id)}` })
}
function peerName(conversation) {
  return conversation.peer?.nickname
    ? `与 ${conversation.peer.nickname} 的会话`
    : '联系会话'
}
async function subscribe() {
  subscriptionTip.value = ''
  try {
    const result = await requestSubscription()
    const accepted = Object.values(result || {}).some(
      (value) => value === 'accept'
    )
    subscriptionTip.value = accepted
      ? '已完成授权；通知仍以消息中心站内消息为准。'
      : '未获得订阅授权；不会影响站内消息。'
  } catch (e) {
    subscriptionTip.value = errorText(e)
  }
}
async function respond(i, action) {
  if (busy.value || loading.value || i.status !== 'pending') return
  const userId = session.user?.id
  const version = loadVersion
  const current = () => visible && version === loadVersion && userId === session.user?.id
  if (action === 'accept') {
    const title = i.targetSummary?.title || '对方的计划'
    const confirmed = await new Promise((resolve) => uni.showModal({
      title: '确认参加这次计划？',
      content: `接受后，你将加入「${title}」并占用一个名额。你的原计划停止招募并保留记录，不会把整队成员一起合并。`,
      confirmText: '确认加入',
      success: (result) => resolve(result.confirm), fail: () => resolve(false)
    }))
    if (!confirmed || !current() || busy.value || loading.value || i.status !== 'pending') return
  }
  const sameAccount = () => visible && userId === session.user?.id
  busy.value = true
  error.value = ''
  try {
    await runInvitationOperation(
      { userId, method: 'invitation.respond', params: { invitationId: i.id, action } },
      invitation.respond
    )
    if (sameAccount()) await load()
  } catch (e) {
    if (!current()) {
      if (sameAccount() && ['CONFLICT', 'FORBIDDEN', 'NOT_FOUND'].includes(e?.code)) await load()
      return
    }
    const message = errorText(e)
    error.value = message
    if (['CONFLICT', 'FORBIDDEN', 'NOT_FOUND'].includes(e?.code)) {
      invitations.value = []
      inviteCursor.value = null
      const refreshVersion = loadVersion + 1
      await load({ preserveError: true })
      if (refreshVersion === loadVersion && userId === session.user?.id) error.value = message
    }
  } finally {
    busy.value = false
  }
}
async function read(n) {
  const version = loadVersion
  const userId = session.user?.id
  const current = () => version === loadVersion && userId === session.user?.id
  try {
    await notification.markRead({ notificationId: n.id })
    if (current()) openContent(n.contentType, n.contentId)
  } catch (e) {
    if (current()) error.value = errorText(e)
  }
}
function clearMessages() {
  invitations.value = []
  conversations.value = []
  notifications.value = []
  inviteCursor.value = conversationCursor.value = noteCursor.value = null
}
watch(() => session.user?.id, () => {
  ++loadVersion
  clearMessages()
  loading.value = false
  error.value = ''
  if (visible) load()
})
onShow(() => {
  visible = true
  load()
})
onHide(() => {
  visible = false
  ++loadVersion
  loading.value = false
})
onUnload(() => {
  ++loadVersion
})
</script>

<style scoped>
.message-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 24rpx;
}
.source-tabs {
  display: flex;
  flex: 1;
  gap: 8rpx;
  padding: 6rpx;
  overflow-x: auto;
  background: #e8eddf;
  border-radius: 14rpx;
}
.source-tab {
  flex: 1;
  min-width: 100rpx;
  min-height: 44px;
  padding: 10rpx 14rpx;
  color: #65765f;
  background: transparent;
  white-space: nowrap;
}
.source-tab.selected {
  color: #304a3a;
  background: #fffef8;
  font-weight: 650;
}
.subscribe-button {
  min-height: 44px;
  white-space: nowrap;
}
.subscription-tip {
  padding-top: 12rpx;
}
.invitation-tip {
  margin-top: 14rpx;
  line-height: 1.7;
}
.invitation-summary { margin: 12px 0; padding: 12px 14px; border-left: 3px solid #a99b77; background: #f2eddb; color: #6c735f; font-size: 13px; line-height: 1.8; }
.summary-title { color: #3b5742; font-weight: 600; }
.last-message { margin: 12px 0 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #4c5e4d; font-size: 14px; }
@media (max-width: 420px) {
  .message-tools {
    align-items: stretch;
    flex-direction: column;
  }
  .subscribe-button {
    width: 100%;
  }
}
</style>
