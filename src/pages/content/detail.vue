<template>
  <view class="page village-page" :class="type === 'market' ? 'village-market' : type === 'lost_found' ? 'village-lost' : 'village-partner'">
    <VillageHeader :kind="type" :title="contentNames[type]" subtitle="读一读这张小纸条，和发布的同学聊聊。" compact />
    <DemoNotice />
    <view v-if="error" class="error">{{ error }}</view>
    <view v-if="item" class="panel">
      <view class="row">
        <text class="tag">{{ contentNames[type] }} · {{ statusLabel(item.status) }}</text>
        <text v-if="type === 'lost_found'" class="tag">
          {{ lostKindLabel(item.lostKind) }} · {{ lostCategoryLabel(item.category) }}
        </text>
      </view>
      <view class="title detail-title">{{ item.title }}</view>
      <view
        class="link detail-owner"
        @tap="openProfile(item.ownerId)"
      >
        {{ item.owner?.nickname }} 的主页 ↗
      </view>
      <view class="muted">{{ item.location }} · {{ item.campusName }}</view>
      <view v-if="type === 'plan'" class="muted">
        {{ formatTime(item.startAt) }} ～ {{ formatTime(item.endAt) }} ·
        {{ item.memberIds.length }}/{{ item.capacity }} 人
      </view>
      <view v-if="type === 'market'" class="section-title">
        <template v-if="item.marketType === 'buy'">
          预算 ¥{{ (item.budgetCents / 100).toFixed(2) }}
        </template>
        <template v-else>¥{{ (item.priceCents / 100).toFixed(2) }}</template>
      </view>
      <view v-if="type === 'market'" class="muted">
        <template v-if="item.marketType === 'sell'">
          成色：{{ item.condition }} · 交接：{{ item.handoverCampus }}
        </template>
        <template v-else>关键词：{{ item.keywords }}</template>
      </view>
      <view v-if="type === 'market'" class="muted">
        参考估价后续提供
      </view>
      <view class="body detail-body">{{ item.body }}</view>
      <view class="actions">
        <image
          v-for="(image, index) in item.images"
          :key="index"
          :src="image"
          mode="aspectFill"
          class="thumb"
          @tap="preview(image)"
        />
      </view>
      <view class="actions">
        <button v-if="!isOwn" class="primary" :disabled="busy" @tap="contact">
          联系发布者
        </button>
        <button
          v-if="canManagePlan && item.status === 'open'"
          class="primary"
          :disabled="busy"
          @tap="candidates"
        >
          查看相近计划
        </button>
        <button
          v-if="canManagePlan"
          class="secondary"
          :disabled="busy"
          @tap="editPlan"
        >
          编辑计划 / 调整人数
        </button>
        <button
          v-if="!isOwn && type === 'market' && item.status === 'active'"
          class="primary"
          :disabled="busy"
          @tap="reserve"
        >
          预约交接
        </button>
        <button class="secondary" :disabled="busy" @tap="toggleFavorite">
          {{ selected ? '取消收藏' : '收藏' }}
        </button>
        <button class="secondary" :disabled="busy" @tap="report">举报</button>
        <button
          v-if="isOwn && type === 'market' && item.status === 'active'"
          class="primary"
          :disabled="busy"
          @tap="complete"
        >
          标记交易完成
        </button>
        <button
          v-if="isOwn && (type === 'plan' ? canManagePlan : ['open', 'active', 'full'].includes(item.status))"
          class="secondary"
          :disabled="busy"
          @tap="finish"
        >
          {{
            type === 'lost_found'
              ? '确认已归还'
              : type === 'market'
                ? '下架'
                : '标记完成'
          }}
        </button>
        <button
          v-if="canManagePlan"
          class="secondary"
          :disabled="busy"
          @tap="cancelPlan"
        >
          取消计划
        </button>
      </view>
    </view>
    <view v-if="item && type === 'lost_found'" class="panel">
      <view class="row">
        <view class="section-title comment-title">评论区</view>
        <text class="muted">公开交流物品线索</text>
      </view>
      <view v-if="commentsLoading" class="muted comment-state">正在读取评论…</view>
      <view v-else-if="!comments.length" class="muted comment-state">
        暂时没有评论，可以留下物品线索。
      </view>
      <view v-for="comment in comments" :key="comment.id" class="comment-item">
        <view class="row">
          <text class="link" @tap="openProfile(comment.authorId)">
            {{ comment.author?.nickname || '同学' }} ↗
          </text>
          <text class="muted">{{ formatTime(comment.createdAt) }}</text>
        </view>
        <view class="body comment-body">{{ comment.body }}</view>
      </view>
      <button
        v-if="commentsCursor"
        class="secondary comments-more"
        :disabled="commentsLoading"
        @tap="loadComments({ reset: false })"
      >
        {{ commentsLoading ? '正在读取…' : '更早的线索' }}
      </button>
      <textarea
        class="input textarea"
        v-model="commentBody"
        maxlength="500"
        placeholder="请勿公开身份证号、手机号等隐私信息"
      />
      <view class="actions">
        <button
          class="primary"
          :disabled="commentSaving || !commentBody.trim()"
          @tap="sendComment"
        >
          {{ commentSaving ? '正在发送…' : '发表评论' }}
        </button>
      </view>
    </view>
  </view>
