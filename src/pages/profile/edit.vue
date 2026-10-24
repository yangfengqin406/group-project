<template>
  <view class="page village-page village-home">
    <VillageHeader kind="home" title="编辑资料" subtitle="留下你的名字，也分享一点擅长的事。" compact />
    <DemoNotice />
    <view v-if="error" class="error">{{ error }}</view>
    <view v-if="profile" class="panel">
      <text class="label">头像</text>
      <view class="actions" style="align-items: center">
        <image
          v-if="avatarUrl"
          :src="avatarUrl"
          mode="aspectFill"
          class="avatar"
          @tap="chooseAvatar"
        />
        <view v-else class="avatar placeholder" @tap="chooseAvatar">
          <text>点击上传</text>
        </view>
        <button class="secondary" @tap="chooseAvatar">更换头像</button>
      </view>
      <text class="label">昵称</text>
      <input
        class="input"
        v-model="form.nickname"
        maxlength="12"
        placeholder="1～12 个字"
      />
      <text class="label">简介</text>
      <textarea
        class="input textarea"
        v-model="form.bio"
        maxlength="200"
        placeholder="一句话介绍自己"
      />
      <text class="label">技能标签</text>
      <input
        class="input"
        v-model="skillInput"
        placeholder="用逗号分隔，如：摄影,Python"
      />
      <view class="muted">最多 10 个标签</view>
      <view class="actions">
        <button class="primary" :disabled="saving" @tap="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </view>
    </view>
  </view>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onShow, onUnload } from '@dcloudio/uni-app'
import { upload, user } from '../../services/index.js'
import { errorText } from '../../utils/errors.js'
import DemoNotice from '../../components/DemoNotice.vue'
import VillageHeader from '../../components/village/VillageHeader.vue'
import { session } from '../../utils/session.js'
import { useUnsavedChanges } from '../../utils/use-unsaved-changes.js'
const profile = ref(null),
  form = reactive({
    nickname: '',
    bio: '',
    skillTags: [],
    avatarImageId: ''
  }),
  skillInput = ref(''),
  avatarUrl = ref(''),
  error = ref(''),
  saving = ref(false)
const snapshot = () => JSON.stringify([form.nickname, form.bio, skillInput.value, form.avatarImageId])
const saved = ref('')
useUnsavedChanges(computed(() => Boolean(profile.value) && snapshot() !== saved.value))
let revision = 0
let loading = false
async function load() {
  if (loading) return
  const version = ++revision
  const userId = session.user?.id
  loading = true
  error.value = ''
  try {
    const p = await user.getProfile()
    if (version !== revision || userId !== session.user?.id) return
    profile.value = p
    form.nickname = p.nickname || ''
    form.bio = p.bio || ''
    form.skillTags = p.skillTags || []
    form.avatarImageId = p.avatarImageId || ''
    avatarUrl.value = p.avatarUrl || ''
    skillInput.value = (p.skillTags || []).join(',')
    saved.value = snapshot()
  } catch (e) {
    if (version === revision) error.value = errorText(e)
  } finally {
    if (version === revision) loading = false
  }
}
function chooseAvatar() {
  const version = revision
  const userId = session.user?.id
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: async (r) => {
      if (version !== revision || userId !== session.user?.id) return
      try {
        const result = await upload.create({
          usage: 'avatar',
          data: r.tempFilePaths[0]
        })
        if (version !== revision || userId !== session.user?.id) return
        form.avatarImageId = result.imageId
        avatarUrl.value = result.url
      } catch (e) {
        if (version === revision && userId === session.user?.id) error.value = errorText(e)
      }
    }
  })
}
async function save() {
  if (saving.value) return
  const version = revision
  const userId = session.user?.id
  const submitted = snapshot()
  saving.value = true
  error.value = ''
  try {
    const tags = skillInput.value
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    await user.updateProfile({
      nickname: form.nickname,
      bio: form.bio,
      skillTags: tags,
      avatarImageId: form.avatarImageId || undefined
    })
    if (version !== revision || userId !== session.user?.id) return
    saved.value = submitted
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => {
      if (version === revision && userId === session.user?.id && snapshot() === saved.value) uni.navigateBack()
    }, 600)
  } catch (e) {
    if (version === revision) error.value = errorText(e)
  } finally {
    saving.value = false
  }
}
watch(() => session.user?.id, () => {
  ++revision
  profile.value = null
  loading = false
  load()
})
// 选头像或切回前台不会重新覆盖正在填写的资料。
onShow(() => { if (!profile.value) load() })
onUnload(() => { ++revision })
</script>
<style scoped>
.avatar {
  width: 64px;
  height: 64px;
  border: 3px solid #d7c7a3;
  border-radius: 50%;
  background: #eee9d7;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #727760;
  font-size: 12px;
}
</style>
