<template>
  <FeedList
    type="market"
    title="二手集市"
    subtitle="让闲置找到下一位主人"
    :marketTypeOptions="marketTypeOptions"
    :campusOptions="campusOptions"
  />
</template>
<script setup>
import FeedList from '../../components/FeedList.vue'
const marketTypeOptions = [
  { label: '闲置', value: 'sell' },
  { label: '求购', value: 'buy' }
]
const campusOptions = [
  { label: '全部校区', value: '' },
  { label: '主校区', value: 'demo-campus' }
]
</script>
