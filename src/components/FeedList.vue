<template>
  <view class="page village-page feed-page" :class="[roomClass, { 'feed-page-filtered': showFilters }]">
    <VillageHeader :kind="type" :title="title" :subtitle="subtitle" compact>
      <button class="primary" @tap="publish">发布</button>
    </VillageHeader>
    <DemoNotice />
    <view v-if="marketTypeOptions.length" class="content-switcher">
      <button
        v-for="opt in marketTypeOptions"
        :key="opt.value"
        class="content-tab"
        :class="{ selected: marketType === opt.value }"
        @tap="setMarketType(opt.value)"
      >
        {{ opt.label }}
      </button>
    </view>
    <view v-if="showFilters" class="content-switcher">
      <button
        class="content-tab"
        :class="{ selected: type === 'plan' }"
        :disabled="type === 'plan'"
        @tap="switchContent('plan')"
      >
        找搭子
      </button>
      <button
        class="content-tab"
        :class="{ selected: type === 'help' }"
        :disabled="type === 'help'"
        @tap="switchContent('help')"
      >
        技能求助
      </button>
    </view>
    <view class="feed-search">
      <input
        class="input"
        v-model="keyword"
        placeholder="搜索标题或说明"
        aria-label="搜索标题或说明"
        confirm-type="search"
        @confirm="load(true)"
      />
      <button class="secondary search-submit" @tap="load(true)">搜索</button>
      <button
        class="secondary filter-toggle"
        :class="{ selected: filtersExpanded || extraFilterCount }"
        :aria-expanded="filtersExpanded"
        aria-controls="feed-extra-filters"
        @tap="filtersExpanded = !filtersExpanded"
      >
        {{ filtersExpanded ? '收起' : '筛选' }}{{ extraFilterCount ? ` ${extraFilterCount}` : '' }}
      </button>
    </view>
    <scroll-view v-if="showFilters || showLostFilters" class="category-strip" scroll-x>
      <view class="filter-shortcuts">
        <button
          v-for="option in quickCategories"
          :key="option.value"
          class="filter-chip"
          :class="{ selected: category === option.value }"
          :aria-pressed="category === option.value"
          @tap="chooseCategory(option.value)"
        >
          {{ option.label }}
        </button>
      </view>
    </scroll-view>
    <view v-if="filtersExpanded" id="feed-extra-filters" class="panel extra-filters">
      <view v-if="showLostFilters" class="lost-kind-filter">
        <view class="filter-label">招领类型</view>
        <view class="filter-shortcuts">
          <button
            v-for="option in lostKindOptions"
            :key="option.value"
            class="filter-chip"
            :class="{ selected: lostKind === option.value }"
            :aria-pressed="lostKind === option.value"
            @tap="chooseLostKind(option.value)"
          >
            {{ option.label }}
          </button>
        </view>
      </view>
      <view v-if="campusOptions.length" class="filter-fields">
        <view class="category-field">
          <text class="filter-label">交接校区</text>
          <picker
            :range="campusOptions"
            range-key="label"
            :value="campusIndex"
            @change="chooseCampus"
          >
            <view class="input status-value">
              {{ campusOptions[campusIndex]?.label || '全部校区' }}
              <text>⌄</text>
            </view>
          </picker>
        </view>
      </view>
      <template v-if="showFilters">
        <view class="filter-fields">
          <view class="category-field">
            <text class="filter-label">
              {{ type === 'help' ? '所需技能' : '活动类别' }}
            </text>
            <input
              class="input"
              v-model="category"
              placeholder="也可输入完整类别"
              confirm-type="search"
              @confirm="load(true)"
            />
          </view>
          <view class="status-field">
            <text class="filter-label">发布状态</text>
            <picker
              :range="statusOptions"
              range-key="label"
              :value="statusIndex"
              @change="chooseStatus"
            >
              <view class="input status-value">
                {{ statusOptions[statusIndex]?.label || '全部状态' }}
                <text>⌄</text>
              </view>
            </picker>
          </view>
        </view>
      </template>
      <view v-if="!showFilters && !showLostFilters && !campusOptions.length" class="muted">
        输入标题或说明中的关键词，找到想看的内容。
      </view>
      <view class="actions">
        <button class="primary" @tap="applyAndCollapse">应用筛选</button>
        <button class="secondary" @tap="clear">
          重置筛选
        </button>
        <button
          v-if="type === 'plan' && !showFilters"
          class="secondary"
          @tap="openHelp"
        >
          技能互助 →
        </button>
      </view>
    </view>
    <view v-if="appliedSummary" class="applied-summary">当前筛选：{{ appliedSummary }}</view>
    <view v-if="!loading && !error" class="filter-result">
      <text>已加载 {{ items.length }} 条{{ contentLabel }}</text>
      <button v-if="hasFilters" class="reset-link" @tap="clear">清除筛选</button>
    </view>
    <view v-if="error" class="error">
      <text>{{ error }}</text>
      <button class="secondary" :disabled="loading" @tap="load(true)">重新读取</button>
    </view>
    <view v-if="loading" class="muted">正在读取…</view>
    <ContentCard v-for="item in items" :key="item.id" :item="item" />
    <EmptyState
      v-if="!loading && !error && !items.length"
      :description="
        showFilters || showLostFilters
          ? '换个类别、状态或关键词试试，也可以发布一条新内容。'
          : undefined
      "
    />
    <button
      v-if="cursor"
      class="secondary"
      :disabled="loading"
      @tap="load(false)"
    >
      加载更多
    </button>
  </view>
