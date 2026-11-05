'use strict'
const { createHmac, timingSafeEqual } = require('crypto')
const response = (statusCode, code) => ({ statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify({ code }) })

// URLized uniCloud function: invoked only by our business server, never by an
// unauthenticated App. The business database stays on its existing host.
exports.createHandler = ({ secret, appId, db, manager, now = Date.now }) => async (event) => {
  if (!secret || secret.length < 32 || !/^__UNI__[A-Za-z0-9]+$/.test(appId || '')) return response(503, 'NOT_CONFIGURED')
  if (event.httpMethod !== 'POST' || typeof event.body !== 'string' || event.body.length > 4096 || event.isBase64Encoded) return response(400, 'INVALID_REQUEST')
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]))
  const signature = headers['x-campus-signature']
  if (!/^[a-f0-9]{64}$/.test(signature || '')) return response(403, 'FORBIDDEN')
  const expected = createHmac('sha256', secret).update(event.body).digest()
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected)) return response(403, 'FORBIDDEN')
  let input
  try { input = JSON.parse(event.body) } catch { return response(400, 'INVALID_REQUEST') }
  const message = input.message, payload = message?.payload
  const id = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(s)
  if (!Number.isSafeInteger(input.timestamp) || Math.abs(now() - input.timestamp) > 120000 || !id(input.nonce) ||
      !/^[a-f0-9]{32}$/.test(message?.request_id || '') || !/^[A-Za-z0-9_-]{10,200}$/.test(message?.push_clientid || '') ||
      payload?.type !== 'private-message' || ![payload.recipientId, payload.conversationId, payload.messageId].every(id) ||
      !Number.isInteger(message?.settings?.ttl) || message.settings.ttl < 1000 || message.settings.ttl > 3600000) return response(400, 'INVALID_REQUEST')
  const receipt = db.collection('campus-push-receipts').doc(message.request_id)
  try {
    const existing = (await receipt.get()).data[0]
    if (existing?.status === 'accepted') return response(200, 'OK')
    if (existing) return response(503, 'INDETERMINATE')
    // Unique _id serializes replay/concurrent retries. An uncertain provider
    // outcome is not retried with another ID, which could duplicate a banner.
    await db.collection('campus-push-receipts').add({ _id: message.request_id, status: 'sending', createdAt: now() })
  } catch { return response(503, 'RETRY_LATER') }
  try {
    const result = await manager.sendMessage({ push_clientid: message.push_clientid, title: '校园生活广场',
      content: '你收到一条新私信，点击查看',
      payload: { type: 'private-message', recipientId: payload.recipientId, conversationId: payload.conversationId, messageId: payload.messageId },
      request_id: message.request_id, force_notification: true, settings: { ttl: message.settings.ttl },
      options: { android: { '/notification/channel_id': 'campus_private_messages_v1' } } })
    if (result.errCode !== 0) {
      await receipt.remove()
      return response(503, 'PROVIDER_REJECTED')
    }
    await receipt.update({ status: 'accepted' })
    return response(200, 'OK')
  } catch { return response(503, 'INDETERMINATE') }
}

exports.main = async (event) => {
  const secret = process.env.CAMPUS_PUSH_BRIDGE_SECRET, appId = process.env.CAMPUS_PUSH_APP_ID
  if (!secret || secret.length < 32 || !/^__UNI__[A-Za-z0-9]+$/.test(appId || '')) return response(503, 'NOT_CONFIGURED')
  return exports.createHandler({ secret, appId, db: uniCloud.database(), manager: uniCloud.getPushManager({ appId }) })(event)
}
