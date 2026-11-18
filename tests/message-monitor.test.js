import test from 'node:test'
import assert from 'node:assert/strict'
import { createMessageMonitor } from '../src/utils/message-monitor.js'

const item = (message = 'm1', id = 'c1', unreadCount = 1) => ({ id, unreadCount, lastMessage: { id: message, body: '新线索' } })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function fixture() {
  const state = { total: 0, items: [], banner: null, revision: 0 }, requests = [], timers = new Map(), badges = []
  let account = 'a', timerId = 0
  const monitor = createMessageMonitor({ state, identity: () => account, badge: (n) => badges.push(n),
    read: () => { const r = deferred(); requests.push(r); return r.promise },
    schedule: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id }, cancel: (id) => timers.delete(id)
  })
  return { monitor, state, requests, timers, badges, account(value) { account = value } }
}
const flush = () => new Promise((done) => setImmediate(done))

test('新私信显示角标与可点击目标，收起后同一消息不重复提醒，新消息仍提醒', async () => {
  const f = fixture(), first = f.monitor.start(); await flush()
  assert.equal(f.monitor.refresh(), first)
  f.requests[0].resolve({ total: 1, items: [item()] }); await first
  assert.equal(f.state.banner.id, 'c1'); assert.equal(f.badges.at(-1), 1)
  assert.equal([...f.timers.values()][0].delay, 5000)
  f.monitor.dismiss()
  const again = f.monitor.refresh(); await flush(); f.requests[1].resolve({ total: 1, items: [item()] }); await again
  assert.equal(f.state.banner, null)
  const next = f.monitor.refresh(); await flush(); f.requests[2].resolve({ total: 2, items: [item('m2', 'c1', 2)] }); await next
  assert.equal(f.state.banner.lastMessage.id, 'm2'); assert.equal(f.state.total, 2)
  f.monitor.stop(); assert.equal(f.timers.size, 0)
})

test('正在阅读的会话不弹提醒，其他会话依然提示，读取后角标清除', async () => {
  const f = fixture(); f.monitor.setActive('c1')
  const first = f.monitor.start(); await flush()
  f.requests[0].resolve({ total: 2, items: [item(), item('other', 'c2')] }); await first
  assert.equal(f.state.banner.id, 'c2')
  const read = f.monitor.refresh(); await flush(); f.requests[1].resolve({ total: 0, items: [] }); await read
  assert.equal(f.state.banner, null); assert.equal(f.badges.at(-1), 0)
})

test('切账号或切后台后旧响应不能泄露消息，返回前台重新读取', async () => {
  const f = fixture(), old = f.monitor.start(); await flush()
  f.account('b'); f.monitor.reset(); const fresh = f.monitor.start(); await flush()
  f.requests[0].resolve({ total: 99, items: [item('old')] }); await old
  assert.equal(f.state.total, 0)
  f.requests[1].resolve({ total: 1, items: [item('new')] }); await fresh
  assert.equal(f.state.banner.lastMessage.id, 'new')
  const hidden = f.monitor.refresh(); await flush(); f.monitor.stop()
  f.requests[2].resolve({ total: 8, items: [item('background')] }); await hidden
  assert.equal(f.state.total, 1); assert.equal(f.timers.size, 0)
  const resume = f.monitor.start(); await flush(); f.requests[3].resolve({ total: 0, items: [] }); await resume
  assert.equal(f.state.total, 0)
})

test('网络错误保留未读、不伪造成功并延后重试；标读后旧轮询失效', async () => {
  const f = fixture(), first = f.monitor.start(); await flush()
  f.requests[0].resolve({ total: 1, items: [item()] }); await first
  const fail = f.monitor.refresh(); await flush(); f.requests[1].reject(new Error('offline')); await fail
  assert.equal(f.state.total, 1); assert.match(f.state.error, /失败/)
  assert.equal([...f.timers.values()][0].delay, 15000)
  const stale = f.monitor.refresh(); await flush(); f.monitor.invalidate()
  f.state.total = 0; f.requests[2].resolve({ total: 100, items: [item('stale')] }); await stale
  assert.equal(f.state.total, 0); assert.equal(f.timers.size, 1)
})

test('首次联系无需伪造留言也能提醒，收起后不重复，首条文字仍可提醒', async () => {
  const f = fixture()
  const contact = { id: 'c1', contentType: 'market', unreadCount: 1, unreadContact: true,
    contactRequest: { id: 'contact-1', senderId: 'buyer', createdAt: '2026-11-13T00:00:00Z' }, lastMessage: null }
  const first = f.monitor.start(); await flush()
  f.requests[0].resolve({ total: 1, items: [contact] }); await first
  assert.equal(f.state.banner.contactRequest.id, 'contact-1')
  assert.equal(f.state.hasSnapshot, true)
  const revision = f.state.revision
  f.monitor.dismiss()
  const again = f.monitor.refresh(); await flush()
  f.requests[1].resolve({ total: 1, items: [contact] }); await again
  assert.equal(f.state.banner, null)
  assert.equal(f.state.revision, revision)
  const message = f.monitor.refresh(); await flush()
  f.requests[2].resolve({ total: 1, items: [{ ...contact, lastMessage: { id: 'm1', body: '想了解一下' } }] }); await message
  assert.equal(f.state.banner.lastMessage.id, 'm1')
  assert.equal(f.state.revision, revision + 1)
  f.monitor.reset()
  assert.equal(f.state.hasSnapshot, false)
})

test('未登录时已开始的监控，再次前台启动后可读取新身份且不叠加定时器', async () => {
  const f = fixture(); f.account(null)
  await f.monitor.start()
  assert.equal(f.requests.length, 0)
  f.account('a')
  const resumed = f.monitor.start(); await flush()
  assert.equal(f.requests.length, 1)
  f.requests[0].resolve({ total: 1, items: [item()] }); await resumed
  await f.monitor.start()
  assert.equal(f.requests.length, 1)
  assert.equal(f.timers.size, 1)
  f.monitor.stop()
})

test('较新的会话列表可更新共享角标，不能被较早轮询覆盖，标读后的旧列表也不得复活', async () => {
  const f = fixture(), first = f.monitor.start(); await flush()
  f.requests[0].resolve({ total: 0, items: [] }); await first
  const stale = f.monitor.refresh(); await flush()
  const ticket = f.monitor.captureRead()
  assert.equal(f.monitor.observeConversations([item('new-from-list')], ticket), true)
  assert.equal(f.state.total, 1)
  assert.equal(f.state.banner.lastMessage.id, 'new-from-list')
  f.requests[1].resolve({ total: 0, items: [] }); await stale
  assert.equal(f.state.total, 1)
  assert.equal(f.timers.size, 1)
  const beforeRead = f.monitor.captureRead()
  f.monitor.invalidate()
  assert.equal(f.monitor.observeConversations([item('stale-list')], beforeRead), false)
  f.account('b'); f.monitor.reset(); const other = f.monitor.start(); await flush()
  f.requests[2].resolve({ total: 0, items: [] }); await other
  assert.equal(f.monitor.observeConversations([item('other-account')], ticket), false)
  f.monitor.stop()
})

test('完整未读快照在列表请求期间完成后，旧列表不能覆盖该快照', async () => {
  const f = fixture(), first = f.monitor.start(); await flush()
  const ticket = f.monitor.captureRead()
  f.requests[0].resolve({ total: 0, items: [] }); await first
  assert.equal(f.monitor.observeConversations([item('old')], ticket), false)
  assert.equal(f.state.total, 0)
  f.monitor.stop()
})
