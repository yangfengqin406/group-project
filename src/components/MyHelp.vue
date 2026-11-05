<template>
  <view class="my-help" :class="embedded ? 'my-help-embedded' : 'panel'">
    <view class="row my-help-heading">
      <view class="section-title">我的互助</view>
      <text v-if="embedded" class="muted my-help-summary">{{ summary }}</text>
      <button v-if="embedded" class="secondary small my-help-toggle" :aria-expanded="panelExpanded" @tap="togglePanel">{{ panelExpanded ? '收起' : '查看' }}</button>
      <button v-if="!embedded || panelExpanded || error" class="my-help-refresh small" :disabled="loading" @tap="load()">刷新</button>
    </view>
    <view v-if="error" class="error" role="alert">{{ error }}</view>
    <view v-if="!embedded || panelExpanded">
    <view class="my-help-tabs">
      <button v-for="tab in tabs" :key="tab.value" class="my-help-tab" :class="{ selected: scope === tab.value }" :aria-pressed="scope === tab.value" @tap="scope = tab.value">{{ tab.label }}</button>
    </view>
    <view v-if="loading && !items.length" class="muted">正在整理互助进展…</view>
    <view v-else-if="!items.length && !error" class="muted">{{ scope === 'todo' ? '暂无需要你处理的互助。发过或申请过的求助，可以在另外两栏找回。' : scope === 'posted' ? '还没有发出求助，需要时可以把问题写下来。' : '还没有申请帮忙，去看看同学们的求助吧。' }}</view>
    <view v-for="entry in items" :key="entry.helpId" class="my-help-entry">
      <view class="row">
        <text class="tag">{{ entry.role === 'owner' ? '我的求助' : '我来帮忙' }}</text>
        <text class="muted">{{ progressLabel(entry) }}</text>
      </view>
      <view class="body">{{ entry.help?.title || '原求助已不可访问' }}</view>
      <view v-if="entry.availability !== 'available'" class="muted">原帖状态已变化，仅保留你的参与记录。</view>
      <view v-else class="row">
        <text class="muted">{{ entry.role === 'owner' && entry.pendingCount ? entry.pendingCount + ' 份申请待选择' : entry.role === 'helper' && entry.application?.status === 'pending' ? '已申请，等待发布者选择' : formatTime(entry.updatedAt) }}</text>
        <button class="small" :class="entry.actionRequired ? 'primary' : 'secondary'" :disabled="loading" @tap="open(entry)">{{ entry.actionRequired ? entry.actionLabel : '查看进展' }}</button>
      </view>
    </view>
    <button v-if="cursor" class="secondary" :disabled="loading" @tap="load(false)">查看更多互助</button>
    <view class="actions">
      <button :class="hasTodoAction ? 'secondary' : 'primary'" @tap="navigate('/pages/content/publish?type=help')">发布求助</button>
      <button class="secondary" @tap="navigate('/pages/help/index')">看看谁需要帮助</button>
    </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { help } from '../services/index.js'
import { session } from '../utils/session.js'
import { contentUrl, formatTime } from '../utils/routes.js'
import { errorText } from '../utils/errors.js'
import { getHelpProgressLabel } from '../domain/help/brief.js'

const props = defineProps({ refreshKey: { type: Number, default: 0 }, active: { type: Boolean, default: true }, embedded: { type: Boolean, default: false } })
const scope = ref('todo'), items = ref([]), cursor = ref(null), loading = ref(false), error = ref('')
const panelExpanded = ref(false), todoLoaded = ref(false)
const hasTodoAction = computed(() => scope.value === 'todo' && items.value.some(entry => entry.actionRequired))
const summary = computed(() => loading.value ? '读取中…' : error.value ? '读取未成功' : scope.value === 'todo' && todoLoaded.value
  ? hasTodoAction.value ? '有事项待处理' : '暂无待处理' : '查看互助进展')
const tabs = [{ value: 'todo', label: '待我处理' }, { value: 'posted', label: '我发出的' }, { value: 'applied', label: '我申请的' }]
let revision = 0, alive = true
const progressLabel = entry => entry.availability === 'available' ? getHelpProgressLabel(entry.progress) : '已不可访问'
async function load(reset = true) {
  if (!alive || !props.active || (!reset && (loading.value || !cursor.value))) return
  const version = ++revision, userId = session.user?.id, selectedScope = scope.value
  const current = () => alive && props.active && version === revision && userId === session.user?.id && selectedScope === scope.value
  const nextCursor = reset ? null : cursor.value
  if (reset && selectedScope === 'todo') todoLoaded.value = false
  loading.value = true; error.value = ''
  try {
    const result = await help.listMine({ scope: selectedScope, cursor: nextCursor, pageSize: 5 })
    if (!current()) return
    const merged = reset ? result.items : [...items.value, ...result.items]
    items.value = merged.filter((entry, index) => merged.findIndex(other => other.helpId === entry.helpId) === index)
    cursor.value = result.nextCursor
    if (selectedScope === 'todo') todoLoaded.value = true
  } catch (failure) {
    if (current()) { error.value = errorText(failure); if (reset) { items.value = []; cursor.value = null } }
  } finally { if (current()) loading.value = false }
}
function navigate(url) { uni.navigateTo({ url }) }
function togglePanel() {
  panelExpanded.value = !panelExpanded.value
  if (!panelExpanded.value) {
    if (scope.value !== 'todo') scope.value = 'todo'
    else load()
  }
}
function open(entry) { if (!loading.value && props.active && entry.availability === 'available' && entry.help?.id === entry.helpId) navigate(contentUrl('help', entry.helpId)) }
watch([() => session.user?.id, scope, () => props.refreshKey, () => props.active], ([userId], previous) => {
  const resetScope = props.embedded && (!previous || userId !== previous[0] || !props.active) && scope.value !== 'todo'
  if (!previous || userId !== previous[0] || !props.active) panelExpanded.value = false
  ++revision; items.value = []; cursor.value = null; error.value = ''; loading.value = false
  todoLoaded.value = false
  if (resetScope) scope.value = 'todo'
  else if (props.active) load()
}, { immediate: true })
onUnmounted(() => { alive = false; ++revision })
</script>

<style scoped>
.my-help .section-title { margin-top: 0; }
.my-help-embedded { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #d8cbaa; }
.my-help-embedded .section-title { font-size: 15px; }
.my-help-summary { flex: 1; min-width: 0; }
.my-help-heading { flex-wrap: wrap; }
.my-help-refresh { padding: 8px 10px; background: transparent; color: var(--ui-primary, #3e654f); font-size: 13px; }
.my-help-tabs { display: flex; gap: 4px; padding: 4px; margin: 14px 0; border-radius: 7px; background: var(--ui-soft, #eee9d7); }
.my-help-tab { flex: 1; min-width: 0; padding: 8px 4px; color: var(--ui-muted, #727760); background: transparent; font-size: 13px; }
.my-help-tab.selected { background: var(--ui-paper, #fffbec); color: var(--ui-primary, #3e654f); font-weight: 650; }
.my-help-entry { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--ui-line, #d8cbaa); }
.my-help-entry .body { margin: 8px 0; font-size: 16px; }
.my-help-entry .small { margin: 0; }
</style>
