<template>
  <view
    class="card"
    :class="'card-' + item.type"
    role="button"
    tabindex="0"
    :aria-label="`查看${item.title}`"
    @tap="openContent(item.type, item.id)"
    @keydown.enter.self.prevent="openContent(item.type, item.id)"
    @keydown.space.self.prevent="openContent(item.type, item.id)"
  >
    <view class="row">
      <text class="tag">
        {{ contentNames[item.type] }} · {{ categoryLabel(item) }}
      </text>
      <text class="muted">{{ labels[item.status] || item.status }}</text>
    </view>
    <view class="card-content">
      <image
        v-if="imageSource && !imageFailed"
        class="card-photo"
        :src="imageSource"
        mode="aspectFill"
        @error="imageFailed = true"
      />
      <view v-else-if="imageSource" class="card-photo photo-unavailable" @tap.stop>
        <text>图片未加载</text>
        <button class="photo-retry" @tap.stop="imageFailed = false">重试</button>
      </view>
      <view class="card-summary">
        <view class="card-title">{{ item.title }}</view>
        <template v-if="item.type === 'plan'">
          <view class="muted card-time">{{ planTime }}</view>
          <view class="muted card-location">{{ item.location || '地点待补充' }}</view>
          <view v-if="capacity" class="card-capacity" :class="{ unavailable: item.status !== 'open' }">
            <text>{{ memberCount }} / {{ capacity }} 人</text>
            <text v-if="item.status === 'open'">还可加入 {{ remaining }} 人</text>
            <text v-else-if="item.status === 'full'">这队已满，看看其他计划</text>
          </view>
        </template>
        <view v-else class="muted">{{ item.location || item.campusName }}</view>
      </view>
    </view>
    <view class="row card-footer">
      <text class="link" role="link" tabindex="0" @tap.stop="openProfile(item.ownerId)" @keydown.enter.stop.prevent="openProfile(item.ownerId)" @keydown.space.stop.prevent="openProfile(item.ownerId)">
        {{ item.owner?.nickname || '同学' }} ↗
      </text>
      <text v-if="item.type === 'market'" class="price">
        {{ item.marketType === 'buy' ? '预算 ' : '' }}¥{{
          price
        }}
      </text>
      <text v-else class="muted">查看详情 →</text>
    </view>
  </view>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import {
  contentNames,
  openContent,
  openProfile,
  formatTime
} from '../utils/routes.js'
const props = defineProps({ item: { type: Object, required: true } })
const imageSource = computed(() => props.item.images?.[0] || '')
const imageFailed = ref(false)
watch(imageSource, () => { imageFailed.value = false })
const planTime = computed(() => [formatTime(props.item.startAt), formatTime(props.item.endAt)].filter(Boolean).join(' ～ ') || '时间待补充')
const capacity = computed(() => Math.max(0, Number(props.item.capacity) || 0))
const memberCount = computed(() => props.item.memberIds?.length || 0)
const remaining = computed(() => Math.max(0, capacity.value - memberCount.value))
const price = computed(() => {
  const cents = Number(props.item.marketType === 'buy' ? props.item.budgetCents : props.item.priceCents)
  return Number.isFinite(cents) ? (cents / 100).toFixed(2) : '—'
})
const labels = {
  open: '招募中',
  active: '发布中',
  full: '已满员',
  closed: '已关闭',
  completed: '已完成',
  returned: '已归还',
  reserved: '已预约',
  expired: '已过期'
}
const lostCategories = { card: '卡片', key: '钥匙', misc: '杂物' }
const lostKinds = { lost: '丢失', found: '拾获' }
function categoryLabel(item) {
  if (item.type !== 'lost_found') return item.category
  return `${lostKinds[item.lostKind] || '失物'} · ${lostCategories[item.category] || item.category}`
}
</script>
<style scoped>
.card {
  position: relative;
  padding: 20px;
  color: #354d3e;
  background: #fffbec;
  border: 1px solid #d8cbaa;
  border-left: 4px solid var(--room-accent, #6e9b80);
  border-radius: 3px 3px 10px 3px;
  margin: 14px 0;
  box-shadow: 0 3px 0 #d9ccb44d;
}
.card-content { display: flex; align-items: center; gap: 16px; margin-top: 14px; }
.card-summary { flex: 1; min-width: 0; }
.card-photo { flex: none; width: 88px; height: 88px; border: 3px solid #e6d8b9; border-radius: 4px; }
.photo-unavailable { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: #eee9d7; color: #727760; font-size: 10px; }
.photo-unavailable .photo-retry { display: block; min-height: 44px; padding: 4px 8px; color: #3e654f; background: #fffbec; font-size: 12px; }
.card-time { font-variant-numeric: tabular-nums; }
.card-location { margin-top: 3px; }
.card-capacity { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 9px; color: #3e654f; font-size: 12px; font-weight: 600; }
.card-capacity.unavailable { color: #727760; font-weight: 400; }
.card-title {
  font-size: 19px;
  line-height: 1.6;
  font-weight: 650;
  margin-bottom: 6px;
  overflow-wrap: anywhere;
}
.card .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.card .muted { font-size: 13px; line-height: 1.7; color: #727760; }
.card .tag { padding: 3px 8px; font-size: 12px; line-height: 1.5; border-radius: 4px; background: var(--room-tint, #e3ebdd); }
.card .link { color: #3e654f; font-size: 14px; }
.card-footer {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed #e1d5b7;
}
.price {
  font-size: 19px;
  font-weight: 650;
  color: #8d603b;
}
@media (max-width: 520px) {
  .card { padding: 16px; }
  .card-content { gap: 12px; }
  .card-photo { width: 72px; height: 72px; }
  .card-title { font-size: 18px; }
}
/* #ifdef H5 */
.card:focus-visible, .card .link:focus-visible { outline: 2px solid var(--room-accent, #6e9b80); outline-offset: 3px; }
/* #endif */
</style>
