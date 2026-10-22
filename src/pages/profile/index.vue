<template>
  <view class="page village-page village-home">
    <VillageHeader kind="home" :title="profile ? profile.nickname + ' 的主页' : '同学的主页'" subtitle="认识这位同学，看看 TA 分享的校园日常。" compact />
    <DemoNotice />
    <view v-if="error" class="error">{{ error }}</view>
    <view v-if="profile" class="panel">
      <image v-if="profile.avatarUrl" :src="profile.avatarUrl" class="profile-avatar" mode="aspectFill" />
      <view class="muted">{{ profile.campusName }}</view>
      <view class="body profile-bio">{{ profile.bio }}</view>
      <view class="actions">
        <text v-for="skill in profile.skillTags" :key="skill" class="tag">
          {{ skill }}
        </text>
      </view>
    </view>
    <view class="section-title">公开发布</view>
    <view class="muted">共 {{ total }} 条</view>
    <ContentCard v-for="item in items" :key="item.id" :item="item" />
    <EmptyState v-if="!items.length && !error" />
    <button v-if="cursor" class="secondary" @tap="loadMore">加载更多</button>
  </view>
</template>
<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { user } from '../../services/index.js'
import { errorText } from '../../utils/errors.js'
import DemoNotice from '../../components/DemoNotice.vue'
import ContentCard from '../../components/ContentCard.vue'
import EmptyState from '../../components/EmptyState.vue'
import VillageHeader from '../../components/village/VillageHeader.vue'
const userId = ref(''),
  profile = ref(null),
  items = ref([]),
  total = ref(0),
  error = ref(''),
  cursor = ref(null)
onLoad(async (options) => {
  userId.value = options.userId
  try {
    profile.value = await user.getProfile({ userId: userId.value })
    const r = await user.listPublicContent({
      userId: userId.value,
      pageSize: 50
    })
    items.value = r.items
    total.value = r.items.length
    cursor.value = r.nextCursor
  } catch (e) {
    error.value = errorText(e)
  }
})
async function loadMore() {
  try {
    const r = await user.listPublicContent({
      userId: userId.value,
      cursor: cursor.value
    })
    items.value.push(...r.items)
    cursor.value = r.nextCursor
  } catch (e) {
    error.value = errorText(e)
  }
}
</script>
<style scoped>
.profile-avatar { width: 64px; height: 64px; margin-bottom: 12px; border: 3px solid #d7c7a3; border-radius: 50%; }
.profile-bio { margin-top: 14px; }
</style>
