import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { Worker } from 'node:worker_threads'
import { openCStore } from '../backend/c/store.js'
import { createCService } from '../backend/c/service.js'
import { createCRpcHandler } from '../backend/c/rpc.js'

// These are test-only principals and upload records, never a login endpoint or
// production seed. The actual C business records are persisted in SQLite.
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-c-'))
  const filename = join(directory, 'data.sqlite')
  const users = new Map([
    ['alice', { id: 'alice', nickname: '发布者', campusId: 'north', password: 'must-not-leak' }],
    ['bob', { id: 'bob', nickname: '联系人', campusId: 'north' }],
    ['eve', { id: 'eve', nickname: '其他同学' }],
    ['admin', { id: 'admin', nickname: '审核员', roles: ['admin'] }]
  ])
  const external = new Map(['market', 'plan', 'help'].map((type) => [type, {
    id: type, type, ownerId: 'alice', title: `${type}原内容`, visibility: 'public', status: 'active'
  }]))
  const uploads = new Map([['https://files.example/item.png', {
    url: 'https://files.example/item.png', ownerId: 'alice', usage: 'content', status: 'confirmed', mime: 'image/png', size: 1024
  }]])
  let time = Date.parse('2026-10-25T00:00:00Z')
  let store, service
  function reopen() {
    store?.close()
    store = openCStore(filename)
    service = createCService({ store, getUser: (id) => users.get(id),
      getExternalContent: (type, id) => external.get(type)?.id === id ? external.get(type) : null,
      getUploadByUrl: (url) => uploads.get(url), now: () => new Date(time++).toISOString() })
  }
  reopen()
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }) })
  const call = (method, params = {}, userId = 'alice') => service.invoke(method, params, { userId })
  const lost = (extra = {}) => call('lostFound.create', {
    title: '捡到校园卡', body: '图书馆门口拾获，请核对后联系', category: 'card', lostKind: 'found',
    location: '图书馆', images: ['https://files.example/item.png'], ...extra
  })
  const open = (type = 'market', contentId = type, userId = 'bob') => call('conversation.open', {
    contentType: type, contentId, peerUserId: 'alice'
  }, userId)
  return { call, lost, open, users, uploads, external, reopen, filename,
    get store() { return store }, get service() { return service } }
}
const fails = (run, code) => assert.throws(run, { code })

test('C 持久化：重开数据库后失物、消息、通知、举报及幂等回执仍存在', (t) => {
  const f = fixture(t)
  const item = f.lost({ ownerId: 'eve', campusId: 'forged', status: 'returned' })
  assert.equal(item.ownerId, 'alice')
  assert.equal(item.campusId, 'north')
  assert.equal(item.status, 'active')
  assert.equal(item.owner.password, undefined)
  const c = f.open('lost_found', item.id)
  const params = { conversationId: c.id, body: '请问卡片背面有什么特征？', idempotencyKey: 'send-once', senderId: 'eve' }
  const m = f.call('message.send', params, 'bob')
  assert.equal(m.senderId, 'bob')
  const report = f.call('report.create', { contentType: 'lost_found', contentId: item.id, reason: '照片有个人信息' }, 'bob')
  f.reopen()
  assert.equal(f.call('lostFound.get', { id: item.id }).id, item.id)
  assert.equal(f.call('conversation.get', { id: c.id }, 'alice').lastMessage.id, m.id)
  assert.deepEqual(f.call('message.send', params, 'bob'), m)
  assert.equal(f.call('notification.list').items.length, 1)
  assert.equal(f.call('report.adminResolve', { reportId: report.id, action: 'resolve', resolution: '已联系发布者核查' }, 'admin').status, 'resolved')
})

