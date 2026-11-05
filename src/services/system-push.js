import { reactive } from 'vue'
import { config } from '../config/index.js'
import { session, getToken, openLogin } from '../utils/session.js'
import * as push from './push.js'
import * as conversation from './conversation.js'
import { messageAlerts } from './message-alerts.js'
import { createSystemPushController } from '../utils/system-push-controller.js'
import { pushClientId, pushPermission, pushPlatform, requestPushPermission, openPushSettings } from '../platform/system-push.js'

const state = reactive({ enabled: false, configured: null, permission: null, busy: false, error: '' })
const preferenceKey = (id) => `campus-push-consent:${config.apiBaseUrl}:${id.userId}`
const controller = createSystemPushController({
  state,
  identity() {
    try {
      const token = getToken(), userId = session.user?.id
      return config.apiMode === 'http' && token && userId ? { userId, key: `${config.apiBaseUrl}:${userId}:${token}` } : null
    } catch { return null }
  },
  optedIn: (id) => uni.getStorageSync(preferenceKey(id)) === true,
  saveOptIn: (id, value) => uni.setStorageSync(preferenceKey(id), value),
  permission: pushPermission, requestPermission: requestPushPermission, clientId: pushClientId, platform: pushPlatform,
  api: push, listen: (listener) => { if (typeof uni.onPushMessage === 'function') uni.onPushMessage(listener) },
  login: () => { if (!getToken()) openLogin() },
  async open(id, current) {
    await conversation.get({ id })
    if (!current()) return
    await new Promise((resolve, reject) => uni.navigateTo({ url: `/pages/messages/chat?id=${encodeURIComponent(id)}`, success: resolve, fail: reject }))
  },
  clearNotifications: () => { try { plus.push.clear() } catch { /* Optional native capability. */ } },
  refreshed: () => messageAlerts.invalidate()
})
export const systemPush = { state, ...controller, openSettings: openPushSettings }
