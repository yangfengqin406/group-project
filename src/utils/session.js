import { reactive } from 'vue'
import { config } from '../config/index.js'
export const session = reactive({ user: null })
const tokenKey = () => `campus-plaza-token:${config.apiMode}:${config.apiBaseUrl}`
export function setSession(user) {
  session.user = user
}
export function setToken(token) {
  uni.setStorageSync(tokenKey(), token)
}
export function getToken() {
  return uni.getStorageSync(tokenKey()) || ''
}
let opening = false
export function openLogin() {
  if (opening) return
  opening = true
  setTimeout(() => uni.navigateTo({ url: '/rooms/account/index', complete: () => { opening = false } }), 0)
}
