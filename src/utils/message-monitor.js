// One foreground poller shared by all pages; no business data in local storage.
export function createMessageMonitor({ read, identity, state, badge, schedule = setTimeout, cancel = clearTimeout }) {
  let visible = false, version = 0, timer = null, flight = null, fingerprint = ''
  const seen = new Set()
  const eventId = (c) => c.lastMessage?.id || c.contactRequest?.id
  function apply(items, total, complete = false) {
    state.total = total
    state.items = items
    state.hasKnownUnread = true
    if (complete) {
      state.error = ''
      state.hasSnapshot = true
      state.tick = (state.tick || 0) + 1
    }
    badge(total)
    const next = JSON.stringify(items.map((c) => [c.id, c.unreadCount, c.unreadContact, eventId(c)]))
    if (next !== fingerprint) { fingerprint = next; state.revision++ }
    const candidate = items.find((c) => c.id !== state.activeConversationId && eventId(c) && !seen.has(eventId(c)))
    if (candidate) state.banner = candidate
    else if (state.banner && !items.some((c) => c.id === state.banner.id)) state.banner = null
    for (const c of items) if (eventId(c)) seen.add(eventId(c))
  }
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
    Object.assign(state, { total: 0, items: [], banner: null, error: '', activeConversationId: '', hasSnapshot: false, hasKnownUnread: false })
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
      apply(result.items, result.total, true)
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
  function invalidate() {
    version++
    flight = null
    if (timer !== null) cancel(timer)
    timer = null
    if (visible) timer = schedule(refresh, 5000)
  }
  return {
    start() {
      if (!visible) { visible = true; state.foreground = true; return refresh() }
      // A start before login has no request or scheduled poll. A subsequent
      // foreground start must be able to resume without adding another timer.
      return flight || (timer === null ? refresh() : Promise.resolve())
    },
    stop, reset, refresh,
    invalidate,
    captureRead() { return { version, tick: state.tick || 0, account: identity() } },
    observeConversations(rows, ticket) {
      if (!visible || !identity() || !ticket || ticket.version !== version ||
          ticket.tick !== (state.tick || 0) || ticket.account !== identity()) return false
      const merged = new Map(state.items.map((item) => [item.id, item]))
      for (const row of rows) {
        const count = Number.isSafeInteger(row.unreadCount) && row.unreadCount > 0
          ? row.unreadCount : row.unreadContact ? 1 : 0
        if (count) merged.set(row.id, { ...row, unreadCount: count })
        else merged.delete(row.id)
      }
      // The list was requested after the last accepted snapshot. Prevent an
      // older pending poll or a pre-read list from undoing this evidence.
      invalidate()
      const items = [...merged.values()].sort((a, b) =>
        Date.parse(b.lastMessage?.createdAt || b.contactRequest?.createdAt || b.createdAt) -
        Date.parse(a.lastMessage?.createdAt || a.contactRequest?.createdAt || a.createdAt))
      apply(items, items.reduce((sum, item) => sum + item.unreadCount, 0))
      return true
    },
    setActive(id) { state.activeConversationId = id || ''; if (state.banner?.id === id) state.banner = null },
    dismiss() { state.banner = null }
  }
}
