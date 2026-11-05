<template>
  <view v-if="visible && alerts.banner" class="message-notice" role="status" aria-live="polite">
    <button class="message-notice-open" @tap.stop="messageAlerts.open(alerts.banner.id)">
      <text class="notice-heading">{{ alerts.banner.peer?.nickname || '同学' }} 发来新私信</text>
      <text class="notice-preview">{{ alerts.banner.lastMessage?.body }}</text>
      <text class="notice-action">点击查看 · {{ alerts.total > 99 ? '99+' : alerts.total }} 条未读 →</text>
    </button>
    <button class="message-notice-close" aria-label="收起新私信提示" @tap.stop="messageAlerts.dismiss()">×</button>
  </view>
</template>
<script setup>
import { ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { messageAlerts } from '../services/message-alerts.js'
const alerts = messageAlerts.state
const visible = ref(false)
onShow(() => { visible.value = true })
onHide(() => { visible.value = false })
onUnload(() => { visible.value = false })
</script>
<style scoped>
.message-notice { position: fixed; z-index: 2000; left: 16px; right: 16px; bottom: calc(76px + env(safe-area-inset-bottom)); max-width: 480px; margin: 0 auto; display: flex; border: 1px solid #d8c4a0; border-left: 5px solid #bc654e; border-radius: 14px; background: #fff9e9; box-shadow: 0 5px 20px #55483330; }
.message-notice-open { flex: 1; min-width: 0; margin: 0; padding: 12px 14px; text-align: left; background: transparent; line-height: 1.5; }
.message-notice-open::after, .message-notice-close::after { border: 0; }
.notice-heading { display: block; color: #3e654f; font-size: 14px; font-weight: 700; }
.notice-preview { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #635b4d; font-size: 13px; }
.notice-action { display: block; margin-top: 4px; color: #a45240; font-size: 12px; }
.message-notice-close { flex: none; align-self: flex-start; margin: 4px; width: 44px; padding: 0; background: transparent; color: #817565; font-size: 24px; line-height: 44px; }
</style>
