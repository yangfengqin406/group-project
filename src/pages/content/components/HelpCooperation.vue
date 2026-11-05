<template>
  <view class="help-cooperation wx-v">
    <view class="cooperation-heading wx-v">
      <text class="cooperation-title wx-t">一起把问题解决</text>
      <button class="cooperation-refresh wx-b" :disabled="loading || busy" @tap="refresh()">刷新进展</button>
    </view>
    <text class="cooperation-intro wx-t">先与对方沟通，解决后双方各自确认。</text>
    <view v-if="error" class="cooperation-error wx-v" role="alert">{{ error }}</view>
    <view v-if="notice" class="cooperation-notice wx-v" role="status">{{ notice }}</view>
    <button v-if="canApply" class="cooperation-primary wx-b" :disabled="busy || loading" @tap="perform('apply')">{{ busy ? '正在提交…' : '我来帮忙' }}</button>
    <view v-if="!isOwner && help.selectedApplicationId && !myAccepted" class="cooperation-muted wx-v">发布者已选定帮助者，可以继续关注这条求助。</view>
    <view v-if="loading && !applications.length" class="cooperation-muted wx-v">正在读取帮忙进展…</view>
    <view v-else-if="!applications.length && !error" class="cooperation-muted wx-v">{{ isOwner ? '还没有帮忙申请。把需求描述清楚，更方便同学回应。' : '愿意帮忙的话，可以先申请，再与发布者沟通。' }}</view>
    <view v-for="application in applications" :key="application.id" class="cooperation-application wx-v">
      <view class="cooperation-heading wx-v">
        <text class="cooperation-person wx-t">{{ isOwner ? application.helper?.nickname || '帮忙的同学' : '我的帮忙申请' }}</text>
        <text class="cooperation-status wx-t">{{ statusLabel(application.status) }}</text>
      </view>
      <view v-if="application.status === 'accepted' || application.status === 'completed'" class="cooperation-confirmations wx-v">
        <text class="wx-t">发布者：{{ application.ownerConfirmedAt ? '已确认解决' : '待确认' }}</text>
        <text class="wx-t">帮助者：{{ application.helperConfirmedAt ? '已确认解决' : '待确认' }}</text>
      </view>
      <view class="cooperation-actions wx-v">
        <button v-if="isOwner && application.status === 'pending' && !help.selectedApplicationId && help.status === 'open'" class="cooperation-primary wx-b" :disabled="busy" @tap="choose(application)">请这位同学帮忙</button>
        <button v-if="isOwner && ['pending', 'accepted', 'completed'].includes(application.status)" class="cooperation-secondary wx-b" :disabled="busy" @tap="contactApplicant(application)">和这位同学聊聊</button>
        <button v-if="application.status === 'accepted'" class="cooperation-primary wx-b" :disabled="busy || hasConfirmed(application)" @tap="confirm(application)">{{ hasConfirmed(application) ? '已确认，等待对方' : '我确认问题已解决' }}</button>
        <button v-if="['pending', 'accepted'].includes(application.status)" class="cooperation-secondary wx-b" :disabled="busy" @tap="cancel(application)">{{ application.status === 'pending' ? isOwner ? '暂不需要' : '撤回申请' : '取消这次协作' }}</button>
      </view>
      <text v-if="application.status === 'completed'" class="cooperation-finished wx-t">谢谢彼此的帮助，奖励结果可在“我的”查看。</text>
    </view>
    <button v-if="cursor" class="cooperation-secondary cooperation-more wx-b" :disabled="loading || busy" @tap="refresh(false)">查看更多申请</button>
    <button class="cooperation-rules-toggle wx-b" :aria-expanded="rulesOpen" @tap="rulesOpen = !rulesOpen">{{ rulesOpen ? '收起互助规则' : '互助规则' }}</button>
    <text v-if="rulesOpen" class="cooperation-rule wx-t">由发布者选择一位帮助者，双方确认解决后结算珍珠：帮助者15颗，发布者5颗。每人每天最多两次完成奖励，同一双方每天最多一次；达到奖励上限也可继续互助。</text>
  </view>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { help as helpService, conversation } from '../../../services/index.js'
