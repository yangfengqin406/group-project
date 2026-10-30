import { reactive } from 'vue'
import { config } from '../config/index.js'
// #ifdef APP-PLUS
import { ServiceError } from './errors.js'
let connectionChanging = false
const guardConnection = () => { if (connectionChanging) throw new ServiceError('CONFLICT', '服务地址正在切换，请等待App重启。') }
// #endif
export const session = reactive({ user: null })
const tokenKey = () => `campus-plaza-token:${config.apiMode}:${config.apiBaseUrl}`
export function setSession(user) {
  session.user = user
}
export function setToken(token) {
  // #ifdef APP-PLUS
  guardConnection()
  // #endif
  uni.setStorageSync(tokenKey(), token)
}
export function getToken() {
  // #ifdef APP-PLUS
  guardConnection()
  // #endif
  return uni.getStorageSync(tokenKey()) || ''
}
// #ifdef APP-PLUS
export function prepareConnectionSession(nextApiBaseUrl) {
  guardConnection()
  const keys = [...new Set([tokenKey(), `campus-plaza-token:http:${nextApiBaseUrl}`])]
  const previous = keys.map(key => [key, uni.getStorageSync(key)])
  const user = session.user
  const restore = () => {
    let failed = false
    for (const [key, value] of previous) {
      try {
        if (value === undefined || value === null || value === '') uni.removeStorageSync(key)
        else uni.setStorageSync(key, value)
        if ((uni.getStorageSync(key) || '') !== (value || '')) failed = true
      } catch { failed = true }
    }
    connectionChanging = false
    session.user = user
    if (failed) throw new ServiceError('SERVICE_UNAVAILABLE', '本机登录状态恢复失败，请重启后重新登录。')
  }
  connectionChanging = true
  try {
    for (const key of keys) {
      uni.removeStorageSync(key)
      if (uni.getStorageSync(key)) throw new Error('token not cleared')
    }
    session.user = null
  } catch {
    restore()
    throw new ServiceError('SERVICE_UNAVAILABLE', '本机登录状态无法清理，服务地址未切换。')
  }
  return { rollback: restore }
}
// #endif
let opening = false
export function openLogin() {
  if (opening) return
  opening = true
  setTimeout(() => uni.navigateTo({ url: '/rooms/account/index', complete: () => { opening = false } }), 0)
}
