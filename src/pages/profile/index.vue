<template>
  <view class="page">
    <DemoNotice />
    <view v-if="error" class="error">{{ error }}</view>
    <view v-if="profile" class="panel">
      <view class="title">{{ profile.nickname }} 的主页</view>
      <view class="muted">{{ profile.campusName }}</view>
      <view class="body" style="margin-top: 18rpx">{{ profile.bio }}</view>
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
