<template>
  <view class="page village-page village-partner">
    <VillageHeader kind="partner" title="寻找合拍的邻居" subtitle="时间合得上，再一起商量去哪里。" compact />
    <DemoNotice />
    <view class="title">时间合拍的计划</view>
    <view class="subtitle">
      同一校区、同类活动、同一天且时间重叠。邀请后仍需对方确认。
    </view>
    <view v-if="target" class="panel my-plan-summary">
      <text class="tag">我的计划 · 邀请对方加入这里</text>
      <view class="section-title">{{ target.title }}</view>
      <view class="muted">{{ formatTime(target.startAt) }} ～ {{ formatTime(target.endAt) }}</view>
      <view class="muted">{{ target.location || '地点待商量' }} · 还可加入 {{ Math.max(0, target.capacity - (target.memberIds?.length || 0)) }} 人</view>
    </view>
    <view v-if="sent.length" class="panel">
      <view>邀请已发出，等待对方确认。</view>
      <view class="muted">在消息中心查看接受、拒绝或取消后的状态。</view>
      <view class="actions">
        <button class="primary" @tap="openInvitations">查看邀请进度</button>
      </view>
    </view>
    <view v-if="error" class="error">{{ error }}</view>
    <view
      v-for="candidate in items"
      :key="candidate.candidatePlanId"
      class="panel"
    >
      <view class="section-title" style="margin-top: 0">
        {{ candidate.plan.title }}
      </view>
      <view class="link" @tap="openProfile(candidate.ownerId)">
        {{ candidate.owner.nickname }} ↗
      </view>
      <view class="muted">
        可共同安排：{{ formatTime(candidate.overlap.startAt) }} ～
        {{ formatTime(candidate.overlap.endAt) }}
      </view>
      <view class="muted">{{ candidate.plan.location || '地点待商量' }} · 对方计划 {{ candidate.plan.memberIds?.length || 0 }}/{{ candidate.plan.capacity }} 人</view>
      <view class="invitation-explainer">邀请的是这位发布者，接受后占用我的计划 1 个名额；不会自动带入对方整队。</view>
      <view class="actions">
        <text class="tag" v-for="reason in candidate.reasons" :key="reason">
          {{ reason }}
        </text>
      </view>
      <view class="actions">
        <button
          class="primary"
          :disabled="busy || loading || sent.includes(candidate.candidatePlanId)"
          @tap="invite(candidate)"
        >
          {{
            sent.includes(candidate.candidatePlanId)
              ? '等待对方确认'
              : '邀请加入我的计划'
          }}
        </button>
        <button
          class="secondary"
          @tap="openContent('plan', candidate.candidatePlanId)"
        >
          查看详情
        </button>
      </view>
    </view>
    <EmptyState
      v-if="!loading && !items.length && !error"
      title="暂时没有合适计划"
      description="可以换个时间，或等待其他同学发布。"
    />
    <button v-if="cursor" class="secondary" :disabled="loading || busy" @tap="load(false)">加载更多</button>
  </view>