test('C 服务端身份与会话权限：第三人不能读取、发送，公开资料不泄露凭证和角色', (t) => {
  const f = fixture(t)
  const c = f.open()
  for (const method of ['conversation.get', 'message.list', 'message.send']) {
    fails(() => f.call(method, { id: c.id, conversationId: c.id, body: '冒充', idempotencyKey: 'x', userId: 'bob' }, 'eve'), 'FORBIDDEN')
  }
  fails(() => f.service.invoke('notification.list', { userId: 'alice' }), 'UNAUTHENTICATED')
  f.users.get('eve').disabled = true
  fails(() => f.call('notification.list', {}, 'eve'), 'UNAUTHENTICATED')
  const result = f.call('conversation.get', { id: c.id }, 'bob')
  assert.equal(result.peer.password, undefined)
  assert.equal(result.peer.roles, undefined)
  assert.equal(result.uniqueKey, undefined)
  assert.equal(f.open().id, c.id)
  fails(() => f.call('conversation.open', { contentType: 'market', contentId: 'market', peerUserId: 'eve' }, 'bob'), 'INVALID_ARGUMENT')
})

test('C 图片边界：临时地址、未确认、他人、非图片、过大及缺失适配均拒绝', (t) => {
  const f = fixture(t)
  for (const images of [[], ['blob:local'], ['http://files.example/item.png'], ['https://files.example/unregistered.png'], Array(4).fill('https://files.example/item.png')]) {
    assert.throws(() => f.lost({ images }))
  }
  const record = f.uploads.get('https://files.example/item.png')
  for (const invalid of [{ ownerId: 'bob' }, { status: 'pending' }, { mime: 'image/svg+xml' }, { size: 6 * 1024 * 1024 }, { usage: 'avatar' }]) {
    const old = { ...record }
    Object.assign(record, invalid)
    fails(() => f.lost(), 'FORBIDDEN')
    Object.assign(record, old)
  }
  const missing = createCService({ store: f.store, getUser: (id) => f.users.get(id) })
  fails(() => missing.invoke('lostFound.create', { title: '校园卡', lostKind: 'lost', category: 'card', images: [record.url] }, { userId: 'alice' }), 'SERVICE_UNAVAILABLE')
  assert.equal(f.call('lostFound.list').items.length, 0)
})

test('C 三分类、丢失/拾获、可见性及搜索先筛选再分页', (t) => {
  const f = fixture(t)
  const card = f.lost()
  f.lost({ title: '丢失钥匙', category: 'key', lostKind: 'lost' })
  f.lost({ title: '捡到雨伞', category: 'misc' })
  const hidden = f.lost({ title: '私人物品', visibility: 'private' })
  assert.equal(f.call('lostFound.list', { category: 'card', keyword: '校园' }, 'bob').items[0].id, card.id)
  assert.equal(f.call('lostFound.list', { lostKind: 'lost' }, 'bob').items.length, 1)
  assert.equal(f.call('lostFound.list', {}, 'bob').items.length, 3)
  assert.equal(f.call('lostFound.list').items.length, 4)
  fails(() => f.call('lostFound.get', { id: hidden.id }, 'bob'), 'FORBIDDEN')
  fails(() => f.open('lost_found', hidden.id), 'FORBIDDEN')
  fails(() => f.call('report.create', { contentType: 'lost_found', contentId: hidden.id, reason: '通过编号猜测' }, 'bob'), 'FORBIDDEN')
})

test('C 归还：仅作者更新、终态不恢复、重复确认不重复通知', (t) => {
  const f = fixture(t)
  const item = f.lost()
  const c = f.open('lost_found', item.id)
  fails(() => f.call('lostFound.markReturned', { id: item.id }, 'bob'), 'FORBIDDEN')
  const returned = f.call('lostFound.markReturned', { id: item.id })
  assert.equal(returned.status, 'returned')
  assert.equal(f.call('lostFound.markReturned', { id: item.id }).returnedAt, returned.returnedAt)
  fails(() => f.call('lostFound.update', { id: item.id, status: 'active', title: '重新打开' }), 'CONFLICT')
  const notes = f.call('notification.list', {}, 'bob').items
  assert.equal(notes.length, 1)
  assert.equal(notes[0].conversationId, c.id)
  assert.equal(f.call('message.send', { conversationId: c.id, body: '谢谢，已经拿到了', idempotencyKey: 'thanks' }, 'bob').body, '谢谢，已经拿到了')
})

