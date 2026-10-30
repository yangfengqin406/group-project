<template>
  <FeedList
    type="plan"
    title="找搭子小屋"
    subtitle="先发布计划，再找到时间合拍的人"
    show-filters
    :category-options="planCategories"
    :status-options="statuses"
  />
</template>
<script setup>
import FeedList from '../../components/FeedList.vue'
import { planCategories } from '../../constants/plan.js'
const statuses = [
  { label: '全部状态', value: '' },
  { label: '招募中', value: 'open' },
  { label: '已满员', value: 'full' },
  { label: '已完成', value: 'completed' },
  { label: '已关闭', value: 'closed' },
  { label: '已过期', value: 'expired' }
]
</script>
