<template>
  <view class="contribution-card wx-v" :class="{ 'contribution-embedded': embedded }">
    <view class="contribution-heading wx-v">
      <text v-if="!embedded" class="contribution-title wx-t">互助攒珍珠</text>
      <text v-if="state" class="contribution-balance wx-t">{{ state.pearls }} 颗珍珠</text>
      <button v-if="embedded" class="contribution-details-toggle wx-b" :aria-expanded="detailsExpanded" @tap="detailsExpanded = !detailsExpanded">{{ detailsExpanded ? '收起规则与记录' : '规则与记录' }}</button>
      <button v-if="!embedded || detailsExpanded || error" class="contribution-refresh wx-b" :disabled="loading" @tap="refresh">{{ loading ? '读取中…' : '刷新' }}</button>
    </view>
    <view v-if="error" class="contribution-error wx-v" role="alert">{{ error }}</view>
    <view v-if="!error && state && (!embedded || detailsExpanded)" class="contribution-progress wx-v">
      <text class="wx-t">今日发布奖励 {{ state.daily.publish.awarded }}/{{ state.daily.publish.limit }} 次</text>
      <text class="wx-t">今日互助完成奖励 {{ state.daily.helpCompletion.awarded }}/{{ state.daily.helpCompletion.limit }} 次</text>
    </view>
    <view v-if="!error && !state" class="contribution-copy wx-v">正在读取本账号的奖励记录…</view>
    <view v-if="showActions !== false" class="contribution-actions wx-v">
      <button class="contribution-primary wx-b" @tap="navigate('/pages/content/publish?type=help')">发布求助</button>
      <button class="contribution-secondary wx-b" @tap="navigate('/pages/help/index')">看看谁需要帮助</button>
      <button v-if="!compact" class="contribution-secondary wx-b" @tap="navigate('/pages/content/publish?type=market&marketType=buy')">发布求购</button>
    </view>
    <button v-if="!embedded" class="contribution-details-toggle wx-b" :aria-expanded="detailsExpanded" @tap="detailsExpanded = !detailsExpanded">{{ detailsExpanded ? '收起规则与记录' : '规则与记录' }}</button>
    <view v-if="detailsExpanded" class="contribution-details wx-v">
    <text class="contribution-copy wx-t">把需求说清楚，帮同学解决问题，也能为伙伴攒下新装扮。</text>
    <text v-if="state" class="contribution-rule wx-t">公开发布每篇 {{ state.rules.publish.pearls }} 颗；双方确认解决后，帮助者 {{ state.rules.helpCompletion.helperPearls }} 颗，发布者 {{ state.rules.helpCompletion.authorPearls }} 颗。超出奖励次数仍可发帖和互助。</text>
    <view v-if="state?.recent?.length" class="contribution-history wx-v">
      <text class="contribution-history-title wx-t">最近的校园贡献</text>
      <view v-for="entry in shownHistory" :key="entry.eventId" class="contribution-event wx-v">
        <view class="contribution-event-copy wx-v">
          <text class="wx-t">{{ eventLabel(entry) }}</text>
          <text class="contribution-date wx-t">{{ formatTime(entry.createdAt) }}</text>
        </view>
        <text class="contribution-delta wx-t" :class="{ 'contribution-zero': !entry.delta }">{{ entry.delta > 0 ? '+' + entry.delta + ' 颗' : reasonLabel(entry.reason) }}</text>
      </view>
      <button v-if="state.recent.length > 3" class="contribution-more wx-b" @tap="expanded = !expanded">{{ expanded ? '收起记录' : '查看最近 ' + state.recent.length + ' 条' }}</button>
    </view>
    <text class="contribution-footnote wx-t">珍珠用于兑换装扮。重复内容不重复奖励，双方每天至多获得一次彼此互助的奖励。</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { rewards } from '../services/index.js'
import { session } from '../utils/session.js'
import { errorText } from '../utils/errors.js'
import { formatTime } from '../utils/routes.js'

