<template>
  <view v-if="state && state.supported" class="connection-settings">
    <button class="connection-toggle" :disabled="busy || disabled" :aria-expanded="expanded" @tap="toggle">
      <text>测试服务地址</text><text class="connection-chevron" aria-hidden="true">{{ expanded ? '收起 −' : '展开 ＋' }}</text>
    </button>
    <view v-if="expanded" class="connection-body">
      <view class="connection-caption">当前地址</view>
      <view class="connection-origin">{{ state.currentOrigin }}</view>
      <view class="connection-note">地址由维护者提供；切换后重新登录，同一后端原账号保留。</view>
      <input v-model="originInput" class="input connection-input" type="text" maxlength="512" :disabled="busy || disabled"
        placeholder="粘贴维护者提供的 HTTPS 地址" confirm-type="done" />
      <view v-if="error" class="error connection-message" role="alert">{{ error }}</view>
      <view v-if="notice" class="connection-message" role="status">{{ notice }}</view>
      <view class="connection-actions">
        <button class="primary" :disabled="busy || disabled" @tap="switchAddress">{{ busy ? restarting ? '正在重新打开…' : '正在处理…' : '检查并切换' }}</button>
        <button class="secondary" :disabled="busy || disabled || (!state.usesOverride && !state.error)" @tap="restoreAddress">恢复默认地址</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { onUnmounted, ref, watch } from 'vue'
import { connection } from '../services/index.js'
import { errorText } from '../utils/errors.js'

const props = defineProps({ active: { type: Boolean, default: true }, disabled: { type: Boolean, default: false } })
const emit = defineEmits(['busy'])
const state = ref(null), originInput = ref(''), expanded = ref(false)
const busy = ref(false), restarting = ref(false), error = ref(''), notice = ref('')
let alive = true, revision = 0

function readState(prefill = false) {
  try {
    state.value = connection.getState()
    error.value = state.value.error || ''
    if (prefill) originInput.value = state.value.currentOrigin || ''
  } catch (failure) { error.value = errorText(failure) }
}
function setBusy(value) {
  busy.value = value
  if (alive) emit('busy', value)
}
function toggle() {
  if (busy.value || props.disabled || !props.active) return
  expanded.value = !expanded.value
  if (expanded.value) readState(!originInput.value)
}
function confirmChange(restoring) {
  return new Promise(resolve => uni.showModal({
    title: restoring ? '恢复默认服务地址' : '切换测试服务地址',
    content: '切换后需要重新登录；同一后端的原账号和数据保留。请只使用维护者提供的地址。',
    confirmText: restoring ? '恢复并重启' : '检查并切换', confirmColor: '#3e654f',
    success: result => resolve(result.confirm), fail: () => resolve(false)
  }))
}
async function changeAddress(restoring) {
  if (!alive || !props.active || props.disabled || busy.value || !state.value?.supported) return
  if (restoring && !state.value.usesOverride && !state.value.error) return
  const version = ++revision, origin = originInput.value.trim()
  const current = () => alive && props.active && !props.disabled && version === revision
  error.value = ''; notice.value = ''; setBusy(true)
  try {
    if (!await confirmChange(restoring) || !current()) return
    const result = restoring ? await connection.restoreDefault({ current }) : await connection.switchTo(origin, { current })
    if (!current()) return
    restarting.value = result?.restarting === true
    notice.value = '服务地址已保存，正在重新打开…'
  } catch (failure) { if (current()) error.value = errorText(failure) }
  finally { if (!restarting.value) setBusy(false) }
}
function switchAddress() { return changeAddress(false) }
function restoreAddress() { return changeAddress(true) }
watch(() => props.active, active => {
  ++revision; expanded.value = false; error.value = ''; notice.value = ''
  if (active) readState(true)
}, { immediate: true })
onUnmounted(() => { ++revision; setBusy(false); alive = false })
</script>

<style scoped>
.connection-settings { margin-top: 20px; padding-top: 10px; border-top: 1px dashed #d7dfc8; }
.connection-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; margin: 0; padding: 10px 0; background: transparent; color: #54705a; font-size: 13px; text-align: left; line-height: 1.6; }
.connection-chevron { color: #7c8b72; font-size: 12px; white-space: nowrap; }
.connection-body { padding: 4px 0 8px; }
.connection-caption { color: #7c836f; font-size: 12px; }
.connection-origin { margin-top: 4px; color: #38553b; font-size: 13px; overflow-wrap: anywhere; word-break: break-all; }
.connection-note { margin-top: 10px; color: #7b806e; font-size: 12px; line-height: 1.7; }
.connection-input { margin-top: 12px; font-size: 13px; }
.connection-message { margin-top: 12px; font-size: 13px; line-height: 1.6; }
.connection-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.connection-actions button { flex: 1; min-width: 118px; margin: 0; padding: 11px 8px; font-size: 13px; line-height: 1.5; }
</style>
