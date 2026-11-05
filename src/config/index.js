// #ifdef APP-PLUS
import { loadAppConnection } from '../platform/app-connection.js'
// #endif
let apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
let gameBaseUrl = (import.meta.env.VITE_GAME_BASE_URL || '').replace(/\/$/, '')
let apiMode = import.meta.env.VITE_API_MODE || 'mock'
// #ifdef APP-PLUS
// uni storage is available before plus.runtime; never gate startup on plus.
const appConnection = loadAppConnection(apiBaseUrl)
apiBaseUrl = appConnection.apiBaseUrl
gameBaseUrl = appConnection.gameBaseUrl
apiMode = 'http'
// #endif
export const config = Object.freeze({
  appContactEmail: import.meta.env.VITE_APP_CONTACT_EMAIL || '',
  appPrivacyUrl: import.meta.env.VITE_APP_PRIVACY_URL || '',
  phonePreviewDebug: import.meta.env.VITE_PHONE_PREVIEW_DEBUG === 'true',
  apiMode, apiBaseUrl, gameBaseUrl,
  // #ifdef APP-PLUS
  defaultAppOrigin: appConnection.defaultOrigin,
  appConnectionError: appConnection.error,
  // #endif
  templateIds: (import.meta.env.VITE_WECHAT_TEMPLATE_IDS || '')
    .split(',')
    .filter(Boolean),
  storageKey: 'campus-plaza-demo-v1'
})
