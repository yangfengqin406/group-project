<template>
  <view class="card" :class="'card-' + item.type" @tap="openContent(item.type, item.id)">
    <view class="row">
      <text class="tag">
        {{ contentNames[item.type] }} · {{ categoryLabel(item) }}
      </text>
      <text class="muted">{{ labels[item.status] || item.status }}</text>
    </view>
    <view class="card-content">
      <image
        v-if="item.images?.length"
        class="card-photo"
        :src="item.images[0]"
        mode="aspectFill"
      />
      <view class="card-summary">
        <view class="card-title">{{ item.title }}</view>
        <view class="muted">
          {{
            item.type === 'plan'
              ? formatTime(item.startAt)
              : item.location || item.campusName
          }}
        </view>
      </view>
    </view>
    <view class="row card-footer">
      <text class="link" @tap.stop="openProfile(item.ownerId)">
        {{ item.owner?.nickname || '同学' }} ↗
      </text>
      <text v-if="item.type === 'market'" class="price">
        {{ item.marketType === 'buy' ? '预算 ' : '' }}¥{{
          ((item.marketType === 'buy' ? item.budgetCents : item.priceCents) / 100).toFixed(2)
        }}
      </text>
      <text v-else class="muted">查看详情 →</text>
    </view>
  </view>
</template>
<script setup>
import {
  contentNames,
  openContent,
  openProfile,
  formatTime
} from '../utils/routes.js'
defineProps({ item: { type: Object, required: true } })
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
</style>