</template>
<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import * as api from '../services/index.js'
import { errorText } from '../utils/errors.js'
import DemoNotice from './DemoNotice.vue'
import ContentCard from './ContentCard.vue'
import EmptyState from './EmptyState.vue'
import VillageHeader from './village/VillageHeader.vue'
const props = defineProps({
  type: { required: true },
  title: { required: true },
  subtitle: { default: '' },
  showFilters: { type: Boolean, default: false },
  showLostFilters: { type: Boolean, default: false },
  categoryOptions: { type: Array, default: () => [] },
  statusOptions: { type: Array, default: () => [] },
  marketTypeOptions: { type: Array, default: () => [] },
  campusOptions: { type: Array, default: () => [] }
})
const roomClass = computed(() =>
  `village-${props.type === 'lost_found' ? 'lost' : props.type === 'market' ? 'market' : 'partner'}`
)
const filtersExpanded = ref(false)
const items = ref([]),
  keyword = ref(''),
  error = ref(''),
  loading = ref(false),
  cursor = ref(null),
  category = ref(''),
  status = ref(''),
  marketType = ref(''),
  campusId = ref(''),
  lostKind = ref('')
const lostCategoryOptions = [
  { label: '全部', value: '' },
  { label: '卡片', value: 'card' },
  { label: '钥匙', value: 'key' },
  { label: '杂物', value: 'misc' }
]
const lostKindOptions = [
  { label: '全部', value: '' },
  { label: '我丢失的', value: 'lost' },
  { label: '我拾到的', value: 'found' }
]
const quickCategories = computed(() =>
  props.showLostFilters ? lostCategoryOptions : [
    { label: `全部${props.type === 'help' ? '技能' : '类别'}`, value: '' },
    ...props.categoryOptions.map((value) => ({ label: value, value }))
  ]
)
const contentLabel = computed(() => ({
  plan: '搭子计划', help: '技能求助', market: '二手信息', lost_found: '失物信息'
})[props.type] || '内容')
const extraFilterCount = computed(() =>
  Number(Boolean(status.value)) + Number(Boolean(campusId.value)) + Number(Boolean(lostKind.value)) +
  Number(Boolean(category.value && !props.categoryOptions.includes(category.value) && !props.showLostFilters))
)
const hasFilters = computed(() => Boolean(
  keyword.value.trim() || category.value || status.value || lostKind.value || campusId.value || marketType.value
))
const appliedSummary = ref('')
const statusIndex = computed(() =>
  Math.max(
    0,
    props.statusOptions.findIndex((option) => option.value === status.value)
  )
)
const campusIndex = computed(() =>
  Math.max(
    0,
    props.campusOptions.findIndex((option) => option.value === campusId.value)
  )
)
let revision = 0
let appliedFilters = {}
const service = () =>
  api[props.type === 'lost_found' ? 'lostFound' : props.type]
