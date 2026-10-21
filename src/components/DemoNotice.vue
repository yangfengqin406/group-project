<template>
  <view v-if="isMock" class="demo-notice">
    本机演示 · 虚构资料 · 数据不会同步给其他同学
  </view>
</template>
<script setup>
import { config } from '../config/index.js'
const isMock = config.apiMode === 'mock'
</script>
<style scoped>
.demo-notice {
  color: #8a7146;
  background: #f2ecd9;
  border-radius: 10rpx;
  padding: 14rpx 18rpx;
  font-size: 22rpx;
  line-height: 1.6;
  margin-bottom: 24rpx;
}
</style>
