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
          v-if="isOwn && type === 'plan' && item.status === 'open'"
          class="primary"
          @tap="candidates"
        >
          查看相近计划
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
          v-if="isOwn && ['open', 'active', 'full'].includes(item.status)"
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
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
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
  commentBody = ref(''),
  commentsLoading = ref(false),
  commentSaving = ref(false)
const isOwn = computed(() => item.value?.ownerId === session.user?.id)
const service = () =>
  api[type.value === 'lost_found' ? 'lostFound' : type.value]
onLoad((options) => {
  if (contentTypes.includes(options.type)) type.value = options.type
  id.value = options.id || ''
})
async function load() {
  error.value = ''
  try {
    item.value = await service().get({ id: id.value })
    selected.value = false
    let cursor = null
    do {
      const favorites = await api.favorite.list({ pageSize: 50, cursor })
      selected.value = favorites.items.some(
        (f) => f.contentType === type.value && f.contentId === id.value
      )
      cursor = favorites.nextCursor
    } while (cursor && !selected.value)
    if (type.value === 'lost_found') await loadComments()
  } catch (e) {
    error.value = errorText(e)
  }
}
async function loadComments() {
  commentsLoading.value = true
  try {
    const result = await api.comment.list({
      contentType: type.value,
      contentId: id.value,
      pageSize: 50
    })
    comments.value = result.items
  } finally {
    commentsLoading.value = false
  }
}
async function sendComment() {
  if (commentSaving.value || !commentBody.value.trim()) return
  commentSaving.value = true
  error.value = ''
  try {
    await api.comment.create({
      contentType: type.value,
      contentId: id.value,
      body: commentBody.value
    })
    commentBody.value = ''
    await loadComments()
  } catch (e) {
    error.value = errorText(e)
  } finally {
    commentSaving.value = false
  }
}
onShow(load)
async function run(fn) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = false
  }
}
function contact() {
  run(async () => {
    const c = await api.conversation.open({
      contentType: type.value,
      contentId: id.value,
      peerUserId: item.value.ownerId
    })
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
function reserve() {
  run(async () => {
    await api.market.reserve({ id: id.value })
    uni.showToast({ title: '已提交预约', icon: 'success' })
    load()
  })
}
function complete() {
  uni.showModal({
    title: '确认交易完成',
    content: '确认标记该商品已交易完成？完成后不可再预约或修改。',
    success: (r) => {
      if (r.confirm)
        run(async () => {
          item.value = await api.market.complete({ id: id.value })
        })
    }
  })
}
function toggleFavorite() {
  run(async () => {
    const r = await api.favorite.set({
      contentType: type.value,
      contentId: id.value,
      selected: !selected.value
    })
    selected.value = r.selected
  })
}
function report() {
  uni.showModal({
    title: '举报原因',
    editable: true,
    placeholderText: '请填写具体原因',
    success: (r) => {
      if (r.confirm)
        run(async () => {
          await api.report.create({
            contentType: type.value,
            contentId: id.value,
            reason: r.content || ''
          })
          uni.showToast({ title: '已保存举报', icon: 'none' })
        })
    }
  })
}
function finish() {
  uni.showModal({
    title: '确认操作',
    content: '确认更新这条内容的状态吗？',
    success: (r) => {
      if (r.confirm)
        run(async () => {
          const action =
            type.value === 'lost_found'
              ? 'markReturned'
              : type.value === 'market'
                ? 'close'
                : 'complete'
          item.value = await service()[action]({ id: id.value })
        })
    }
  })
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
</style>