async function load(reset) {
  if (!reset && loading.value) return
  const current = ++revision
  loading.value = true
  error.value = ''
  if (reset) {
    items.value = []
    cursor.value = null
    appliedFilters = {
      keyword: keyword.value.trim(),
      ...(props.type === 'market'
        ? {
            marketType: marketType.value || undefined,
            campusId: campusId.value || undefined
          }
        : {}),
      ...(props.showFilters || props.showLostFilters
        ? {
            category: category.value.trim(),
            status: status.value,
            ...(props.showLostFilters ? { lostKind: lostKind.value } : {})
          }
        : {})
    }
    appliedSummary.value = [
      appliedFilters.keyword ? `“${appliedFilters.keyword}”` : '',
      props.showLostFilters ? lostCategoryOptions.find((option) => option.value === appliedFilters.category)?.label : appliedFilters.category,
      props.statusOptions.find((option) => option.value && option.value === appliedFilters.status)?.label,
      lostKindOptions.find((option) => option.value && option.value === appliedFilters.lostKind)?.label,
      props.campusOptions.find((option) => option.value && option.value === appliedFilters.campusId)?.label
    ].filter(Boolean).filter((label) => label !== '全部').join('、')
  }
  try {
    const page = await service().list({
      ...appliedFilters,
      cursor: reset ? null : cursor.value
    })
    if (current !== revision) return
    items.value = reset ? page.items : [...items.value, ...page.items]
    cursor.value = page.nextCursor
  } catch (e) {
    if (current === revision) error.value = errorText(e)
  } finally {
    if (current === revision) loading.value = false
  }
}
function publish() {
  uni.navigateTo({ url: `/pages/content/publish?type=${props.type}` })
}
function clear() {
  keyword.value = ''
  category.value = ''
  lostKind.value = ''
  status.value = ''
  marketType.value = ''
  campusId.value = ''
  load(true)
}
function applyAndCollapse() {
  filtersExpanded.value = false
  load(true)
}
function chooseCategory(value) {
  category.value = value
  load(true)
}
function setMarketType(value) {
  marketType.value = value
  load(true)
}
function chooseCampus(event) {
  campusId.value = props.campusOptions[Number(event.detail.value)]?.value || ''
  load(true)
}
function chooseLostKind(value) {
  lostKind.value = value
  load(true)
}
function chooseStatus(event) {
  status.value = props.statusOptions[Number(event.detail.value)]?.value || ''
  load(true)
}
function switchContent(type) {
  uni.redirectTo({
    url: type === 'help' ? '/pages/help/index' : '/pages/partner/index'
  })
}
function openHelp() {
  uni.navigateTo({ url: '/pages/help/index' })
}
onShow(() => load(true))
onUnmounted(() => {
  revision++
})
</script>

<style scoped>
.feed-page :deep(.demo-notice) {
  margin: 10px 0;
  padding: 7px 10px;
  font-size: 11px;
}
.content-switcher {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-top: 10px;
  background: #e9e1ca;
  border-radius: 7px;
}
.feed-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
}
.feed-search .input { flex: 1; min-width: 0; height: 44px; min-height: 44px; font-size: 14px; }
.feed-search .secondary { flex: none; min-height: 44px; padding: 8px 10px; font-size: 13px; }
.feed-search .filter-toggle.selected { color: #354d3e; border-color: var(--room-accent); background: var(--room-tint); }
.category-strip { width: 100%; margin-top: 8px; white-space: nowrap; }
.category-strip .filter-shortcuts { display: inline-flex; flex-wrap: nowrap; gap: 5px; margin: 0; }
.category-strip .filter-chip { display: inline-flex; flex: none; padding: 8px 10px; font-size: 13px; }
.feed-page .extra-filters { margin: 10px 0; padding: 12px; }
.extra-filters .filter-fields { margin-top: 0; }
.extra-filters .filter-label { padding-top: 0; }
.extra-filters .actions button { flex: 1; }
.applied-summary {
  margin-top: 8px;
  font-size: 12px;
  color: #626a56;
  overflow-wrap: anywhere;
}
.content-switcher button {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 44px;
  background: transparent;
  color: #696b58;
  font-size: 14px;
  line-height: 1.4;
}
.content-switcher button.selected {
  background: #fffbec;
  color: #354d3e;
  font-weight: 650;
}
.filter-shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.filter-shortcuts button {
  display: flex;
  align-items: center;
  min-height: 44px;
  font-size: 14px;
  padding: 8px 14px;
  background: #eee9d7;
  color: #626a56;
  border: 1px solid #ddd1b3;
  line-height: 1.4;
}
.content-tab::after,
.filter-chip::after {
  border: 0;
}
.feed-page-filtered .primary,
.feed-page-filtered .secondary {
  font-size: 14px;
  line-height: 1.5;
  border-radius: 7px;
}
.feed-page-filtered .primary::after,
.feed-page-filtered .secondary::after {
  border: 0;
}
.filter-shortcuts button.selected {
  background: var(--room-tint);
  border-color: var(--room-accent);
  color: #354d3e;
}
.filter-fields {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}
.category-field {
  flex: 1;
  min-width: 0;
}
.status-field {
  width: 38%;
  min-width: 0;
}
.filter-label {
  display: block;
  font-size: 13px;
  color: #727760;
  padding: 10px 0 6px;
}
.feed-page-filtered .input {
  min-height: 44px;
}
.status-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  font-size: 14px;
}
.feed-page-filtered .actions button {
  flex: 1;
  min-height: 44px;
}
.filter-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 26px;
  font-size: 13px;
  color: #727760;
  margin: 8px 0 0;
}
.filter-result .reset-link {
  min-height: 44px;
  padding: 8px 4px;
  background: transparent;
  color: #3e654f;
  font-size: 12px;
}
.feed-page .error { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.feed-page .error button { flex: none; }
@media (max-width: 360px) {
  .feed-search .secondary { padding: 8px; }
}
</style>
