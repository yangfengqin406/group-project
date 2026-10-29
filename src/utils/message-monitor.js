// One foreground poller shared by all pages; no business data in local storage.
export function createMessageMonitor({ read, identity, state, badge, schedule = setTimeout, cancel = clearTimeout }) {
  let visible = false, version = 0, timer = null, flight = null, fingerprint = ''
  const seen = new Set()
  function stop() {
    visible = false
    state.foreground = false
    version++
    if (timer !== null) cancel(timer)
    timer = null
    flight = null
  }
  function reset() {
    stop()
    seen.clear()
    fingerprint = ''
    Object.assign(state, { total: 0, items: [], banner: null, error: '', activeConversationId: '' })
    badge(0)
  }
  function refresh() {
    if (!visible || !identity()) return Promise.resolve()
    if (flight) return flight
    if (timer !== null) cancel(timer)
    timer = null
    const generation = version, account = identity()
    const current = () => visible && version === generation && account === identity()
    let failed = false
    const pending = Promise.resolve().then(read).then((result) => {
      if (!current()) return
      state.total = result.total
      state.items = result.items
      state.error = ''
      state.tick = (state.tick || 0) + 1
      badge(result.total)
      const next = JSON.stringify(result.items.map((c) => [c.id, c.unreadCount, c.lastMessage?.id]))
      if (next !== fingerprint) { fingerprint = next; state.revision++ }
      const candidate = result.items.find((c) => c.id !== state.activeConversationId && !seen.has(c.lastMessage?.id))
      if (candidate) state.banner = candidate
      else if (state.banner && !result.items.some((c) => c.id === state.banner.id)) state.banner = null
      for (const c of result.items) if (c.lastMessage?.id) seen.add(c.lastMessage.id)
    }).catch(() => {
      if (current()) { failed = true; state.error = '新消息检查暂时失败，正在重试' }
    }).finally(() => {
      if (!current()) return
      flight = null
      timer = schedule(refresh, failed ? 15000 : 5000)
    })
    flight = pending
    return pending
  }
  return {
    start() { if (!visible) { visible = true; state.foreground = true; return refresh() } return flight || Promise.resolve() },
    stop, reset, refresh,
    invalidate() {
      version++
      flight = null
      if (timer !== null) cancel(timer)
      timer = null
      if (visible) timer = schedule(refresh, 5000)
    },
    setActive(id) { state.activeConversationId = id || ''; if (state.banner?.id === id) state.banner = null },
    dismiss() { state.banner = null }
  }
}
