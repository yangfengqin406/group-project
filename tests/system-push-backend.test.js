import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'
import { createPushBridge } from '../backend/campus/push.js'

const password = 'push-test-password', clientId = 'test-device-001'
function fixture(t, provider) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-push-test-'))
  let store, service, clock = Date.now()
  const sent = []
  const pushProvider = provider ?? { send: async (message) => { sent.push(message) } }
  function reopen() {
    service?.push.stop(); store?.close()
    store = openCStore(join(directory, 'test.sqlite'))
    service = createCampusService({ store, uploadsDir: join(directory, 'uploads'), uploadOrigin: 'https://example.com',
      pushProvider, now: () => clock })
  }
  reopen()
  t.after(() => {
    service.push.stop(); store.close()
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
    assert.match(directory.split(/[\\/]/).at(-1), /^campus-push-test-/)
    rmSync(directory, { recursive: true, force: true })
  })
  const f = { directory, get store() { return store }, get service() { return service }, sent, reopen,
    advance: (ms) => { clock += ms },
    call: (method, params, login) => service.invoke(method, params, login ? { userId: login.user.id, token: login.token } : {}),
    register: (name) => service.invoke('auth.register', { studentId: name, nickname: name, password }),
    jobs: () => store.query('campus.pushJobs').map(({ value }) => value) }
  f.a = f.register('alice'); f.b = f.register('bob')
  store.insert('campus.market', { id: 'book', type: 'market', title: '书', ownerId: f.b.user.id, visibility: 'public' })
  f.chat = f.call('conversation.open', { contentType: 'market', contentId: 'book', peerUserId: f.b.user.id }, f.a)
  f.bind = (login = f.b, cid = clientId) => f.call('push.bind', { clientId: cid, platform: 'android' }, login)
  f.send = (key = 'message-1') => f.call('message.send', { conversationId: f.chat.id, body: '秘密私信正文', idempotencyKey: key }, f.a)
  return f
}

test('push binding requires a real session and cannot forge recipient ownership', (t) => {
  const f = fixture(t)
  assert.throws(() => f.call('push.status', {}), { code: 'UNAUTHENTICATED' })
  assert.deepEqual(f.call('push.status', {}, f.b), { configured: true })
  assert.throws(() => f.call('push.bind', { clientId, platform: 'android', userId: f.a.user.id }, f.b), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => f.call('push.bind', { clientId: '../fake', platform: 'android' }, f.b), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => f.call('push.bind', { clientId, platform: 'web' }, f.b), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => f.service.invoke('push.bind', { clientId, platform: 'android' }, { userId: f.b.user.id, token: f.a.token }), { code: 'UNAUTHENTICATED' })
  f.bind()
  assert.equal(f.store.query('campus.pushDevices')[0].value.userId, f.b.user.id)
})

test('committed idempotent messages enqueue once, survive restart, and never send message text', async (t) => {
  const f = fixture(t); f.bind()
  const first = f.send(); assert.equal(f.send().id, first.id)
  assert.equal(f.jobs().length, 1); assert.equal(f.sent.length, 0)
  f.reopen(); await Promise.all([f.service.push.flush(), f.service.push.flush()])
  assert.equal(f.sent.length, 1); assert.equal(f.jobs()[0].status, 'accepted')
  assert.equal(f.sent[0].payload.conversationId, f.chat.id)
  assert.equal(f.sent[0].payload.recipientId, f.b.user.id)
  assert.equal(JSON.stringify(f.sent).includes('秘密私信正文'), false)
  assert.equal(f.sent[0].force_notification, true)
  await f.service.push.flush(); assert.equal(f.sent.length, 1)
})

for (const scenario of ['read', 'logout', 'switch', 'block', 'delete', 'expire', 'private', 'disable']) {
  test(`pending system push is discarded after ${scenario}`, async (t) => {
    const f = fixture(t); f.bind(); const message = f.send()
    if (scenario === 'read') f.call('conversation.markRead', { conversationId: f.chat.id, throughMessageId: message.id }, f.b)
    if (scenario === 'logout') f.call('auth.logout', {}, f.b)
    if (scenario === 'switch') { f.bind(f.a); f.call('push.unbind', { clientId }, f.b) }
    if (scenario === 'block') f.call('user.block', { userId: f.a.user.id }, f.b)
    if (scenario === 'delete') f.call('auth.deleteAccount', { password, confirmation: '注销账号' }, f.b)
    if (scenario === 'expire') f.advance(8 * 86400000)
    if (scenario === 'private') f.store.update('campus.market', { ...f.store.get('campus.market', 'book'), visibility: 'private' })
    if (scenario === 'disable') f.call('push.unbind', { clientId }, f.b)
    await f.service.push.flush()
    assert.equal(f.sent.length, 0)
    if (scenario === 'delete') {
      assert.equal(f.jobs().length, 0); assert.equal(f.store.query('campus.pushDevices').length, 0)
    } else assert.equal(f.jobs()[0].status, 'discarded')
    if (scenario === 'switch') assert.equal(f.store.query('campus.pushDevices')[0].value.enabled, true)
  })
}

test('provider failure cannot undo a sent message; bounded retry uses the same request ID', async (t) => {
  let attempts = 0
  const requests = []
  const f = fixture(t, { send: async (message) => { requests.push(message.request_id); if (++attempts === 1) throw new Error('offline') } })
  f.bind(); f.send(); await f.service.push.flush()
  assert.equal(f.jobs()[0].status, 'pending')
  assert.equal(f.call('message.list', { conversationId: f.chat.id }, f.b).items.length, 1)
  await f.service.push.flush(); assert.equal(attempts, 1)
  f.advance(5000); await f.service.push.flush()
  assert.equal(f.jobs()[0].status, 'accepted'); assert.equal(requests[0], requests[1])
})

