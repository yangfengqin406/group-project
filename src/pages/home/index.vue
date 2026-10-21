<template>
  <view class="page">
    <DemoNotice />
    <view class="title">自己的家</view>
    <view v-if="error" class="error">{{ error }}</view>
    <view v-if="profile" class="panel">
      <view class="row">
        <view>
          <view class="section-title" style="margin-top: 0">
            {{ profile.nickname }}
          </view>
          <view class="muted">{{ profile.campusName }}</view>
        </view>
        <view class="tag">个人空间</view>
      </view>
      <view class="body" style="margin-top: 18rpx">{{ profile.bio }}</view>
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
    <view class="actions">
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
    <EmptyState v-if="!items.length && !error" title="还没有发布" />
    <button v-if="cursor" class="secondary" @tap="loadMore">加载更多</button>
  </view>
</template>
<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { user, myContent } from '../../services/index.js'
import { demoUsers, switchDemoUser, resetDemo } from '../../mock/index.js'
import { config } from '../../config/index.js'
import { openProfile } from '../../utils/routes.js'
import { errorText } from '../../utils/errors.js'
import { requestSubscription } from '../../platform/subscription.js'
import DemoNotice from '../../components/DemoNotice.vue'
import ContentCard from '../../components/ContentCard.vue'
import EmptyState from '../../components/EmptyState.vue'
const profile = ref(null),
  items = ref([]),
  error = ref(''),
  users = ref([]),
  cursor = ref(null),
  contentType = ref(''),
  isMock = config.apiMode === 'mock'
const filters = [
  { label: '全部', value: '' },
  { label: '二手', value: 'market' },
  { label: '搭子', value: 'plan' },
  { label: '失物', value: 'lost_found' },
  { label: '技能', value: 'help' }
]
async function load() {
  error.value = ''
  try {
    profile.value = await user.getProfile()
    const r = await myContent.list({ contentType: contentType.value })
    items.value = r.items
    cursor.value = r.nextCursor
    users.value = demoUsers()
  } catch (e) {
    error.value = errorText(e)
  }
}
async function loadMore() {
  try {
    const r = await myContent.list({
      contentType: contentType.value,
      cursor: cursor.value
    })
    items.value.push(...r.items)
    cursor.value = r.nextCursor
  } catch (e) {
    error.value = errorText(e)
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
onShow(load)
</script>
