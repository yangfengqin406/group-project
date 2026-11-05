import { reactive } from 'vue'
import * as conversation from './conversation.js'
import { session } from '../utils/session.js'
import { createMessageMonitor } from '../utils/message-monitor.js'

const state = reactive({ total: 0, items: [], banner: null, error: '', revision: 0, tick: 0, activeConversationId: '' })
function badge(total) {
  const options = { index: 1, fail: () => {} }
  if (total) uni.setTabBarBadge({ ...options, text: total > 99 ? '99+' : String(total) })
  else uni.removeTabBarBadge(options)
}
const monitor = createMessageMonitor({ read: conversation.unread, identity: () => session.user?.id, state, badge })
let opening = false
export const messageAlerts = {
  state, ...monitor,
  acknowledged(id, remaining) {
    state.items = state.items.flatMap((c) => c.id !== id ? [c] : remaining ? [{ ...c, unreadCount: remaining }] : [])
    state.total = state.items.reduce((sum, c) => sum + c.unreadCount, 0)
    if (!remaining && state.banner?.id === id) state.banner = null
    badge(state.total)
    monitor.invalidate()
  },
  open(id) {
    if (opening || !id) return
    opening = true
    uni.navigateTo({
      url: `/pages/messages/chat?id=${encodeURIComponent(id)}`,
      success: () => monitor.dismiss(), complete: () => { opening = false }
    })
  }
}