test('C 历史联系：二手、搭子、互助及失物统一会话，原内容私有/删除后只读历史', (t) => {
  const f = fixture(t)
  for (const type of ['market', 'plan', 'help']) {
    const c = f.open(type)
    const params = { conversationId: c.id, body: '你好，还方便联系吗？', idempotencyKey: type }
    f.call('message.send', params, 'bob')
    f.external.get(type).visibility = 'private'
    assert.equal(f.call('message.list', { conversationId: c.id }, 'bob').items.length, 1)
    fails(() => f.call('message.send', { ...params, idempotencyKey: `${type}-new` }, 'bob'), 'FORBIDDEN')
    f.external.delete(type)
    assert.equal(f.call('conversation.get', { id: c.id }, 'bob').contentId, type)
    fails(() => f.call('message.send', { ...params, idempotencyKey: `${type}-deleted` }, 'bob'), 'NOT_FOUND')
    assert.equal(f.call('message.send', params, 'bob').body, params.body)
  }
  f.open('lost_found', f.lost().id)
  const first = f.call('conversation.list', { contentType: 'market', pageSize: 1 }, 'bob')
  assert.equal(first.items.length, 1)
  assert.equal(first.items[0].contentType, 'market')
  assert.equal(first.nextCursor, null)
  assert.equal(f.call('conversation.list', {}, 'bob').items.length, 4)
  assert.equal(f.call('conversation.list', {}, 'eve').items.length, 0)
})

test('C 留言幂等参数绑定和数据库事务：失败不得只写消息漏通知', (t) => {
  const f = fixture(t)
  const c = f.open()
  const params = { conversationId: c.id, body: '原留言', idempotencyKey: 'same-key' }
  const sent = f.call('message.send', params, 'bob')
  assert.equal(f.call('message.send', params, 'bob').id, sent.id)
  fails(() => f.call('message.send', { ...params, body: '改成另一条' }, 'bob'), 'CONFLICT')
  const other = f.open('plan')
  fails(() => f.call('message.send', { ...params, conversationId: other.id }, 'bob'), 'CONFLICT')
  f.users.delete('alice')
  fails(() => f.call('message.send', { ...params, body: '必须回滚', idempotencyKey: 'rollback' }, 'bob'), 'NOT_FOUND')
  assert.equal(f.call('message.list', { conversationId: c.id }, 'bob').items.length, 1)
  assert.equal(f.store.receipt('bob', 'message.send', 'rollback'), undefined)
})

test('C 消息游标在新留言插入后不跳过旧记录，不能跨账号/会话或篡改', (t) => {
  const f = fixture(t)
  const c = f.open()
  const send = (i) => f.call('message.send', { conversationId: c.id, body: `线索${i}`, idempotencyKey: `page-${i}` }, 'bob')
  const old = [send(1), send(2), send(3)]
  const first = f.call('message.list', { conversationId: c.id, pageSize: 2 }, 'bob')
  send(4)
  f.reopen()
  const next = f.call('message.list', { conversationId: c.id, pageSize: 2, cursor: first.nextCursor }, 'bob')
  assert.deepEqual([...first.items, ...next.items].map((m) => m.id), old.reverse().map((m) => m.id))
  fails(() => f.call('message.list', { conversationId: c.id, cursor: first.nextCursor }, 'alice'), 'INVALID_ARGUMENT')
  fails(() => f.call('message.list', { conversationId: f.open('plan').id, cursor: first.nextCursor }, 'bob'), 'INVALID_ARGUMENT')
  for (const cursor of ['garbage', `${first.nextCursor}x`, first.nextCursor.replace(/^[^.]+/, 'eyJzZXEiOjF9')])
    fails(() => f.call('message.list', { conversationId: c.id, cursor }, 'bob'), 'INVALID_ARGUMENT')
  for (const pageSize of [0, -1, 51, 1.5, '20']) fails(() => f.call('message.list', { conversationId: c.id, pageSize }, 'bob'), 'INVALID_ARGUMENT')
})

