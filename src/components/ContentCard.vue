<template>
  <view class="card" @tap="openContent(item.type, item.id)">
    <view class="row">
      <text class="tag">
        {{ contentNames[item.type] }} · {{ categoryLabel(item) }}
      </text>
      <text class="muted">{{ labels[item.status] || item.status }}</text>
    </view>
    <view class="card-title">{{ item.title }}</view>
    <view class="muted">
      {{
        item.type === 'plan'
          ? formatTime(item.startAt)
          : item.location || item.campusName
      }}
    </view>
    <view class="row card-footer">
      <text class="link" @tap.stop="openProfile(item.ownerId)">
        {{ item.owner?.nickname || '同学' }} ↗
      </text>
      <text v-if="item.type === 'market'" class="price">
        ¥{{ (item.priceCents / 100).toFixed(2) }}
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
  padding: 26rpx;
  background: #fffef8;
  border: 2rpx solid #e1e5d6;
  border-radius: 18rpx;
  margin: 18rpx 0;
}
.card-title {
  font-size: 31rpx;
  font-weight: 650;
  margin: 18rpx 0 8rpx;
}
.card-footer {
  margin-top: 22rpx;
}
.price {
  font-size: 30rpx;
  font-weight: 650;
  color: #9d6849;
}
</style>
