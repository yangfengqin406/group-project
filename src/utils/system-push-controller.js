// Native adapters and RPC are injected so account races can be tested without
// claiming that a browser or a mocked SDK has delivered a phone notification.
export function createSystemPushController({ state, identity, optedIn, saveOptIn, permission, requestPermission,
  clientId, platform, api, listen, open, login, clearNotifications, refreshed }) {
  let generation = 0, pending = null, started = false, chain = Promise.resolve(), account = '', opening = false
  const clicks = new Set()
  const current = (version, id) => generation === version && identity()?.key === id.key
  async function drain() {
    const id = identity(), target = pending
    if (!target || !id || opening) return
    pending = null
    if (target.recipientId !== id.userId) return
    opening = true
    try { await open(target.conversationId, () => identity()?.key === id.key) }
    catch { if (identity()?.key === id.key) state.error = '这条通知的会话暂时无法打开，请到消息中心查看。' }
    finally { opening = false; if (pending) void drain() }
  }
  function receive(event) {
    if (event?.type === 'receive') { refreshed(); return }
    if (event?.type !== 'click') return
    try {
      let value = event.data
      if (typeof value === 'string' && value.length <= 4096) value = JSON.parse(value)
      value = value?.payload ?? value
      if (typeof value === 'string' && value.length <= 4096) value = JSON.parse(value)
      if (value?.type !== 'private-message' || ![value.conversationId, value.recipientId, value.messageId]
        .every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id))) return
      if (clicks.has(value.messageId)) return
      clicks.add(value.messageId)
      if (clicks.size > 100) clicks.delete(clicks.values().next().value)
      pending = value
      if (!identity()) login()
      else void drain()
    } catch { /* Never accept a route/URL directly from a push payload. */ }
  }
  function refresh(enable = false) {
    const version = ++generation, id = identity()
    state.error = ''
    if (!id) { state.enabled = false; state.busy = false; return Promise.resolve() }
    state.busy = true
    const run = async () => {
      try {
        if (!current(version, id)) return
        const status = await api.status()
        if (!current(version, id)) return
        state.configured = status.configured
        if (!status.configured) { state.enabled = false; return }
        if (!enable && !optedIn(id)) { state.enabled = false; return }
        if (enable) await requestPermission()
        if (!current(version, id)) return
        const allowed = await permission()
        if (!current(version, id)) return
        state.permission = allowed
        if (!allowed) {
          state.enabled = false
          // Revoke an existing binding when permission was switched off in OS settings.
          if (optedIn(id)) {
            const cid = await clientId()
            if (!current(version, id)) return
            await api.unbind({ clientId: cid })
          }
          return
        }
        const cid = await clientId()
        if (!current(version, id)) return
        await api.bind({ clientId: cid, platform: platform() })
        if (!current(version, id)) return
        saveOptIn(id, true); state.enabled = true
      } catch (error) {
        if (current(version, id)) { state.enabled = false; state.error = error?.message || '手机通知连接失败，请重试或联系维护者。' }
      } finally { if (current(version, id)) state.busy = false }
    }
    chain = chain.then(run, run)
    return chain
  }
  async function disable() {
    const id = identity(), version = ++generation
    if (!id) return
    state.busy = true; state.error = ''
    const run = async () => {
      try {
        if (!current(version, id)) return
        const cid = await clientId()
        if (!current(version, id)) return
        await api.unbind({ clientId: cid })
        if (current(version, id)) { saveOptIn(id, false); state.enabled = false; clearNotifications() }
      } catch { if (current(version, id)) state.error = '关闭失败，请检查网络后重试；也可在系统设置中关闭通知。' }
      finally { if (current(version, id)) state.busy = false }
    }
    chain = chain.then(run, run)
    return chain
  }
  return {
    start() { if (!started) { started = true; listen(receive) } },
    async resume() { await refresh(); await drain() },
    changed() {
      generation++
      const next = identity()?.key || ''
      if (account && account !== next) { pending = null; clearNotifications() }
      account = next
      Object.assign(state, { enabled: false, configured: null, permission: null, busy: false, error: '' })
      return this.resume()
    },
    enable: () => refresh(true), disable
  }
}
