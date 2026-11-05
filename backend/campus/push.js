import { createHash, createHmac, randomUUID } from 'node:crypto'
import { CServiceError } from '../c/service.js'

const DEVICES = 'campus.pushDevices', JOBS = 'campus.pushJobs'
const digest = (value) => createHash('sha256').update(value).digest('hex')
const need = (ok, code, message) => { if (!ok) throw new CServiceError(code, message) }
const validCid = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(value)
export const PUSH_METHODS = new Set(['push.status', 'push.bind', 'push.unbind'])

// Only the business server knows this secret. CloudBase containers may use the
// same adapter; neither the App nor its VITE environment receives credentials.
export function createPushBridge({ env = process.env, fetcher = fetch } = {}) {
  const url = env.CAMPUS_PUSH_BRIDGE_URL, secret = env.CAMPUS_PUSH_BRIDGE_SECRET
  if (!url && !secret) return null
  let endpoint
  try { endpoint = new URL(url) } catch { /* fail closed below */ }
  if (!endpoint || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash || !secret || secret.length < 32)
    throw new Error('推送桥须配置HTTPS地址及至少32字符的服务端密钥')
  return {
    async send(message) {
      const body = JSON.stringify({ timestamp: Date.now(), nonce: randomUUID(), message })
      const signature = createHmac('sha256', secret).update(body).digest('hex')
      const response = await fetcher(endpoint, { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Campus-Signature': signature }, body, signal: AbortSignal.timeout(10000) })
      const result = await response.json()
      if (!response.ok || result?.code !== 'OK') throw new Error('PUSH_PROVIDER_UNAVAILABLE')
      return { accepted: true }
    }
  }
}

export function createPushService({ store, accounts, canDeliver, provider = null, now = Date.now }) {
  let running = null, stopped = false
  const rows = (collection, where = '1', args = [], limit = 100) => store.query(collection, where, args, 'seq ASC', limit)
  const sessionAlive = (device) => {
    const login = store.get('campus.sessions', device.sessionId)
    const user = accounts.getUser(device.userId)
    return login && user && !user.disabled && !login.revokedAt && login.userId === device.userId && Date.parse(login.expiresAt) > now()
  }
  function invoke(method, p, principal) {
    const me = accounts.authenticate(principal.token)
    need(me && me.userId === principal.userId, 'UNAUTHENTICATED', '请先登录有效账号')
    if (method === 'push.status') {
      need(Object.keys(p).length === 0, 'INVALID_ARGUMENT', '推送状态只查询当前服务')
      return { configured: Boolean(provider) }
    }
    need(Object.keys(p).every((key) => ['clientId', ...(method === 'push.bind' ? ['platform'] : [])].includes(key)) && validCid(p.clientId),
      'INVALID_ARGUMENT', '推送设备参数无效')
    const id = digest(p.clientId), old = store.get(DEVICES, id)
    const login = accounts.sessionForToken(principal.token)
    if (method === 'push.unbind') {
      // A delayed logout/disable must never remove a newer account's binding.
      if (old?.userId === me.userId && old.sessionId === login.id) store.update(DEVICES, { ...old, enabled: false })
      return { enabled: false }
    }
    need(provider, 'NOT_IMPLEMENTED', '服务端尚未配置手机推送，请联系维护者')
    need(['android', 'ios'].includes(p.platform), 'INVALID_ARGUMENT', '推送平台须为Android或iOS')
    return store.transaction(() => {
      const devices = rows(DEVICES, "json_extract(data, '$.userId') = ? AND json_extract(data, '$.enabled') = 1", [me.userId], 51)
      need(old?.userId === me.userId || devices.length < 20, 'RATE_LIMITED', '绑定设备过多，请先退出不用的设备')
      const value = { id, clientId: p.clientId, userId: me.userId, sessionId: login.id, platform: p.platform,
        enabled: true, revision: old?.enabled && old.userId === me.userId && old.sessionId === login.id ? old.revision : randomUUID(), updatedAt: now() }
      old ? store.update(DEVICES, value) : store.insert(DEVICES, value)
      return { enabled: true }
    })
  }
  function enqueue({ message, recipientId }) {
    for (const { value: device } of rows(DEVICES, "json_extract(data, '$.userId') = ? AND json_extract(data, '$.enabled') = 1", [recipientId], 20)) {
      if (!sessionAlive(device)) continue
      const id = digest(`${message.id}:${device.id}:${device.revision}`)
      if (store.get(JOBS, id)) continue
      store.insert(JOBS, { id, deviceId: device.id, revision: device.revision, recipientId,
        messageId: message.id, conversationId: message.conversationId, status: 'pending', attempts: 0,
        createdAt: now(), nextAt: now() })
    }
  }
  async function dispatch() {
    const due = rows(JOBS, "json_extract(data, '$.status') = 'pending' AND json_extract(data, '$.nextAt') <= ?", [now()], 50)
    for (const { value: job } of due) {
      if (stopped) return
      const device = store.get(DEVICES, job.deviceId)
      const messageRow = rows('messages', 'id = ?', [job.messageId], 1)[0]
      const read = store.get('conversationReads', JSON.stringify([job.recipientId, job.conversationId]))?.seq || 0
      const eligible = device?.enabled && device.revision === job.revision && device.userId === job.recipientId && sessionAlive(device) &&
        messageRow && messageRow.seq > read && now() - job.createdAt < 3600000 && canDeliver(job, messageRow.value)
      if (!eligible) { store.update(JOBS, { ...job, status: 'discarded' }); continue }
      const payload = { type: 'private-message', conversationId: job.conversationId, recipientId: job.recipientId, messageId: job.messageId }
      try {
        await provider.send({ push_clientid: device.clientId, title: '校园生活广场', content: '你收到一条新私信，点击查看',
          payload, request_id: job.id.slice(0, 32), force_notification: true,
          settings: { ttl: Math.max(1000, 3600000 - (now() - job.createdAt)) },
          options: { android: { '/notification/channel_id': 'campus_private_messages_v1' } } })
        if (!stopped) store.update(JOBS, { ...job, status: 'accepted', attempts: job.attempts + 1 })
      } catch {
        // No provider bodies, device identifiers, tokens or message text in logs.
        if (!stopped) store.update(JOBS, { ...job, attempts: job.attempts + 1,
          status: job.attempts >= 7 ? 'failed' : 'pending', nextAt: now() + Math.min(300000, 5000 * 2 ** job.attempts) })
      }
    }
  }
  function flush() {
    if (!provider || stopped) return Promise.resolve()
    if (!running) running = dispatch().finally(() => { running = null })
    return running
  }
  return { invoke, enqueue, flush, stop() { stopped = true } }
}
