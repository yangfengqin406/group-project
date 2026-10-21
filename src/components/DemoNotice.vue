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
  color: #807350;
  background: #eee8d2;
  border-left: 3px solid #baa474;
  border-radius: 3px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.6;
  margin: 14px 0 18px;
}
</style>
