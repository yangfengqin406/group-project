<template>
  <view class="page village-page" :class="type === 'market' ? 'village-market' : type === 'lost_found' ? 'village-lost' : 'village-partner'">
    <VillageHeader :kind="type" :title="'发布' + contentNames[type]" subtitle="把想分享的事写下来，贴到小屋的布告板。" compact />
    <DemoNotice />
    <view class="panel">
      <text class="label">标题</text>
      <input
        class="input"
        v-model="form.title"
        maxlength="60"
        placeholder="把你的需求说清楚"
      />
      <text class="label">详细说明</text>
      <textarea
        class="input textarea"
        v-model="form.body"
        maxlength="2000"
        placeholder="补充要求、约定和注意事项"
      />
      <template v-if="type === 'lost_found'">
        <text class="label">发布类型</text>
        <view class="choice-grid two-columns">
          <button
            v-for="option in lostKindOptions"
            :key="option.value"
            class="choice-button"
            :class="{ selected: form.lostKind === option.value }"
            @tap="form.lostKind = option.value"
          >
            {{ option.label }}
          </button>
        </view>
        <text class="label">物品分类</text>
        <view class="choice-grid three-columns">
          <button
            v-for="option in lostCategoryOptions"
            :key="option.value"
            class="choice-button"
            :class="{ selected: form.category === option.value }"
            @tap="form.category = option.value"
          >
            {{ option.label }}
          </button>
        </view>
      </template>
      <template v-else>
        <text class="label">类别 / 技能</text>
        <input
          class="input"
          v-model="form.category"
          placeholder="如电影、摄影、生活用品"
        />
      </template>
      <text class="label">地点</text>
      <input class="input" v-model="form.location" placeholder="具体地点" />
      <template v-if="type === 'plan'">
        <text class="label">活动日期（北京时间）</text>
        <picker mode="date" :value="date" @change="date = $event.detail.value">
          <view class="input">{{ date || '选择日期' }}</view>
        </picker>
        <text class="label">开始 / 结束时间</text>
        <view class="row time-fields">
          <picker
            mode="time"
            :value="startTime"
            @change="startTime = $event.detail.value"
          >
            <view class="input">{{ startTime }}</view>
          </picker>
          <picker
            mode="time"
            :value="endTime"
            @change="endTime = $event.detail.value"
          >
            <view class="input">{{ endTime }}</view>
          </picker>
        </view>
        <text class="label">总人数（含你自己）</text>
        <input class="input" v-model="capacity" type="number" />
      </template>
      <template v-if="type === 'market'">
        <text class="label">发布类型</text>
        <view class="content-switcher">
          <button
            class="content-tab"
            :class="{ selected: marketType === 'sell' }"
            @tap="setMarketType('sell')"
          >
            闲置出售
          </button>
          <button
            class="content-tab"
            :class="{ selected: marketType === 'buy' }"
            @tap="setMarketType('buy')"
          >
            求购
          </button>
        </view>
        <text class="label">类别</text>
        <input
          class="input"
          v-model="form.category"
          placeholder="如教材、生活用品、数码"
        />
        <template v-if="marketType === 'sell'">
          <text class="label">价格（元）</text>
          <input
            class="input"
            v-model="price"
            type="digit"
            placeholder="如 35.00"
          />
          <text class="label">成色</text>
          <input
            class="input"
            v-model="form.condition"
            placeholder="如 九成新"
          />
          <text class="label">交接校区</text>
          <input
            class="input"
            v-model="form.handoverCampus"
            placeholder="如 主校区图书馆"
          />
          <view class="appraisal-box">
            <button
              class="secondary appraisal-btn"
              :disabled="!imageIds.length || appraising"
              @tap="estimate"
            >
              {{ appraising ? '正在估价…' : '上传照片估价' }}
            </button>
            <view v-if="appraisal" class="appraisal-result">
              <view class="appraisal-range">
                参考估价：¥{{ (appraisal.minCents / 100).toFixed(2) }} ～
                ¥{{ (appraisal.maxCents / 100).toFixed(2) }}
              </view>
              <view class="muted appraisal-note">{{ appraisal.note }}</view>
              <view class="muted">
                依据：{{ appraisal.basis.category }} · {{ appraisal.basis.condition }}
                （{{ appraisal.basis.rule }}）
              </view>
              <button class="secondary small" @tap="useEstimatePrice">
                用参考区间中位价填入
              </button>
            </view>
          </view>
        </template>
        <template v-else>
          <text class="label">预算（元）</text>
          <input
            class="input"
            v-model="budget"
            type="digit"
            placeholder="如 50.00"
          />
          <text class="label">关键词</text>
          <input
            class="input"
            v-model="form.keywords"
            placeholder="如 高等数学、同济七版"
          />
        </template>
      </template>
      <text class="label">
        图片{{
          type === 'lost_found' ? '（必传，最多 3 张）' : '（最多 3 张）'
        }}
      </text>
      <view class="actions">
        <image
          v-for="(image, index) in type === 'market' ? previews : form.images"
          :key="index"
          :src="image"
          mode="aspectFill"
          class="thumb"
          @tap="removeImage(index)"
        />
        <button class="secondary" @tap="chooseImages">添加图片</button>
      </view>
      <view class="muted">
        演示图片只在本机预览；点图片移除。真实模式待接入公共上传服务。
      </view>
      <view v-if="error" class="error">{{ error }}</view>
      <view class="actions">
        <button class="primary" :disabled="saving" @tap="save">
          {{ saving ? '正在保存…' : '保存发布' }}
        </button>
      </view>
    </view>
  </view>
