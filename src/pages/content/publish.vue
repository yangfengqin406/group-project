<template>
  <view class="page village-page" :class="type === 'market' ? 'village-market' : type === 'lost_found' ? 'village-lost' : 'village-partner'">
    <VillageHeader :kind="type" :title="(editId ? '编辑' : '发布') + contentNames[type]" :subtitle="editId ? '调整安排，给同行的伙伴留一张新纸条。' : '把想分享的事写下来，贴到小屋的布告板。'" compact />
    <DemoNotice />
    <view v-if="loading" class="panel muted">正在取回你的计划…</view>
    <view v-if="error" class="error" role="alert">{{ error }}</view>
    <button v-if="editId && !loading && !sourcePlan" class="secondary" @tap="loadPlan">重新读取计划</button>
    <view v-if="ready" class="panel">
      <view v-if="!editId" class="publish-contribution-note">
        把需求说清楚，让同学更容易回应。每天前三篇公开新帖各得5颗珍珠，重复内容不重复奖励。
      </view>
      <view v-if="editId" class="edit-note">
        当前已有 {{ sourcePlan.memberIds.length }} 位成员，容量不能少于现有人数。
        改变类别、时间或人数后，不再符合条件的待处理邀请会失效。
      </view>
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
      <template v-else-if="type === 'plan'">
        <text class="label">活动类别</text>
        <view class="choice-grid three-columns">
          <button
            v-for="option in planCategories"
            :key="option"
            class="choice-button"
            :class="{ selected: form.category === option }"
            @tap="form.category = option"
          >
            {{ option }}
          </button>
        </view>
      </template>
      <template v-else-if="type !== 'market'">
        <text class="label">类别 / 技能</text>
        <input
          class="input"
          v-model="form.category"
          placeholder="如摄影、Python、高数辅导"
        />
      </template>
      <text class="label">地点</text>
      <input class="input" v-model="form.location" placeholder="具体地点" />
      <template v-if="type === 'help'">
        <text class="label">期望时间（选填）</text>
        <input class="input" v-model="helpBrief.preferredTime" maxlength="80" placeholder="如周六下午、时间可商量" />
        <text class="label">预计用时（分钟，选填）</text>
        <input class="input" v-model="helpBrief.estimatedMinutes" type="number" placeholder="1～480，可留空" />
        <text class="label">沟通方式（选填）</text>
        <view class="choice-grid three-columns">
          <button v-for="option in meetingOptions" :key="option.value" class="choice-button"
            :class="{ selected: helpBrief.meetingMode === option.value }"
            :aria-pressed="helpBrief.meetingMode === option.value" @tap="helpBrief.meetingMode = option.value">
            {{ option.label }}
          </button>
        </view>
      </template>
      <template v-if="type === 'plan'">
        <text class="label">开始 / 结束日期（北京时间）</text>
        <view class="row time-fields">
          <picker mode="date" :value="date" @change="setStartDate($event.detail.value)">
            <view class="input">{{ date || '开始日期' }}</view>
          </picker>
          <picker mode="date" :value="endDate" @change="endDate = $event.detail.value">
            <view class="input">{{ endDate || '结束日期' }}</view>
          </picker>
        </view>
        <text class="label">开始 / 结束时间（北京时间）</text>
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
              :disabled="!imageIds.length || appraising || uploading || saving || !ready"
              @tap="estimate"
            >
              {{ appraising ? '正在估价…' : '查看参考估价' }}
            </button>
            <view class="muted">按类别和成色给出规则参考区间，不识别照片内容；价格可自行填写。</view>
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
        <ServiceImage
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
        {{ config.apiMode === 'mock' ? '演示图片只在本机预览。' : '图片上传后保存到校园服务，支持 JPG、PNG、WebP，每张最多 5 MB。' }}点图片移除。
      </view>
      <view class="actions">
        <button class="primary" :disabled="saving || uploading" @tap="save">
          {{ saving ? '正在保存…' : uploading ? '正在处理图片…' : editId ? '保存修改' : '保存发布' }}
        </button>
      </view>
    </view>
  </view>