test('queue persistence failure rolls back message, notice and receipt as one transaction', (t) => {
  const f = fixture(t); f.bind()
  const original = f.store.insert
  f.store.insert = (collection, value) => {
    if (collection === 'campus.pushJobs') throw new Error('test disk failure')
    return original(collection, value)
  }
  assert.throws(() => f.send(), /test disk failure/)
  assert.equal(f.store.query('messages').length, 0)
  assert.equal(f.store.query('notifications').length, 0)
  assert.equal(f.store.receipt(f.a.user.id, 'message.send', 'message-1'), undefined)
  f.store.insert = original
  f.send(); assert.equal(f.jobs().length, 1)
})

test('each active recipient device receives one task; same-account refresh preserves queued tasks', async (t) => {
  const f = fixture(t); f.bind(); f.bind(f.b, 'second-device-002'); f.bind(f.a, 'sender-device-003')
  f.send(); f.bind(); await f.service.push.flush()
  assert.equal(f.sent.length, 2)
  assert.deepEqual(new Set(f.sent.map((m) => m.push_clientid)), new Set([clientId, 'second-device-002']))
})

test('missing server push setup is explicit and does not simulate delivery', (t) => {
  const f = fixture(t)
  const service = createCampusService({ store: f.store, uploadsDir: join(f.directory, 'uploads') })
  assert.deepEqual(service.invoke('push.status', {}, { userId: f.b.user.id, token: f.b.token }), { configured: false })
  assert.throws(() => service.invoke('push.bind', { clientId, platform: 'ios' }, { userId: f.b.user.id, token: f.b.token }), { code: 'NOT_IMPLEMENTED' })
})

test('bridge adapter signs the exact body, limits network waits and rejects false success', async () => {
  const secret = 's'.repeat(40), env = { CAMPUS_PUSH_BRIDGE_URL: 'https://push.example/bridge', CAMPUS_PUSH_BRIDGE_SECRET: secret }
  let request
  const provider = createPushBridge({ env, fetcher: async (url, options) => {
    request = options; return { ok: true, json: async () => ({ code: 'OK' }) }
  } })
  await provider.send({ request_id: 'a'.repeat(32) })
  assert.equal(request.headers['X-Campus-Signature'], createHmac('sha256', secret).update(request.body).digest('hex'))
  assert.equal(request.redirect, 'error'); assert.ok(request.signal)
  assert.equal(createPushBridge({ env: {} }), null)
  assert.throws(() => createPushBridge({ env: { ...env, CAMPUS_PUSH_BRIDGE_URL: 'http://unsafe.example' } }))
  const failed = createPushBridge({ env, fetcher: async () => ({ ok: true, json: async () => ({ code: 'NOT_CONFIGURED' }) }) })
  await assert.rejects(failed.send({}), /PUSH_PROVIDER_UNAVAILABLE/)
})

const require = createRequire(import.meta.url)
const { createHandler } = require('../uniCloud-aliyun/cloudfunctions/campus-system-push/index.js')
function bridgeFixture() {
  const secret = 's'.repeat(40), receipts = new Map(), sent = []
  const db = { collection: () => ({
    doc: (id) => ({ get: async () => ({ data: receipts.has(id) ? [receipts.get(id)] : [] }),
      update: async (v) => receipts.set(id, { ...receipts.get(id), ...v }), remove: async () => receipts.delete(id) }),
    add: async (v) => { if (receipts.has(v._id)) throw new Error('duplicate'); receipts.set(v._id, v) }
  }) }
  const handler = createHandler({ secret, appId: '__UNI__TEST', db, manager: { sendMessage: async (m) => { sent.push(m); return { errCode: 0 } } } })
  const message = { push_clientid: clientId, request_id: 'a'.repeat(32), settings: { ttl: 3600000 },
    payload: { type: 'private-message', recipientId: 'bob', conversationId: 'chat', messageId: 'message' } }
  const request = (overrides = {}) => {
    const body = JSON.stringify({ timestamp: Date.now(), nonce: 'test-nonce', message, ...overrides })
    return { httpMethod: 'POST', body, headers: { 'X-Campus-Signature': createHmac('sha256', secret).update(body).digest('hex') } }
  }
  return { handler, request, sent, receipts }
}
test('uniCloud bridge rejects forged signatures, stale requests and untargeted broadcasts', async () => {
  const f = bridgeFixture()
  const bad = f.request(); bad.headers['X-Campus-Signature'] = 'b'.repeat(64)
  assert.equal((await f.handler(bad)).statusCode, 403)
  assert.equal((await f.handler(f.request({ timestamp: 1 }))).statusCode, 400)
  assert.equal((await f.handler(f.request({ message: { title: 'broadcast' } }))).statusCode, 400)
  assert.equal(f.sent.length, 0)
})
test('uniCloud bridge deduplicates signed replay and builds only fixed private-message notifications', async () => {
  const f = bridgeFixture(), request = f.request()
  assert.equal((await f.handler(request)).statusCode, 200)
  assert.equal((await f.handler(request)).statusCode, 200)
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].content, '你收到一条新私信，点击查看')
  assert.equal(f.sent[0].options.android['/notification/channel_id'], 'campus_private_messages_v1')
})
