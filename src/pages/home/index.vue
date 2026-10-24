<template>
  <view class="page village-page village-home">
    <VillageHeader kind="home" title="自己的家" subtitle="在小屋里歇歇脚，整理你的校园生活。" />
    <DemoNotice />
    <view v-if="error" class="error">{{ error }}</view>
    <view v-if="profile" class="panel">
      <view class="row home-identity">
        <image v-if="profile.avatarUrl" :src="profile.avatarUrl" class="profile-avatar" mode="aspectFill" />
        <view class="identity-copy">
          <view class="section-title" style="margin-top: 0">
            {{ profile.nickname }}
          </view>
          <view class="muted">{{ profile.campusName }}</view>
        </view>
        <view class="tag">个人空间</view>
      </view>
      <view class="body profile-bio">{{ profile.bio }}</view>
      <view class="actions">
        <text class="tag" v-for="skill in profile.skillTags" :key="skill">
          {{ skill }}
        </text>
      </view>
      <view class="actions">
        <button class="secondary" @tap="editProfile">编辑资料</button>
        <button class="secondary" @tap="publicProfile">查看我的公开主页</button>
        <button class="secondary" @tap="askSubscription">接收匹配通知</button>
      </view>
    </view>
    <view class="panel">
      <view class="row">
        <view>
          <view class="section-title" style="margin-top: 0">我的宠物</view>
          <view class="muted">挑个伙伴，搭配成喜欢的样子。</view>
        </view>
        <button class="secondary" @tap="openPet">去搭配</button>
      </view>
    </view>
    <view class="panel">
      <view class="section-title" style="margin-top: 0">发布统计</view>
      <view class="stats-row">
        <view class="stat-cell">
          <view class="stat-num">{{ stats.total }}</view>
          <view class="muted">总发布</view>
        </view>
        <view class="stat-cell">
          <view class="stat-num">{{ stats.active }}</view>
          <view class="muted">在售 / 进行中</view>
        </view>
        <view class="stat-cell">
          <view class="stat-num">{{ stats.completed }}</view>
          <view class="muted">已完成</view>
        </view>
      </view>
    </view>
    <view class="panel">
      <view class="row">
        <view>
          <view class="section-title" style="margin-top: 0">我的收藏</view>
          <view class="muted">你收藏的闲置、搭子和失物。</view>
        </view>
      </view>
      <view v-if="favLoading" class="muted">正在读取收藏…</view>
      <view v-else-if="!favorites.length && !error" class="muted">还没有收藏内容。</view>
      <view
        v-for="f in favorites"
        :key="f.contentType + ':' + f.contentId"
        class="fav-item link"
        @tap="openFav(f)"
      >
        {{ contentNames[f.contentType] }} · {{ f.content?.title || '（内容已删除）' }}
      </view>
    </view>
    <view class="panel">
      <view class="section-title" style="margin-top: 0">近期发布</view>
      <view v-if="!activities.length && !loading && !error" class="muted">还没有发布内容。</view>
      <view v-for="a in activities" :key="a.id" class="activity-item">
        <text class="tag">{{ a.label }}</text>
        <text class="activity-title">{{ a.title }}</text>
        <text class="muted activity-time">{{ formatTime(a.createdAt) }}</text>
      </view>
    </view>
    <view v-if="isMock" class="panel">
      <view class="section-title" style="margin-top: 0">演示身份</view>
      <view class="muted">
        同一设备切换身份可检查邀请与留言；不是微信登录，也不是多人在线。
      </view>
      <view class="actions">
        <button
          v-for="u in users"
          :key="u.id"
          :class="u.id === profile?.id ? 'primary' : 'secondary'"
          @tap="switchUser(u.id)"
        >
          {{ u.nickname }}
        </button>
        <button class="danger" @tap="reset">重置本机演示</button>
      </view>
    </view>
    <view class="section-title">我的发布</view>
    <view class="actions village-filter-row">
      <button
        v-for="f in filters"
        :key="f.value"
        :class="contentType === f.value ? 'primary' : 'secondary'"
        @tap="setFilter(f.value)"
      >
        {{ f.label }}
      </button>
    </view>
    <ContentCard v-for="item in items" :key="item.id" :item="item" />
    <view v-if="loading" class="muted">正在整理小屋…</view>
    <EmptyState v-if="!items.length && !error && !loading" title="还没有发布" />
    <button v-if="cursor" class="secondary" :disabled="loading" @tap="loadMore">加载更多</button>
  </view>
