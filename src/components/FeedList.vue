<template>
  <view class="page village-page" :class="[roomClass, { 'feed-page-filtered': showFilters }]">
    <VillageHeader :kind="type" :title="title" :subtitle="subtitle">
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
    <view v-if="showLostFilters" class="lost-filter-panel">
      <view class="filter-label">物品分类</view>
      <view class="filter-shortcuts">
        <button
          v-for="option in lostCategoryOptions"
          :key="option.value"
          class="filter-chip"
          :class="{ selected: category === option.value }"
          @tap="chooseCategory(option.value)"
        >
          {{ option.label }}
        </button>
      </view>
      <view class="filter-label">招领类型</view>
      <view class="filter-shortcuts">
        <button
          v-for="option in lostKindOptions"
          :key="option.value"
          class="filter-chip"
          :class="{ selected: lostKind === option.value }"
          @tap="chooseLostKind(option.value)"
        >
          {{ option.label }}
        </button>
      </view>
    </view>
    <view class="panel">
      <input
        class="input"
        v-model="keyword"
        placeholder="搜索标题或说明"
        confirm-type="search"
        @confirm="load(true)"
      />
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
        <view class="filter-shortcuts">
          <button
            class="filter-chip"
            :class="{ selected: !category }"
            @tap="chooseCategory('')"
          >
            全部{{ type === 'help' ? '技能' : '类别' }}
          </button>
          <button
            v-for="option in categoryOptions"
            :key="option"
            class="filter-chip"
            :class="{ selected: category === option }"
            @tap="chooseCategory(option)"
          >
            {{ option }}
          </button>
        </view>
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
      <view class="actions">
        <button class="secondary" @tap="load(true)">搜索</button>
        <button class="secondary" @tap="clear">
          {{ showFilters ? '重置筛选' : '清空' }}
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
    <view v-if="showFilters && !loading && !error" class="filter-result">
      已加载 {{ items.length }} 条{{
        type === 'help' ? '技能求助' : '搭子计划'
      }}
    </view>
    <view v-if="error" class="error">{{ error }}</view>
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
.content-switcher {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-top: 14px;
  background: #e9e1ca;
  border-radius: 7px;
}
.lost-filter-panel {
  margin-top: 18px;
  padding: 12px 18px 18px;
  background: #fffbec;
  border: 1px solid #d8cbaa;
  border-radius: 3px 3px 10px 3px;
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
  font-size: 13px;
  color: #727760;
  margin: 12px 0;
}
@media (max-width: 380px) {
  .filter-fields { flex-direction: column; }
  .status-field { width: 100%; }
}
</style>
