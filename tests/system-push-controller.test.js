import test from 'node:test'
import assert from 'node:assert/strict'
import { createSystemPushController } from '../src/utils/system-push-controller.js'
import { appBuildOptions } from '../scripts/app-build-options.mjs'

const turn = () => new Promise((resolve) => setImmediate(resolve))
function fixture() {
  const state = {}, calls = [], choices = new Set()
  let user = { userId: 'alice', key: 'alice-token' }, allowed = true, configured = true, listener, requests = 0, cid = async () => 'test-client-id'
  const controller = createSystemPushController({ state, identity: () => user,
    optedIn: (id) => choices.has(id.userId), saveOptIn: (id, value) => { value ? choices.add(id.userId) : choices.delete(id.userId) },
    permission: async () => allowed, requestPermission: async () => { requests++ }, clientId: () => cid(), platform: () => 'android',
    api: { status: async () => ({ configured }), bind: async (p) => calls.push(['bind', user.userId, p]), unbind: async (p) => calls.push(['unbind', user.userId, p]) },
    listen: (fn) => { listener = fn }, open: async (id, current) => { if (current()) calls.push(['open', user.userId, id]) },
    login: () => calls.push(['login']), clearNotifications: () => calls.push(['clear']), refreshed: () => calls.push(['refresh']) })
  return { state, calls, choices, controller, setUser: (value) => { user = value }, setAllowed: (value) => { allowed = value },
    setConfigured: (value) => { configured = value }, setCid: (value) => { cid = value }, get requests() { return requests },
    click: (p = {}) => listener({ type: 'click', data: { payload: { type: 'private-message', recipientId: 'alice', conversationId: 'chat-1', messageId: 'm-1', ...p } } }),
    event: (e) => listener(e) }
}

test('launch does not prompt or bind without consent; explicit enable binds only after permission', async () => {
  const f = fixture(); f.controller.start(); f.controller.start(); await f.controller.changed()
  assert.equal(f.requests, 0); assert.equal(f.calls.length, 0)
  await f.controller.enable()
  assert.equal(f.requests, 1); assert.equal(f.state.enabled, true); assert.equal(f.choices.has('alice'), true)
  assert.equal(f.calls[0][0], 'bind')
  await f.controller.disable()
  assert.equal(f.state.enabled, false); assert.equal(f.choices.has('alice'), false)
  assert.equal(f.calls[1][0], 'unbind')
})

test('missing provider or denied phone permission cannot display a success state', async () => {
  const f = fixture(); f.setConfigured(false); await f.controller.enable()
  assert.equal(f.requests, 0); assert.equal(f.state.enabled, false); assert.equal(f.state.configured, false)
  f.setConfigured(true); f.setAllowed(false); await f.controller.enable()
  assert.equal(f.state.permission, false); assert.equal(f.state.enabled, false); assert.equal(f.calls.length, 0)
})

test('revoking system permission unregisters a previous binding on resume', async () => {
  const f = fixture(); await f.controller.enable(); f.setAllowed(false); await f.controller.resume()
  assert.equal(f.calls.at(-1)[0], 'unbind'); assert.equal(f.state.enabled, false)
})

test('account switch during device-ID acquisition cannot bind the old account or inherit its consent', async () => {
  const f = fixture(); let ready
  f.setCid(() => new Promise((resolve) => { ready = resolve }))
  const enable = f.controller.enable(); await turn()
  f.setUser({ userId: 'bob', key: 'bob-token' }); const switched = f.controller.changed()
  ready('test-client-id'); await Promise.all([enable, switched])
  assert.equal(f.calls.filter(([name]) => name === 'bind').length, 0)
  assert.equal(f.state.enabled, false); assert.equal(f.choices.size, 0)
})

test('account switch during permission-revocation cleanup cannot unbind the new account', async () => {
  const f = fixture(); await f.controller.enable(); f.setAllowed(false); let ready
  f.setCid(() => new Promise((resolve) => { ready = resolve }))
  const resume = f.controller.resume(); await turn()
  f.setUser({ userId: 'bob', key: 'bob-token' }); const switched = f.controller.changed()
  ready('test-client-id'); await Promise.all([resume, switched])
  assert.equal(f.calls.filter(([name]) => name === 'unbind').length, 0)
})

test('notification click validates account and identifiers and never follows an arbitrary route', async () => {
  const f = fixture(); f.controller.start()
  f.click({ recipientId: 'bob' }); f.click({ conversationId: '../outside', messageId: 'm-2' })
  f.event({ type: 'click', data: '{broken' }); await turn()
  assert.equal(f.calls.length, 0)
  f.click({ messageId: 'm-3', url: 'https://evil.example' }); await turn(); f.click({ messageId: 'm-3' }); await turn()
  assert.deepEqual(f.calls, [['open', 'alice', 'chat-1']])
})

test('cold-start click waits for login restoration and preserves the target only for its recipient', async () => {
  const f = fixture(); f.setUser(null); f.controller.start(); await f.controller.changed()
  f.click(); await turn(); assert.deepEqual(f.calls, [['login']])
  f.setUser({ userId: 'alice', key: 'restored-token' }); await f.controller.changed()
  assert.deepEqual(f.calls.at(-1), ['open', 'alice', 'chat-1'])
})

test('App push build is explicit and requires the existing DCloud app identity', () => {
  assert.throws(() => appBuildOptions({ CAMPUS_APP_ORIGIN: 'https://example.com', CAMPUS_APP_PUSH: 'true' }), /APP_ID/)
  const options = appBuildOptions({ CAMPUS_APP_ORIGIN: 'https://example.com', CAMPUS_APP_PUSH: 'true', CAMPUS_DCLOUD_APP_ID: '__UNI__TEST' })
  assert.equal(options.push, true)
  assert.equal(appBuildOptions({ CAMPUS_APP_ORIGIN: 'https://example.com' }).push, false)
})