</template>
<script setup>
import { ref, computed, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import DemoNotice from '../../components/DemoNotice.vue'
import VillageHeader from '../../components/village/VillageHeader.vue'
import * as api from '../../services/index.js'
import { session } from '../../utils/session.js'
import {
  contentTypes,
  contentNames,
  openProfile,
  formatTime
} from '../../utils/routes.js'
import { errorText } from '../../utils/errors.js'
const type = ref('plan'),
  id = ref(''),
  item = ref(null),
  error = ref(''),
  busy = ref(false),
  selected = ref(false),
  comments = ref([]),
  commentsCursor = ref(null),
  commentBody = ref(''),
  commentsLoading = ref(false),
  commentSaving = ref(false),
  planRefreshing = ref(false)
const isOwn = computed(() => item.value?.ownerId === session.user?.id)
const canManagePlan = computed(
  () => isOwn.value && type.value === 'plan' &&
    !planRefreshing.value && ['open', 'full'].includes(item.value?.status)
)
let loadVersion = 0
let commentsVersion = 0
let visible = false
const service = () =>
  api[type.value === 'lost_found' ? 'lostFound' : type.value]
onLoad((options) => {
  if (contentTypes.includes(options.type)) type.value = options.type
  id.value = options.id || ''
})
async function load({ preserveError = false } = {}) {
  const version = ++loadVersion
  const userId = session.user?.id
  const contentType = type.value
  const contentId = id.value
  const current = () => visible && version === loadVersion && userId === session.user?.id &&
    contentType === type.value && contentId === id.value
  if (!preserveError) error.value = ''
  if (contentType === 'plan') planRefreshing.value = true
  try {
    const result = await service().get({ id: contentId })
    if (!current()) return
    item.value = result
    selected.value = false
    let cursor = null
    do {
      const favorites = await api.favorite.list({ pageSize: 50, cursor })
      if (!current()) return
      selected.value = favorites.items.some(
        (f) => f.contentType === type.value && f.contentId === id.value
      )
      cursor = favorites.nextCursor
    } while (cursor && !selected.value)
    if (type.value === 'lost_found') await loadComments()
  } catch (e) {
    if (!current()) return
    if (contentType === 'plan') item.value = null
    if (!preserveError || !error.value) error.value = errorText(e)
  } finally {
    if (current()) planRefreshing.value = false
  }
}
async function loadComments({ reset = true } = {}) {
  if (type.value !== 'lost_found' || (!reset && (commentsLoading.value || !commentsCursor.value))) return
  const version = ++commentsVersion
  const pageVersion = loadVersion
  const userId = session.user?.id
  const contentId = id.value
  const cursor = reset ? null : commentsCursor.value
  const current = () => visible && version === commentsVersion && pageVersion === loadVersion &&
    userId === session.user?.id && contentId === id.value && type.value === 'lost_found'
  commentsLoading.value = true
  try {
    const result = await api.comment.list({
      contentType: 'lost_found',
      contentId,
      pageSize: 50,
      cursor
    })
    if (!current()) return
    const next = reset ? result.items : [...comments.value, ...result.items]
    comments.value = next.filter((entry, index) => next.findIndex((other) => other.id === entry.id) === index)
    commentsCursor.value = result.nextCursor
  } catch (e) {
    if (current()) error.value = errorText(e)
  } finally {
    if (current()) commentsLoading.value = false
  }
}
async function sendComment() {
  if (commentSaving.value || !commentBody.value.trim()) return
  const userId = session.user?.id
  const contentId = id.value
  const body = commentBody.value.trim()
  const pageVersion = loadVersion
  const current = () => visible && pageVersion === loadVersion && userId === session.user?.id &&
    contentId === id.value && type.value === 'lost_found'
  commentSaving.value = true
  error.value = ''
  try {
    await api.comment.create({
      contentType: 'lost_found',
      contentId,
      body
    })
    if (!current()) return
    if (commentBody.value.trim() === body) commentBody.value = ''
    await loadComments()
  } catch (e) {
    if (current()) error.value = errorText(e)
  } finally {
    commentSaving.value = false
  }
}
watch(() => session.user?.id, () => {
  ++loadVersion
  ++commentsVersion
  item.value = null
  comments.value = []
  commentsCursor.value = null
  commentsLoading.value = false
  commentBody.value = ''
  selected.value = false
  planRefreshing.value = false
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
  ++commentsVersion
  commentsLoading.value = false
  planRefreshing.value = false
})
onUnload(() => {
  ++loadVersion
  ++commentsVersion
})
async function run(fn) {
  if (busy.value) return
  const userId = session.user?.id
  const contentType = type.value
  const contentId = id.value
  const version = loadVersion
  const current = () => visible && version === loadVersion && userId === session.user?.id &&
    contentType === type.value && contentId === id.value
  busy.value = true
  error.value = ''
  try {
    await fn(current)
  } catch (e) {
    if (!current()) return
    error.value = errorText(e)
    if (type.value === 'plan' && ['CONFLICT', 'FORBIDDEN', 'NOT_FOUND'].includes(e?.code))
      await load({ preserveError: true })
  } finally {
    busy.value = false
  }
}
function contact() {
  run(async (current) => {
    const c = await api.conversation.open({
      contentType: type.value,
      contentId: id.value,
      peerUserId: item.value.ownerId
    })
    if (!current()) return
    uni.navigateTo({
      url: `/pages/messages/chat?id=${encodeURIComponent(c.id)}`
    })
  })
}
function candidates() {
  uni.navigateTo({
    url: `/pages/partner/candidates?planId=${encodeURIComponent(id.value)}`
  })
}
function editPlan() {
  if (!canManagePlan.value || busy.value) return
  uni.navigateTo({
    url: `/pages/content/publish?type=plan&id=${encodeURIComponent(id.value)}`
  })
}
function reserve() {
  run(async (current) => {
    await api.market.reserve({ id: id.value })
    if (!current()) return
    uni.showToast({ title: '已提交预约', icon: 'success' })
    await load()
  })
}
function confirmationCurrent() {
  const version = loadVersion
  const userId = session.user?.id
  const contentType = type.value
  const contentId = id.value
  return () => visible && version === loadVersion && userId === session.user?.id &&
    contentType === type.value && contentId === id.value
}
function complete() {
  const same = confirmationCurrent()
  uni.showModal({
    title: '确认交易完成',
    content: '确认标记该商品已交易完成？完成后不可再预约或修改。',
    success: (r) => {
      if (r.confirm && same())
        run(async (current) => {
          const updated = await api.market.complete({ id: id.value })
          if (current()) item.value = updated
        })
    }
  })
}
function toggleFavorite() {
  run(async (current) => {
    const r = await api.favorite.set({
      contentType: type.value,
      contentId: id.value,
      selected: !selected.value
    })
    if (current()) selected.value = r.selected
  })
}
function report() {
  const same = confirmationCurrent()
  uni.showModal({
    title: '举报原因',
    editable: true,
    placeholderText: '请填写具体原因',
    success: (r) => {
      if (r.confirm && same())
        run(async (current) => {
          await api.report.create({
            contentType: type.value,
            contentId: id.value,
            reason: r.content || ''
          })
          if (!current()) return
          uni.showToast({ title: '已保存举报', icon: 'none' })
        })
    }
  })
}
function finish() {
  if (type.value === 'plan') {
    confirmPlan('complete')
    return
  }
  const same = confirmationCurrent()
  uni.showModal({
    title: '确认操作',
    content: '确认更新这条内容的状态吗？',
    success: (r) => {
      if (r.confirm && same())
        run(async (current) => {
          const action =
            type.value === 'lost_found'
              ? 'markReturned'
              : type.value === 'market'
                ? 'close'
                : 'complete'
          const updated = await service()[action]({ id: id.value })
          if (current()) item.value = updated
        })
    }
  })
}
function cancelPlan() {
  confirmPlan('close')
}
function confirmPlan(action) {
  if (!canManagePlan.value || busy.value) return
  const planId = id.value
  const userId = session.user?.id
  const version = loadVersion
  const current = () => visible && type.value === 'plan' && planId === id.value && userId === session.user?.id
  const cancelling = action === 'close'
  uni.showModal({
    title: cancelling ? '取消整个计划？' : '确认计划完成',
    content: cancelling
      ? '取消后，所有成员的这次活动安排将结束，尚未处理的邀请会失效，计划不能重新开启。这不是退出个人组队。'
      : '确认这次活动已经完成？完成后停止招募，未处理的邀请会失效，计划不能重新开启。',
    confirmText: cancelling ? '取消计划' : '确认完成',
    cancelText: cancelling ? '保留计划' : '再想一下',
    success: (result) => {
      if (result.confirm && version === loadVersion && current() && canManagePlan.value)
        changePlan(action, planId, current)
    }
  })
}
async function changePlan(action, planId, current) {
  if (busy.value) return
  const version = ++loadVersion
  busy.value = true
  error.value = ''
  try {
    const updated = await api.plan[action]({ id: planId })
    if (!current()) return
    if (version === loadVersion) item.value = updated
    else await load()
  } catch (e) {
    if (!current()) return
    if (version !== loadVersion) {
      await load()
      return
    }
    error.value = errorText(e)
    if (['CONFLICT', 'FORBIDDEN', 'NOT_FOUND'].includes(e?.code))
      await load({ preserveError: true })
  } finally {
    busy.value = false
  }
}
function preview(image) {
  uni.previewImage({ current: image, urls: item.value.images })
}
const statusLabels = {
  active: '进行中',
  returned: '已完成',
  closed: '已关闭',
  open: '进行中',
  full: '已满员',
  completed: '已完成',
  expired: '已过期',
  reserved: '已预约'
}
const lostCategories = { card: '卡片', key: '钥匙', misc: '杂物' }
const lostKinds = { lost: '丢失', found: '拾获' }
const statusLabel = (status) => statusLabels[status] || status
const lostCategoryLabel = (category) => lostCategories[category] || category
const lostKindLabel = (kind) => lostKinds[kind] || '失物'
</script>

<style scoped>
.detail-title { margin-top: 14px; }
.detail-owner { margin-top: 12px; }
.detail-body { margin-top: 20px; }
.comment-title {
  margin-top: 0;
}
.comment-state {
  padding: 18px 0;
}
.comment-item {
  padding: 16px 0;
  border-bottom: 1px dashed #ddd1b3;
}
.comment-body {
  margin-top: 8px;
}
.comment-item + .textarea,
.comment-state + .textarea {
  margin-top: 18px;
}
.comments-more { margin: 14px 0; }
</style>