test('C 评论、站内通知、管理员举报处理和订阅边界', (t) => {
  const f = fixture(t)
  const item = f.lost()
  const params = { contentType: 'lost_found', contentId: item.id }
  f.call('comment.create', { ...params, body: '这是我的卡，请私信核对' }, 'bob')
  f.call('comment.create', { ...params, body: '好的，已联系' })
  assert.equal(f.call('comment.list', params, 'bob').items.length, 2)
  const n = f.call('notification.list').items[0]
  fails(() => f.call('notification.markRead', { notificationId: n.id }, 'bob'), 'FORBIDDEN')
  assert.equal(f.call('notification.markRead', { notificationId: n.id }).read, true)
  const r = f.call('report.create', { ...params, reason: '请遮挡证件号码' }, 'bob')
  const resolve = { reportId: r.id, action: 'dismiss', resolution: '经核对未展示证件号码', roles: ['admin'] }
  fails(() => f.call('report.adminResolve', resolve, 'bob'), 'FORBIDDEN')
  f.call('report.adminResolve', resolve, 'admin')
  f.call('report.adminResolve', resolve, 'admin')
  fails(() => f.call('report.adminResolve', { ...resolve, action: 'resolve' }, 'admin'), 'CONFLICT')
  assert.equal(f.call('notification.list', {}, 'bob').items.length, 1)
  const event = { eventId: 'A:invitation:accepted:1', recipientId: 'bob', title: '搭子邀请已接受', contentType: 'plan', contentId: 'plan' }
  assert.equal(f.service.notify(event).id, f.service.notify(event).id)
  fails(() => f.call('notification.notify', event), 'NOT_IMPLEMENTED')
  fails(() => f.call('subscription.send', {}), 'NOT_IMPLEMENTED')
})

test('C 两个数据库连接同时重试同一留言：只落一条消息和一条通知', async (t) => {
  const f = fixture(t)
  const c = f.open()
  const barrier = new SharedArrayBuffer(4)
  const workers = [1, 2].map(() => new Worker(new URL('./fixtures/c-send-worker.js', import.meta.url), {
    workerData: { filename: f.filename, conversationId: c.id, barrier }
  }))
  t.after(async () => { await Promise.all(workers.map((worker) => worker.terminate())) })
  const completed = workers.map((worker) => Promise.all([once(worker, 'message'), once(worker, 'exit')]).then(([[value], [code]]) => {
    assert.equal(value.error, undefined, value.error)
    assert.equal(code, 0)
    return value.id
  }))
  Atomics.store(new Int32Array(barrier), 0, 1)
  Atomics.notify(new Int32Array(barrier), 0)
  const ids = await Promise.all(completed)
  assert.equal(ids[0], ids[1])
  assert.equal(f.call('message.list', { conversationId: c.id }, 'bob').items.length, 1)
  assert.equal(f.call('notification.list').items.length, 1)
})

test('C HTTP RPC：可信认证、统一错误封装、非法 JSON 和内部错误不暴露数据', async (t) => {
  const f = fixture(t)
  const logs = []
  const server = createServer(createCRpcHandler({ service: f.service,
    authenticate: (token) => token === 'test-only-bob' ? { userId: 'bob' } : null,
    onError: (entry) => logs.push(entry) }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const endpoint = `http://127.0.0.1:${server.address().port}/rpc`
  const request = async (body, token = 'test-only-bob') => (await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body
  })).json()
  const success = await request(JSON.stringify({ method: 'conversation.list', params: { userId: 'alice' } }))
  assert.equal(success.code, 'OK')
  assert.deepEqual(success.data.items, [])
  assert.equal(typeof success.requestId, 'string')
  assert.equal((await request('invalid')).code, 'INVALID_ARGUMENT')
  const oversized = await request(JSON.stringify({ method: 'message.send', params: { body: 'x'.repeat(70 * 1024) } }))
  assert.equal(oversized.code, 'INVALID_ARGUMENT')
  assert.equal((await request('{}', 'invalid-token')).code, 'UNAUTHENTICATED')
  assert.equal((await request('"x"')).code, 'INVALID_ARGUMENT')
  assert.equal((await request(JSON.stringify({ method: 'notify', params: {} }))).code, 'NOT_IMPLEMENTED')
  f.users.set('bob', { get id() { throw new Error('SECRET-DB-PATH') } })
  const failed = await request(JSON.stringify({ method: 'notification.list' }))
  assert.equal(failed.code, 'SERVICE_UNAVAILABLE')
  assert.equal(JSON.stringify(failed).includes('SECRET'), false)
  assert.deepEqual(Object.keys(logs[0]).sort(), ['code', 'requestId'])
})