const props = defineProps({ compact: Boolean, refreshKey: { type: Number, default: 0 }, showActions: { type: Boolean, default: true }, embedded: { type: Boolean, default: false } })
const state = ref(null), error = ref(''), loading = ref(false), expanded = ref(false)
const detailsExpanded = ref(false)
let revision = 0, alive = true
const shownHistory = computed(() => (state.value?.recent || []).slice(0, expanded.value ? 20 : 3))
const sources = { market: '二手 / 求购', help: '求助', plan: '搭子', lost_found: '失物信息' }
function eventLabel(entry) {
  if (entry.kind === 'help_helper') return '帮助同学解决了问题'
  if (entry.kind === 'help_author') return '与帮助者确认问题已解决'
  return '发布了' + (sources[entry.sourceType] || '校园信息')
}
function reasonLabel(reason) {
  return ({ daily_limit: '今日奖励已领满', duplicate_text: '重复内容', pair_limit: '今日双方已获奖', not_public: '非公开发布' })[reason] || '未奖励'
}
async function refresh() {
  const version = ++revision, userId = session.user?.id
  const current = () => alive && version === revision && userId === session.user?.id
  loading.value = true
  error.value = ''
  try {
    const result = await rewards.getState()
    if (current()) state.value = result
  } catch (failure) {
    if (current()) { state.value = null; error.value = errorText(failure) }
  } finally {
    if (current()) loading.value = false
  }
}
function navigate(url) { uni.navigateTo({ url }) }
watch(() => session.user?.id, () => { ++revision; state.value = null; expanded.value = false; detailsExpanded.value = false; refresh() })
watch(() => props.refreshKey, refresh, { immediate: true })
onUnmounted(() => { alive = false; ++revision })
defineExpose({ refresh })
</script>

<style scoped>
.contribution-card { padding: 16px; margin: 14px 0; border: 1px solid var(--ui-line, #d8cbaa); border-radius: 3px 3px 10px 3px; color: var(--ui-ink, #354d3e); background: var(--ui-paper, #fffbec); }
.contribution-embedded { padding: 12px 0 0; margin: 14px 0 0; border: 0; border-top: 1px dashed #d8cbaa; border-radius: 0; background: transparent; }
.contribution-embedded .contribution-balance { flex: 1; font-size: 15px; }
.contribution-heading { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.contribution-refresh, .contribution-details-toggle, .contribution-more, .contribution-primary, .contribution-secondary { min-height: 44px; }
.contribution-title { font-size: 16px; font-weight: 650; flex: 1; }
.contribution-balance { font-size: 17px; font-weight: 700; color: var(--ui-primary, #3e654f); }
.contribution-refresh { margin: 0; padding: 4px 10px; font-size: 12px; color: #506348; background: transparent; line-height: 1.7; }
.contribution-copy, .contribution-footnote { display: block; margin-top: 8px; font-size: 13px; line-height: 1.7; color: #6d7864; }
.contribution-progress { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 13px; }
.contribution-rule { display: block; margin-top: 8px; font-size: 12px; color: #6d7864; line-height: 1.7; }
.contribution-details-toggle { padding: 6px 0; margin-top: 6px; background: transparent; color: #55725b; font-size: 12px; }
.contribution-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.contribution-primary, .contribution-secondary { margin: 0; padding: 8px 12px; font-size: 13px; line-height: 1.6; }
.contribution-primary { background: var(--ui-primary, #3e654f); color: #fffdf0; }
.contribution-secondary { background: #e2e9d3; color: #3e5b43; }
.contribution-history { border-top: 1px solid #d9dfcc; margin-top: 16px; padding-top: 12px; }
.contribution-history-title { font-size: 13px; font-weight: 650; }
.contribution-event { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; font-size: 13px; }
.contribution-event-copy { display: flex; flex-direction: column; gap: 3px; }
.contribution-date { font-size: 11px; color: #7a826e; }
.contribution-delta { color: #436e4c; flex-shrink: 0; }
.contribution-zero { color: #858774; font-size: 11px; }
.contribution-more { margin-top: 12px; padding: 5px 10px; background: transparent; color: #567144; font-size: 12px; }
.contribution-error { margin-top: 10px; font-size: 13px; color: #a4553d; }
</style>
