<template>
  <view class="panel push-settings">
    <view class="section-title">手机通知</view>
    <view v-if="!session.user" class="muted">登录后可开启私信通知。</view>
    <template v-else>
      <view v-if="state.enabled">本设备已连接手机通知，收到私信时可在系统通知栏查看。</view>
      <view v-else-if="state.configured === false" class="muted">服务端尚未开通手机推送，请联系维护者。站内消息仍可正常查看。</view>
      <view v-else class="muted">开启后可在通知栏查看新私信提醒，点击返回对应聊天。通知不显示私信正文。</view>
      <view v-if="state.permission === false" class="muted">手机未允许通知，请在系统设置中开启通知、横幅和锁屏提醒。</view>
      <view v-if="state.error" class="error">{{ state.error }}</view>
      <view class="actions">
        <button v-if="!state.enabled" class="secondary" :disabled="state.busy || state.configured === false" @tap="systemPush.enable()">{{ state.busy ? '正在连接…' : '开启手机通知' }}</button>
        <button v-else class="secondary" :disabled="state.busy" @tap="systemPush.disable()">关闭本设备通知</button>
        <button class="secondary" @tap="systemPush.openSettings()">系统通知设置</button>
        <button v-if="state.configured === false || state.error" class="secondary" :disabled="state.busy" @tap="systemPush.resume()">重新检查</button>
      </view>
      <view class="muted push-note">通知的声音、横幅与锁屏显示由手机设置控制。</view>
    </template>
  </view>
</template>
<script setup>
import { systemPush } from '../services/system-push.js'
import { session } from '../utils/session.js'
const state = systemPush.state
</script>
<style scoped>
.section-title { margin-top: 0; }
.push-settings .actions { flex-wrap: wrap; margin-top: 12px; }
.push-note { margin-top: 10px; }
</style>
