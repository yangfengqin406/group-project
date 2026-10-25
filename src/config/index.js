export const config = Object.freeze({
  apiMode: import.meta.env.VITE_API_MODE || 'mock',
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  gameBaseUrl: (import.meta.env.VITE_GAME_BASE_URL || '').replace(/\/$/, ''),
  templateIds: (import.meta.env.VITE_WECHAT_TEMPLATE_IDS || '')
    .split(',')
    .filter(Boolean),
  storageKey: 'campus-plaza-demo-v1'
})