import { session } from '../../../utils/session.js'
import { idempotencyKey } from '../../../utils/routes.js'
import { errorText } from '../../../utils/errors.js'

const props = defineProps({ help: { type: Object, required: true }, refreshKey: { type: Number, default: 0 }, active: { type: Boolean, default: true } })
const emit = defineEmits(['change'])
const applications = ref([]), cursor = ref(null), loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const rulesOpen = ref(false)
let alive = true, revision = 0, operationRevision = 0
const operationKeys = new Map()
const isOwner = computed(() => props.help.ownerId === session.user?.id)
const myAccepted = computed(() => applications.value.some(application => application.helperId === session.user?.id && ['accepted', 'completed'].includes(application.status)))
const canApply = computed(() => !isOwner.value && props.help.status === 'open' && props.help.visibility === 'public' && !props.help.selectedApplicationId &&
  !applications.value.some(application => application.helperId === session.user?.id && ['pending', 'accepted'].includes(application.status)))
const statusLabel = status => ({ pending: '等待发布者选择', accepted: '正在互助', completed: '双方已确认解决', cancelled: '已撤回 / 取消' })[status] || status
const hasConfirmed = application => Boolean(isOwner.value ? application.ownerConfirmedAt : application.helperConfirmedAt)
const binding = () => [session.user?.id, props.help.id]
const isCurrent = (version, userId, helpId) => alive && props.active && version === revision && userId === session.user?.id && helpId === props.help.id

async function refresh(reset = true) {
  if (!alive || !props.active || (!reset && (!cursor.value || loading.value))) return
  const version = ++revision, [userId, helpId] = binding()
  const current = () => isCurrent(version, userId, helpId)
  loading.value = true
  error.value = ''
  const nextCursor = reset ? null : cursor.value
  try {
    const result = await helpService.listApplications({ helpId, cursor: nextCursor, pageSize: 20 })
    if (!current()) return
    const merged = reset ? result.items : [...applications.value, ...result.items]
    applications.value = merged.filter((application, index) => merged.findIndex(other => other.id === application.id) === index)
    cursor.value = result.nextCursor
  } catch (failure) {
    if (current()) error.value = errorText(failure)
  } finally {
    if (current()) loading.value = false
  }
}

async function perform(method, application) {
  if (busy.value || loading.value || !props.active) return
  const operationVersion = ++operationRevision
  const version = ++revision, [userId, helpId] = binding()
  const current = () => isCurrent(version, userId, helpId)
  const operation = `${method}:${application?.id || ''}`
  if (!operationKeys.has(operation)) operationKeys.set(operation, idempotencyKey())
  busy.value = true
  error.value = ''; notice.value = ''
  try {
    const result = await helpService[method]({ helpId, ...(application ? { applicationId: application.id } : {}), idempotencyKey: operationKeys.get(operation) })
    if (!current()) return
    operationKeys.delete(operation)
    emit('change', result.help)
    if (result.application.status === 'completed') {
      notice.value = result.reward?.delta > 0 ? `双方已确认解决，获得${result.reward.delta}颗珍珠。` : '双方已确认解决，奖励结果可在“我的”查看。'
    } else notice.value = ({ apply: '帮忙申请已送达，可以先与发布者聊聊。', selectHelper: '已选定帮助者，沟通解决后请双方各自确认。', confirmCompletion: '你的确认已保存，等待对方确认。', cancelCooperation: '申请或协作已取消，不发放完成奖励。' })[method]
    // A retry receipt may predate the other participant's confirmation.
    const latest = await helpService.get({ id: helpId })
    if (!current()) return
    emit('change', latest)
    await refresh()
  } catch (failure) {
    if (current()) { error.value = errorText(failure); busy.value = false; loading.value = false }
  } finally {
    if (alive && operationVersion === operationRevision && userId === session.user?.id && helpId === props.help.id) busy.value = false
  }
}

