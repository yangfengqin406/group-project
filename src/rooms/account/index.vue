<template>
  <view class="account-page">
    <view class="account-card">
      <text class="account-leaf">✿</text>
      <view class="title">{{ registering ? '在小镇安个家' : '欢迎回到小镇' }}</view>
      <view class="muted">用自己的账号，和同学分享校园里的小事。</view>
      <text class="label">账号</text>
      <input class="input" v-model="studentId" maxlength="40" autocomplete="username" placeholder="3～40 位字母、数字、点、下划线或短横线" />
      <text class="label">密码</text>
      <input class="input" v-model="password" password maxlength="128" placeholder="至少 8 位，请勿使用学校系统密码" @confirm="submit" />
      <template v-if="registering">
        <text class="label">小镇昵称</text>
        <input class="input" v-model="nickname" maxlength="12" placeholder="同学们怎么称呼你" />
      </template>
      <view v-if="error" class="error" role="alert">{{ error }}</view>
      <button class="primary" :disabled="busy" @tap="submit">{{ busy ? '正在办理…' : registering ? '注册并进入' : '登录小镇' }}</button>
      <button class="secondary" :disabled="busy" @tap="toggle">{{ registering ? '已有账号，去登录' : '第一次来，注册账号' }}</button>
      <view class="account-note">这是独立的校园服务账号，未核验学籍。微信登录暂未配置。</view>
    </view>
  </view>
</template>
<script setup>
import { ref } from 'vue'
import { auth } from '../../services/index.js'
import { errorText } from '../../utils/errors.js'
const studentId = ref(''), password = ref(''), nickname = ref(''), registering = ref(false), busy = ref(false), error = ref('')
function toggle() { registering.value = !registering.value; error.value = '' }
async function submit() {
  if (busy.value) return
  error.value = ''; busy.value = true
  try {
    const params = { type: 'h5', studentId: studentId.value.trim(), password: password.value }
    registering.value ? await auth.register({ ...params, nickname: nickname.value.trim() }) : await auth.login(params)
    password.value = ''
    uni.switchTab({ url: '/pages/plaza/index' })
  } catch (e) { error.value = errorText(e) }
  finally { busy.value = false }
}
</script>
<style scoped>
.account-page { min-height: calc(100vh - 44px); box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 28px 20px; background: #e9efdc; }
.account-card { width: 100%; max-width: 390px; padding: 28px 24px; box-sizing: border-box; background: #fffdf4; border: 1px solid #d7dfc8; border-radius: 24px; box-shadow: 0 12px 36px #52694414; }
.account-leaf { display: block; color: #819b69; font-size: 40px; margin-bottom: 8px; }
.title { font-size: 25px; margin-bottom: 8px; color: #38553b; }
.primary, .secondary { width: 100%; margin-top: 16px; }
.account-note { color: #888878; font-size: 12px; line-height: 1.7; margin-top: 22px; }
</style>