</template>
<script setup>
import { ref, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { plan, invitation } from '../../services/index.js'
import { session } from '../../utils/session.js'
import { runInvitationOperation } from '../../utils/invitation-operations.js'
import {
  openContent,
  openProfile,
  formatTime
} from '../../utils/routes.js'
import { errorText } from '../../utils/errors.js'
import DemoNotice from '../../components/DemoNotice.vue'
import EmptyState from '../../components/EmptyState.vue'
import VillageHeader from '../../components/village/VillageHeader.vue'
const planId = ref(''),
  target = ref(null),
  items = ref([]),
  sent = ref([]),
  error = ref(''),
  busy = ref(false),
  loading = ref(false),
  cursor = ref(null)
let loadVersion = 0
let visible = false
function openInvitations() {
  uni.switchTab({ url: '/pages/messages/index' })
}
onLoad((options) => {
  planId.value = options.planId
})
async function pendingSources(targetPlanId, userId, current) {
  const sources = new Set()
  let nextCursor = null
  do {
    const result = await invitation.list({ cursor: nextCursor, pageSize: 50 })
    if (!current()) return []
    for (const item of result.items) {
      if (item.senderId === userId && item.targetPlanId === targetPlanId && item.status === 'pending')
        sources.add(item.sourcePlanId)
    }
    nextCursor = result.nextCursor
  } while (nextCursor)
  return [...sources]
}
async function load(reset = true, { preserveError = false } = {}) {
  if (!reset && (loading.value || busy.value || !cursor.value)) return
  const version = reset ? ++loadVersion : loadVersion
  const targetPlanId = planId.value
  const userId = session.user?.id
  const current = () => version === loadVersion && targetPlanId === planId.value && userId === session.user?.id
  loading.value = true
  if (!preserveError) error.value = ''
  if (reset) {
    items.value = []
    sent.value = []
    cursor.value = null
  }
  try {
    const [r, pending, ownPlan] = await Promise.all([
      plan.getCandidates({ planId: targetPlanId, cursor: reset ? null : cursor.value }),
      reset ? pendingSources(targetPlanId, userId, current) : Promise.resolve(null),
      reset ? plan.get({ id: targetPlanId }) : Promise.resolve(target.value)
    ])
    if (!current()) return
    target.value = ownPlan
    const known = new Set(reset ? [] : items.value.map((item) => item.candidatePlanId))
    items.value = [...(reset ? [] : items.value), ...r.items.filter((item) => !known.has(item.candidatePlanId))]
    if (pending) sent.value = pending
    cursor.value = r.nextCursor
  } catch (e) {
    if (current() && (!preserveError || !error.value)) error.value = errorText(e)
  } finally {
    if (current()) loading.value = false
  }
}
async function invite(candidate) {
  if (busy.value || loading.value || sent.value.includes(candidate.candidatePlanId)) return
  const userId = session.user?.id
  const targetPlanId = planId.value
  const version = loadVersion
  const current = () => version === loadVersion && targetPlanId === planId.value && userId === session.user?.id
  const samePage = () => visible && targetPlanId === planId.value && userId === session.user?.id
  busy.value = true
  error.value = ''
  try {
    await runInvitationOperation(
      { userId, method: 'invitation.create', params: { sourcePlanId: candidate.candidatePlanId, targetPlanId } },
      invitation.create
    )
    if (!samePage()) return
    if (current()) sent.value = [...new Set([...sent.value, candidate.candidatePlanId])]
    const refreshVersion = loadVersion + 1
    await load(true)
    if (refreshVersion === loadVersion && userId === session.user?.id && targetPlanId === planId.value && !error.value)
      uni.showToast({
        title: sent.value.includes(candidate.candidatePlanId) ? '邀请已保存' : '邀请状态已更新',
        icon: 'none'
      })
  } catch (e) {
    if (!current()) {
      if (samePage() && ['CONFLICT', 'FORBIDDEN', 'NOT_FOUND'].includes(e?.code)) await load(true)
      return
    }
    const message = errorText(e)
    error.value = message
    if (['CONFLICT', 'FORBIDDEN', 'NOT_FOUND'].includes(e?.code)) {
      const refreshVersion = loadVersion + 1
      await load(true, { preserveError: true })
      if (refreshVersion === loadVersion && userId === session.user?.id && targetPlanId === planId.value) error.value = message
    }
  } finally {
    busy.value = false
  }
}
watch(() => session.user?.id, () => {
  ++loadVersion
  items.value = []
  target.value = null
  sent.value = []
  cursor.value = null
  loading.value = false
  error.value = ''
  if (visible) load(true)
})
onShow(() => {
  visible = true
  load(true)
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
.my-plan-summary { border-left: 4px solid #9c8aaf; }
.invitation-explainer { margin-top: 12px; color: #7e806b; font-size: 12px; line-height: 1.8; }
</style>