</template>
<script setup>
import { ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { user, myContent, favorite } from '../../services/index.js'
import { demoUsers, switchDemoUser, resetDemo } from '../../mock/index.js'
import { config } from '../../config/index.js'
import { openProfile, contentNames, contentUrl, formatTime } from '../../utils/routes.js'
import { errorText } from '../../utils/errors.js'
import { requestSubscription } from '../../platform/subscription.js'
import DemoNotice from '../../components/DemoNotice.vue'
import ContentCard from '../../components/ContentCard.vue'
import EmptyState from '../../components/EmptyState.vue'
import VillageHeader from '../../components/village/VillageHeader.vue'
import { session } from '../../utils/session.js'
const profile = ref(null),
  items = ref([]),
  error = ref(''),
  users = ref([]),
  cursor = ref(null),
  loading = ref(false),
  contentType = ref(''),
  isMock = config.apiMode === 'mock',
  stats = ref({ total: 0, active: 0, completed: 0 }),
  favorites = ref([]),
  favLoading = ref(false),
  activities = ref([])
let loadVersion = 0
let visible = false
const filters = [
  { label: '全部', value: '' },
  { label: '二手', value: 'market' },
  { label: '搭子', value: 'plan' },
  { label: '失物', value: 'lost_found' },
  { label: '技能', value: 'help' }
]
async function load() {
  const version = ++loadVersion
  const userId = session.user?.id
  const filter = contentType.value
  const current = () => version === loadVersion && userId === session.user?.id && filter === contentType.value
  loading.value = true
  error.value = ''
  items.value = []
  cursor.value = null
  clearPersonalSummary()
  favLoading.value = true
  try {
    const [p, r] = await Promise.all([
      user.getProfile(),
      myContent.list({ contentType: filter })
    ])
    if (!current()) return
    profile.value = p
    items.value = r.items
    cursor.value = r.nextCursor
    users.value = demoUsers()
  } catch (e) {
    if (current()) error.value = errorText(e)
  } finally {
    if (current()) loading.value = false
  }
  if (!current() || error.value) {
    if (current()) favLoading.value = false
    return
  }
  try {
    await Promise.all([loadStats(current), loadFavorites(current)])
  } catch (e) {
    if (current()) error.value = errorText(e)
  }
}
function clearPersonalSummary() {
  stats.value = { total: 0, active: 0, completed: 0 }
  favorites.value = []
  activities.value = []
  favLoading.value = false
}
async function loadStats(current) {
  let cur = null
  const all = []
  do {
    const r = await myContent.list({ pageSize: 50, cursor: cur })
    if (!current()) return
    all.push(...r.items)
    cur = r.nextCursor
  } while (cur)
  stats.value = {
    total: all.length,
    active: all.filter((c) => ['active', 'open', 'full'].includes(c.status))
      .length,
    completed: all.filter((c) =>
      ['completed', 'returned'].includes(c.status)
    ).length
  }
  buildActivities(all)
}
async function loadFavorites(current) {
  favLoading.value = true
  favorites.value = []
  try {
    let cur = null
    const all = []
    do {
      const r = await favorite.list({ pageSize: 50, cursor: cur })
      if (!current()) return
      all.push(...r.items)
      cur = r.nextCursor
    } while (cur)
    favorites.value = all
  } finally {
    if (current()) favLoading.value = false
  }
}
function buildActivities(contents) {
  const acts = []
  for (const c of contents)
    acts.push({
      id: `pub_${c.type}_${c.id}`,
      label: '发布',
      title: c.title,
      createdAt: c.createdAt
    })
  acts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  activities.value = acts.slice(0, 8)
}
function openFav(f) {
  uni.navigateTo({ url: contentUrl(f.contentType, f.contentId) })
}
async function loadMore() {
  if (loading.value || !cursor.value) return
  const version = loadVersion
  const userId = session.user?.id
  const current = () => version === loadVersion && userId === session.user?.id
  loading.value = true
  try {
    const r = await myContent.list({
      contentType: contentType.value,
      cursor: cursor.value
    })
    if (!current()) return
    const known = new Set(items.value.map((item) => item.id))
    items.value.push(...r.items.filter((item) => !known.has(item.id)))
    cursor.value = r.nextCursor
  } catch (e) {
    if (current()) error.value = errorText(e)
  } finally {
    if (current()) loading.value = false
  }
}
function setFilter(value) {
  contentType.value = value
  load()
}
function publicProfile() {
  openProfile(profile.value.id)
}
function editProfile() {
  uni.navigateTo({ url: '/pages/profile/edit' })
}
function openPet() {
  uni.navigateTo({ url: '/pages/pet/index' })
}
function switchUser(id) {
  switchDemoUser(id)
  load()
}
function reset() {
  uni.showModal({
    title: '重置演示',
    content: '会清除这台设备上的演示发布、邀请、留言和收藏。',
    success: (r) => {
      if (r.confirm) {
        resetDemo()
        load()
      }
    }
  })
}
async function askSubscription() {
  try {
    const result = await requestSubscription()
    const accepted = Object.values(result).some((v) => v === 'accept')
    uni.showToast({
      title: accepted ? '已授权；发送需接入后端' : '未获得订阅授权',
      icon: 'none'
    })
  } catch (e) {
    error.value = errorText(e)
  }
}
watch(() => session.user?.id, () => {
  ++loadVersion
  profile.value = null
  items.value = []
  cursor.value = null
  loading.value = false
  clearPersonalSummary()
  if (visible) load()
})
onShow(() => { visible = true; load() })
onHide(() => { visible = false; ++loadVersion; loading.value = false; favLoading.value = false })
onUnload(() => { visible = false; ++loadVersion; favLoading.value = false })
</script>
<style scoped>
.home-identity { justify-content: flex-start; }
.identity-copy { flex: 1; min-width: 0; }
.profile-avatar { width: 64px; height: 64px; border: 3px solid #d7c7a3; border-radius: 50%; }
.profile-bio { margin-top: 14px; }
.stats-row { display: flex; gap: 12px; margin-top: 12px; }
.stat-cell { flex: 1; text-align: center; padding: 10px; background: #f6f1e3; border-radius: 8px; }
.stat-num { font-size: 22px; font-weight: 700; color: #354d3e; }
.fav-item { padding: 8px 0; border-bottom: 1px dashed #ddd1b3; }
.activity-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px dashed #ddd1b3; }
.activity-title { flex: 1; min-width: 0; }
.activity-time { font-size: 12px; }
</style>