</template>
<script setup>
import ServiceImage from '../../components/ServiceImage.vue'
import { computed, reactive, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
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
import { planCategories } from '../../constants/plan.js'
import { config } from '../../config/index.js'
import { session } from '../../utils/session.js'
import { useUnsavedChanges } from '../../utils/use-unsaved-changes.js'
import { normalizeHelpBrief } from '../../domain/help/brief.js'
const helpBrief = reactive({ preferredTime: '', estimatedMinutes: '', meetingMode: 'flexible' })
const meetingOptions = [
  { value: 'flexible', label: '可商量' },
  { value: 'online', label: '线上沟通' },
  { value: 'offline', label: '线下见面' }
]
const type = ref('plan'),
  editId = ref(''),
  sourcePlan = ref(null),
  loading = ref(false),
  initialized = ref(false),
  uploading = ref(false),
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
  endDate = ref(''),
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
const ready = computed(() => initialized.value && !loading.value && (!editId.value || !!sourcePlan.value))
const baseline = ref('')
const snapshot = () => JSON.stringify({
  ...form, date: date.value, endDate: endDate.value, startTime: startTime.value,
  endTime: endTime.value, capacity: capacity.value, price: price.value,
  budget: budget.value, marketType: marketType.value, imageIds: imageIds.value
  , appraisal: appraisal.value, ...(type.value === 'help' ? { helpBrief: { ...helpBrief } } : {})
})
const dirty = computed(() => !!baseline.value && snapshot() !== baseline.value)
useUnsavedChanges(dirty)
let alive = true
let loadVersion = 0
let editorUserId = null
let appraisalVersion = 0
let appraisalKey = ''
let publishAttempt = null
const estimateKey = () => JSON.stringify([marketType.value, imageIds.value[0], form.category.trim(), form.condition.trim()])
function invalidateAppraisal() {
  ++appraisalVersion
  appraisal.value = null
  appraisalKey = ''
  appraising.value = false
}
watch(estimateKey, invalidateAppraisal)
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
onLoad(async (options) => {
  if (contentTypes.includes(options.type)) type.value = options.type
  if (type.value === 'market' && options.marketType === 'buy') marketType.value = 'buy'
  date.value = new Date(Date.now() + 86400000 + 8 * 3600000)
    .toISOString()
    .slice(0, 10)
  endDate.value = date.value
  if (!session.user) {
    loading.value = true
    try {
      await api.user.getProfile()
      if (!alive) return
    } catch (e) {
      if (alive) error.value = errorText(e)
      return
    } finally {
      loading.value = false
    }
  }
  editorUserId = session.user?.id
  initialized.value = true
  if (options.id) {
    editId.value = options.id
    if (type.value !== 'plan') {
      error.value = '目前仅支持编辑搭子计划，请从相应模块新建内容。'
      return
    }
    await loadPlan()
  } else baseline.value = snapshot()
})
const dateParts = (value) => {
  const local = new Date(Date.parse(value) + 8 * 3600000).toISOString()
  return { date: local.slice(0, 10), time: local.slice(11, 16) }
}
function setStartDate(value) {
  if (endDate.value === date.value) endDate.value = value
  date.value = value
}
async function loadPlan() {
  if (type.value !== 'plan' || !editId.value) return
  const version = ++loadVersion
  const userId = session.user?.id
  loading.value = true
  error.value = ''
  try {
    const plan = await api.plan.get({ id: editId.value })
    if (!alive || version !== loadVersion || userId !== session.user?.id) return
    if (plan.ownerId !== userId) throw new Error('只能编辑自己发布的计划')
    if (!['open', 'full'].includes(plan.status)) throw new Error('这个计划已经结束或取消，不能再编辑')
    sourcePlan.value = plan
    for (const key of ['title', 'body', 'category', 'location']) form[key] = plan[key] || ''
    form.images = [...(plan.images || [])]
    const start = dateParts(plan.startAt)
    const end = dateParts(plan.endAt)
    date.value = start.date
    startTime.value = start.time
    endDate.value = end.date
    endTime.value = end.time
    capacity.value = String(plan.capacity)
    editorUserId = userId
    baseline.value = snapshot()
  } catch (e) {
    if (alive && version === loadVersion && userId === session.user?.id) {
      sourcePlan.value = null
      error.value = errorText(e)
    }
  } finally {
    if (alive && version === loadVersion) loading.value = false
  }
}
watch(() => session.user?.id, (userId) => {
  if (!editorUserId || userId === editorUserId) return
  ++loadVersion
  invalidateAppraisal()
  sourcePlan.value = null
  loading.value = false
  error.value = '登录身份已改变，请返回后重新打开发布页面。'
})
onUnload(() => { alive = false; ++loadVersion; invalidateAppraisal() })
function chooseImages() {
  if (saving.value || uploading.value || !ready.value) return
  const count =
    type.value === 'market' ? imageIds.value.length : form.images.length
  if (count >= 3) return
  uni.chooseImage({
    count: 3 - count,
    sizeType: ['compressed'],
    success: async (r) => {
      if (!alive || editorUserId !== session.user?.id) return
      uploading.value = true
      try {
        if (type.value === 'market') {
          for (const path of r.tempFilePaths) {
            const result = await api.upload.create({
              usage: 'content',
              data: path
            })
            if (!alive || editorUserId !== session.user?.id) return
            imageIds.value.push(result.imageId)
            previews.value.push(result.url)
          }
        } else if (config.apiMode === 'http') {
          for (const path of r.tempFilePaths) {
            const result = await api.upload.create({ usage: 'content', data: path })
            if (!alive || editorUserId !== session.user?.id) return
            form.images.push(result.url)
          }
        } else {
          form.images.push(...r.tempFilePaths)
        }
      } catch (e) {
        if (alive && editorUserId === session.user?.id) error.value = errorText(e)
      } finally {
        uploading.value = false
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
  if (!imageIds.value.length || marketType.value !== 'sell' || type.value !== 'market' ||
    appraising.value || uploading.value || saving.value || !ready.value || editorUserId !== session.user?.id) return
  const version = ++appraisalVersion
  const userId = session.user?.id
  const key = estimateKey()
  const current = () => alive && version === appraisalVersion && key === estimateKey() && userId === session.user?.id
  appraising.value = true
  error.value = ''
  try {
    const result = await api.appraisal.estimate({
      imageId: imageIds.value[0],
      category: form.category.trim(),
      condition: form.condition.trim()
    })
    if (!current()) return
    appraisalKey = key
    appraisal.value = result
  } catch (e) {
    if (current()) error.value = errorText(e)
  } finally {
    if (current()) appraising.value = false
  }
}
function useEstimatePrice() {
  if (!appraisal.value || appraisalKey !== estimateKey() || editorUserId !== session.user?.id) return
  const mid = (appraisal.value.minCents + appraisal.value.maxCents) / 2 / 100
  price.value = mid.toFixed(2)
}
async function save() {
  if (saving.value || uploading.value || !ready.value) return
  if (editorUserId !== session.user?.id) {
    error.value = '登录身份已改变，请返回后重新打开发布页面。'
    return
  }
  const userId = editorUserId
  saving.value = true
  error.value = ''
  try {
    const params = { ...form, images: [...form.images] }
    params.title = form.title.trim()
    params.location = form.location.trim()
    if (params.title.length < 2) throw new Error('标题请写 2～60 个字')
    if (!form.category.trim())
      throw new Error(type.value === 'plan' ? '请选择活动类别' : '请填写类别或技能')
    if (type.value === 'lost_found' && !form.images.length)
      throw new Error('请至少添加一张物品照片')
    if (['plan', 'help'].includes(type.value))
      params.category = form.category.trim()
    if (type.value === 'help') {
      const minutes = String(helpBrief.estimatedMinutes).trim()
      if (minutes && !/^\d+$/.test(minutes)) throw new Error('预计用时请填写1～480的整数分钟，或留空')
      Object.assign(params, normalizeHelpBrief({ ...helpBrief, estimatedMinutes: minutes ? Number(minutes) : null }))
    }
    if (type.value === 'plan') {
      if (!params.location) throw new Error('请填写活动地点，方便同伴赴约')
      const original = sourcePlan.value
      const startAt = original && dateParts(original.startAt).date === date.value &&
        dateParts(original.startAt).time === startTime.value
        ? original.startAt : localToIso(date.value, startTime.value)
      const endAt = original && dateParts(original.endAt).date === endDate.value &&
        dateParts(original.endAt).time === endTime.value
        ? original.endAt : localToIso(endDate.value, endTime.value)
      if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error('结束时间应晚于开始时间')
      if (Date.parse(endAt) <= Date.now()) throw new Error('活动结束时间应在未来')
      if (Date.parse(startAt) <= Date.now() && (!original || startAt !== original.startAt))
        throw new Error('开始时间请选择未来，进行中的计划可保留原时刻')
      const size = Number(capacity.value)
      if (!Number.isInteger(size) || size < 2 || size > 10) throw new Error('总人数请填写 2～10 人')
      if (original && size < original.memberIds.length) throw new Error('容量不能少于现有成员人数')
      Object.assign(params, {
        startAt, endAt, capacity: size
      })
    }
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
        if (appraisal.value && appraisalKey === estimateKey()) params.appraisal = appraisal.value
      } else {
        if (!/^\d+(\.\d{1,2})?$/.test(budget.value))
          throw new Error('请填写最多两位小数的非负预算')
        params.budgetCents = Math.round(Number(budget.value) * 100)
        params.keywords = form.keywords.trim()
      }
    }
    const service = api[type.value === 'lost_found' ? 'lostFound' : type.value]
    if (!editId.value) {
      const fingerprint = JSON.stringify(params)
      if (!publishAttempt || publishAttempt.fingerprint !== fingerprint) {
        publishAttempt = { fingerprint, key: `${Date.now()}-${Math.random().toString(36).slice(2)}` }
      }
      params.idempotencyKey = publishAttempt.key
    }
    const item = editId.value
      ? await api.plan.update({ ...params, id: editId.value })
      : await service.create(params)
    if (!alive || userId !== session.user?.id) return
    baseline.value = snapshot()
    const delta = item.reward?.delta
    uni.showToast({ title: editId.value ? '计划已更新' : delta > 0 ? `发布成功，获得${delta}颗珍珠` : '已发布', icon: 'success', duration: 2600 })
    uni.redirectTo({ url: contentUrl(item.type, item.id) })
  } catch (e) {
    if (alive && userId === session.user?.id) error.value = errorText(e)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.publish-contribution-note { padding: 12px; margin-bottom: 16px; border-radius: 10px; background: #edf1df; color: #5a714b; font-size: 13px; line-height: 1.8; }
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
.edit-note {
  margin-bottom: 18px;
  padding: 12px;
  border-left: 3px solid var(--room-accent);
  background: var(--room-tint);
  color: #52634c;
  font-size: 13px;
  line-height: 1.7;
}
</style>
