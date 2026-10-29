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