</template>
<script setup>
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import DemoNotice from '../../components/DemoNotice.vue'
import VillageHeader from '../../components/village/VillageHeader.vue'
import * as api from '../../services/index.js'
import {
  contentNames,
  contentTypes,
  contentUrl,
  localToIso
} from '../../utils/routes.js'
import { errorText } from '../../utils/errors.js'
import { config } from '../../config/index.js'
const type = ref('plan'),
  form = reactive({
    title: '',
    body: '',
    category: '',
    lostKind: 'lost',
    location: '',
    images: [],
    condition: '',
    handoverCampus: '',
    keywords: ''
  }),
  date = ref(''),
  startTime = ref('09:00'),
  endTime = ref('12:00'),
  capacity = ref('2'),
  price = ref(''),
  budget = ref(''),
  marketType = ref('sell'),
  previews = ref([]),
  imageIds = ref([]),
  error = ref(''),
  saving = ref(false),
  appraisal = ref(null),
  appraising = ref(false)
const lostKindOptions = [
  { label: '丢失物品', value: 'lost' },
  { label: '拾到物品', value: 'found' }
]
function setMarketType(value) {
  marketType.value = value
  appraisal.value = null
}
const lostCategoryOptions = [
  { label: '卡片', value: 'card' },
  { label: '钥匙', value: 'key' },
  { label: '杂物', value: 'misc' }
]
onLoad((options) => {
  if (contentTypes.includes(options.type)) type.value = options.type
  date.value = new Date(Date.now() + 86400000 + 8 * 3600000)
    .toISOString()
    .slice(0, 10)
})
function chooseImages() {
  if (type.value !== 'market' && config.apiMode !== 'mock') {
    error.value = '请先接入真实公共上传服务，不能提交本机临时图片'
    return
  }
  const count =
    type.value === 'market' ? imageIds.value.length : form.images.length
  if (count >= 3) return
  uni.chooseImage({
    count: 3 - count,
    sizeType: ['compressed'],
    success: async (r) => {
      if (type.value === 'market') {
        for (const path of r.tempFilePaths) {
          try {
            const result = await api.upload.create({
              usage: 'content',
              data: path
            })
            imageIds.value.push(result.imageId)
            previews.value.push(result.url)
          } catch (e) {
            error.value = errorText(e)
          }
        }
      } else {
        form.images.push(...r.tempFilePaths)
      }
    }
  })
}
function removeImage(index) {
  if (type.value === 'market') {
    imageIds.value.splice(index, 1)
    previews.value.splice(index, 1)
  } else {
    form.images.splice(index, 1)
  }
}
async function estimate() {
  if (!imageIds.value.length) return
  appraising.value = true
  error.value = ''
  try {
    appraisal.value = await api.appraisal.estimate({
      imageId: imageIds.value[0],
      category: form.category.trim(),
      condition: form.condition.trim()
    })
  } catch (e) {
    error.value = errorText(e)
  } finally {
    appraising.value = false
  }
}
function useEstimatePrice() {
  if (!appraisal.value) return
  const mid = (appraisal.value.minCents + appraisal.value.maxCents) / 2 / 100
  price.value = mid.toFixed(2)
}
async function save() {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    const params = { ...form, images: [...form.images] }
    if (!form.category.trim()) throw new Error('请填写类别或技能')
    if (type.value === 'lost_found' && !form.images.length)
      throw new Error('请至少添加一张物品照片')
    if (['plan', 'help'].includes(type.value))
      params.category = form.category.trim()
    if (type.value === 'plan')
      Object.assign(params, {
        startAt: localToIso(date.value, startTime.value),
        endAt: localToIso(date.value, endTime.value),
        capacity: Number(capacity.value)
      })
    if (type.value === 'market') {
      params.marketType = marketType.value
      params.category = form.category.trim()
      params.imageIds = [...imageIds.value]
      if (marketType.value === 'sell') {
        if (!/^\d+(\.\d{1,2})?$/.test(price.value))
          throw new Error('请填写最多两位小数的非负价格')
        params.priceCents = Math.round(Number(price.value) * 100)
        params.condition = form.condition.trim()
        params.handoverCampus = form.handoverCampus.trim()
        if (appraisal.value) params.appraisal = appraisal.value
      } else {
        if (!/^\d+(\.\d{1,2})?$/.test(budget.value))
          throw new Error('请填写最多两位小数的非负预算')
        params.budgetCents = Math.round(Number(budget.value) * 100)
        params.keywords = form.keywords.trim()
      }
    }
    const service = api[type.value === 'lost_found' ? 'lostFound' : type.value]
    const item = await service.create(params)
    uni.redirectTo({ url: contentUrl(item.type, item.id) })
  } catch (e) {
    error.value = errorText(e)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.choice-grid {
  display: grid;
  gap: 8px;
}
.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.three-columns {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.choice-button {
  min-height: 44px;
  background: #eee9d7;
  color: #626a56;
  border: 1px solid #ddd1b3;
}
.choice-button.selected {
  background: var(--room-tint);
  border-color: var(--room-accent);
  color: #354d3e;
  font-weight: 650;
}
.time-fields > picker { flex: 1; min-width: 0; }
.appraisal-box { margin-top: 10px; }
.appraisal-result {
  margin-top: 12px;
  padding: 12px;
  background: #f6f1e3;
  border: 1px dashed #ddd1b3;
  border-radius: 8px;
}
.appraisal-range { font-size: 16px; font-weight: 650; color: #354d3e; }
.appraisal-note { color: #8a6d3b; margin: 6px 0; }
.small { font-size: 13px; padding: 6px 12px; margin-top: 8px; }
</style>