function ask(title, content, callback) {
  const [userId, helpId] = binding(), version = revision
  uni.showModal({ title, content, success: result => { if (result.confirm && isCurrent(version, userId, helpId)) callback() } })
}
function choose(application) { ask('请这位同学帮忙？', '选定后，解决问题需要你们双方确认。请先沟通好需求和安排。', () => perform('selectHelper', application)) }
function confirm(application) { ask('确认问题已经解决？', '请在实际互助完成后确认。对方也确认后，系统会保存完成结果并结算本次奖励。', () => perform('confirmCompletion', application)) }
function cancel(application) { ask(application.status === 'pending' ? '取消这份申请？' : '取消这次协作？', '取消后本次不发放完成奖励，请先与对方沟通好。', () => perform('cancelCooperation', application)) }
async function contactApplicant(application) {
  if (busy.value || loading.value || !props.active) return
  const operationVersion = ++operationRevision
  const version = ++revision, [userId, helpId] = binding()
  busy.value = true; error.value = ''
  try {
    const result = await conversation.open({ contentType: 'help', contentId: helpId, peerUserId: application.helperId })
    if (isCurrent(version, userId, helpId)) uni.navigateTo({ url: `/pages/messages/chat?id=${encodeURIComponent(result.id)}` })
  } catch (failure) {
    if (isCurrent(version, userId, helpId)) error.value = errorText(failure)
  } finally {
    if (alive && operationVersion === operationRevision && userId === session.user?.id && helpId === props.help.id) busy.value = false
  }
}
watch([() => props.help.id, () => session.user?.id, () => props.refreshKey, () => props.active], ([helpId, userId], previous) => {
  ++revision; ++operationRevision; applications.value = []; cursor.value = null; error.value = ''; notice.value = ''; loading.value = false; busy.value = false
  if (!previous || helpId !== previous[0] || userId !== previous[1]) { operationKeys.clear(); rulesOpen.value = false }
  if (props.active) refresh()
}, { immediate: true })
onUnmounted(() => { alive = false; ++revision })
</script>

<style scoped>
.help-cooperation { margin-top: 24px; padding-top: 18px; border-top: 1px dashed #ddd1b3; color: var(--ui-ink, #354d3e); }
.cooperation-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.cooperation-title { font-size: 19px; font-weight: 650; }
.cooperation-refresh { margin: 0; min-height: 44px; padding: 5px 0 5px 12px; background: transparent; color: var(--ui-muted, #788176); font-size: 12px; line-height: 1.7; }
.cooperation-intro, .cooperation-rule { display: block; margin: 8px 0 12px; font-size: 13px; line-height: 1.7; color: var(--ui-muted, #788176); }
.cooperation-rule { padding: 8px 0; }
.cooperation-rules-toggle { margin: 10px 0 0; padding: 6px 0; min-height: 44px; background: transparent; color: var(--ui-muted, #788176); font-size: 12px; }
.cooperation-application { padding: 16px 0 4px; margin-top: 14px; border-top: 1px solid var(--ui-line, #e0e6da); }
.cooperation-person { font-size: 15px; font-weight: 600; }
.cooperation-status { padding: 4px 9px; border-radius: 6px; font-size: 12px; color: var(--ui-primary, #204d3c); background: var(--ui-soft, #eef4eb); }
.cooperation-confirmations { display: flex; gap: 10px; flex-wrap: wrap; font-size: 13px; margin: 12px 0; color: var(--ui-muted, #788176); }
.cooperation-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.cooperation-primary, .cooperation-secondary { margin: 6px 0; min-height: 44px; padding: 11px 16px; border-radius: 7px; font-size: 14px; line-height: 1.6; }
.cooperation-primary { width: 100%; background: var(--ui-primary, #3e654f); color: #fff9e5; font-weight: 650; }
.cooperation-secondary { background: transparent; color: var(--ui-primary, #204d3c); }
.cooperation-more { width: 100%; }
.cooperation-error { color: #a6533b; font-size: 14px; margin: 10px 0; }
.cooperation-notice { padding: 12px; background: var(--ui-soft, #eef4eb); border-radius: 10px; font-size: 14px; line-height: 1.7; }
.cooperation-muted, .cooperation-finished { display: block; margin-top: 12px; font-size: 13px; color: #78816c; line-height: 1.8; }
</style>
