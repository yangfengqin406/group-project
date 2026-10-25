import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { openCStore } from '../backend/c/store.js'
import { createCService } from '../backend/c/service.js'
import { createPlanService } from '../backend/campus/plans.js'

const fail = (run, code) => assert.throws(run, (error) => error.code === code)
function setup(t, filename = ':memory:', overrideNotify) {
  let store = openCStore(filename)
  for (const [id, skillTags, campusId, disabled] of [
    ['alice', [], 'local-campus', false], ['bob', ['摄影'], 'local-campus', false],
    ['carol', ['摄影'], 'local-campus', false], ['dora', ['摄影'], 'elsewhere', false], ['eric', ['摄影'], 'local-campus', true]
  ]) if (!store.get('campus.users', id)) store.insert('campus.users', { id, nickname: id, campusId, campusName: '本地校区', skillTags, disabled })
  let service, cService
  const create = () => {
    const accounts = {
      getUser: (id) => store.get('campus.users', id),
      publicUser: (id) => {
        const value = store.get('campus.users', id)
        return value ? { id, nickname: value.nickname, campusId: value.campusId, skillTags: value.skillTags } : null
      },
      getUploadByUrl: (url) => store.query('campus.uploads', '1', [], 'seq DESC', 100).find(({ value }) => value.url === url)?.value || null
    }
    const content = { summarize: (value) => ({ ...value, owner: accounts.publicUser(value.ownerId) }) }
    cService = createCService({ store, getUser: accounts.getUser, getExternalContent: (type, id) => store.get(`campus.${type}`, id) })
    service = createPlanService({ store, accounts, content, notify: overrideNotify || cService.notifyInTransaction })
  }
  create()
  t.after(() => store.close())
  const invoke = (method, p = {}, userId = 'alice') => service.invoke(method, p, { userId })
  return {
    invoke, get store() { return store }, get cService() { return cService },
    restart() { store.close(); store = openCStore(filename); create() }
  }
}
const payload = (changes = {}) => ({
  title: '一起去拍照', body: '图书馆门口集合', category: '摄影', location: '图书馆', images: [], capacity: 2,
  startAt: new Date(Date.now() + 86400000).toISOString(), endAt: new Date(Date.now() + 86400000 + 7200000).toISOString(), ...changes
})
function pair(f) {
  const p = payload()
  return [f.invoke('plan.create', p), f.invoke('plan.create', p, 'bob')]
}
const send = (f, target, source, key = 'send') => f.invoke('invitation.create', {
  targetPlanId: target.id, sourcePlanId: source.id, idempotencyKey: key
}, target.ownerId)
const reply = (f, invitation, action = 'accept', key = action, userId = invitation.recipientId) =>
  f.invoke('invitation.respond', { invitationId: invitation.id, action, idempotencyKey: key }, userId)
const raw = (f, plan) => f.store.get('campus.plan', plan.id)
const inviteRaw = (f, invitation) => f.store.get('campus.invitations', invitation.id)
const notifications = (f) => f.store.query('notifications', '1', [], 'seq DESC', 1000)

test('真实计划校验身份与字段，客户端不能指定作者、校区、成员或初始状态', (t) => {
  const f = setup(t)
  fail(() => f.invoke('plan.list', {}, 'missing'), 'UNAUTHENTICATED')
  fail(() => f.invoke('plan.list', {}, 'eric'), 'UNAUTHENTICATED')
  fail(() => f.invoke('plan.create', payload({ title: '短' })), 'INVALID_ARGUMENT')
  fail(() => f.invoke('plan.create', payload({ capacity: 11 })), 'INVALID_ARGUMENT')
  fail(() => f.invoke('plan.create', payload({ startAt: new Date(Date.now() - 1000).toISOString() })), 'INVALID_ARGUMENT')
  const p = f.invoke('plan.create', payload({ ownerId: 'bob', campusId: 'fake', memberIds: ['bob'], status: 'completed', roles: ['admin'] }))
  assert.equal(p.ownerId, 'alice'); assert.equal(p.campusId, 'local-campus'); assert.equal(p.status, 'open')
  assert.deepEqual(p.memberIds, ['alice']); assert.equal(p.roles, undefined)
  fail(() => f.invoke('plan.update', { ...p, title: '越权修改' }, 'bob'), 'FORBIDDEN')
  fail(() => f.invoke('plan.complete', { id: p.id }, 'bob'), 'FORBIDDEN')
})

test('私有计划无法通过详情、列表、推荐或邀请泄露；图片只接受本人已确认的真实登记', (t) => {
  const f = setup(t)
  const [target, source] = pair(f)
  f.invoke('plan.update', { ...source, visibility: 'private' }, 'bob')
  fail(() => f.invoke('plan.get', { id: source.id }), 'FORBIDDEN')
  assert.equal(f.invoke('plan.list').items.length, 1)
  assert.equal(f.invoke('plan.getCandidates', { planId: target.id }).items.length, 0)
  fail(() => send(f, target, source), 'CONFLICT')
  fail(() => f.invoke('plan.create', payload({ images: ['file:///tmp/image.png'] })), 'FORBIDDEN')
  f.store.insert('campus.uploads', { id: 'picture', url: 'http://127.0.0.1:8788/api/files/picture', ownerId: 'alice', usage: 'content', status: 'confirmed', mime: 'image/png', size: 40 })
  const url = f.store.get('campus.uploads', 'picture').url
  assert.deepEqual(f.invoke('help.create', payload({ images: [url] })).images, [url])
  fail(() => f.invoke('help.create', payload({ images: [url] }), 'bob'), 'FORBIDDEN')
  fail(() => f.invoke('help.create', payload({ images: [url, url] })), 'INVALID_ARGUMENT')
})

test('SQLite 列表游标绑定账号和筛选条件，篡改游标拒绝，新发布不造成重复翻页', (t) => {
  const f = setup(t)
  for (let i = 0; i < 3; i++) f.invoke('plan.create', payload({ title: `拍照计划${i}` }))
  const first = f.invoke('plan.list', { pageSize: 1 })
  assert.ok(first.nextCursor)
  const newer = f.invoke('plan.create', payload({ title: '后来新增计划' }))
  const second = f.invoke('plan.list', { pageSize: 2, cursor: first.nextCursor })
  assert.equal(second.items.length, 2)
  assert.ok(second.items.every((item) => item.id !== newer.id && item.id !== first.items[0].id))
  fail(() => f.invoke('plan.list', { pageSize: 1, cursor: first.nextCursor }, 'bob'), 'INVALID_ARGUMENT')
  fail(() => f.invoke('plan.list', { pageSize: 1, cursor: first.nextCursor, category: '摄影' }), 'INVALID_ARGUMENT')
  fail(() => f.invoke('plan.list', { pageSize: 1, cursor: `${first.nextCursor}x` }), 'INVALID_ARGUMENT')
})

test('推荐按北京时间同日、真重叠、同类别校区和单人来源判断，端点接触不重叠', (t) => {
  const f = setup(t)
  const target = f.invoke('plan.create', payload())
  const source = f.invoke('plan.create', payload({ startAt: target.startAt, endAt: target.endAt }), 'bob')
  const candidate = f.invoke('plan.getCandidates', { planId: target.id }).items[0]
  assert.equal(candidate.candidatePlanId, source.id)
  assert.deepEqual(candidate.overlap, { startAt: target.startAt, endAt: target.endAt })
  f.invoke('plan.create', payload({ startAt: target.startAt, endAt: target.endAt }), 'dora')
  assert.equal(f.invoke('plan.getCandidates', { planId: target.id }).items.length, 1)
  f.invoke('plan.update', { ...source, startAt: target.endAt, endAt: new Date(Date.parse(target.endAt) + 3600000).toISOString() }, 'bob')
  assert.equal(f.invoke('plan.getCandidates', { planId: target.id }).items.length, 0)
})

test('双方邀请和通知同事务持久化，同编号重试返回原结果，换参数拒绝', (t) => {
  const f = setup(t), [target, source] = pair(f)
  const invitation = send(f, target, source)
  assert.deepEqual(send(f, target, source), invitation)
  assert.equal(notifications(f).length, 1)
  fail(() => f.invoke('invitation.create', { targetPlanId: target.id, sourcePlanId: 'other', idempotencyKey: 'send' }), 'CONFLICT')
  fail(() => reply(f, invitation, 'accept', 'unauthorized', 'alice'), 'FORBIDDEN')
  fail(() => reply(f, invitation, 'cancel', 'unauthorized', 'carol'), 'FORBIDDEN')
  const result = reply(f, invitation)
  assert.equal(result.invitation.status, 'accepted')
  assert.deepEqual(reply(f, invitation), result)
  assert.equal(notifications(f).length, 2)
  assert.deepEqual(raw(f, target).memberIds, ['alice', 'bob'])
  assert.equal(raw(f, target).status, 'full')
  assert.equal(raw(f, source).status, 'closed')
  assert.equal(raw(f, source).joinedPlanId, target.id)
  fail(() => reply(f, invitation, 'reject', 'accept'), 'CONFLICT')
})

test('最后名额只能一人接受，其他旧邀请同步失效；扩容不能复活旧邀请', (t) => {
  const f = setup(t), [target, source] = pair(f)
  const third = f.invoke('plan.create', payload({ startAt: target.startAt, endAt: target.endAt }), 'carol')
  const first = send(f, target, source), second = send(f, target, third, 'second')
  reply(f, first)
  assert.equal(inviteRaw(f, second).status, 'expired')
  fail(() => reply(f, second), 'CONFLICT')
  assert.equal(raw(f, third).status, 'open')
  const expanded = f.invoke('plan.update', { ...raw(f, target), capacity: 3 })
  assert.equal(expanded.status, 'open')
  fail(() => reply(f, second), 'CONFLICT')
  assert.equal(send(f, expanded, third, 'new-after-expand').status, 'pending')
  fail(() => f.invoke('plan.update', { ...expanded, capacity: 1 }), 'INVALID_ARGUMENT')
  assert.equal(notifications(f).length, 4)
})

test('计划修改使旧邀请永久失效，关停终态不可被编辑或时间归一重新打开', (t) => {
  const f = setup(t), [target, source] = pair(f), invitation = send(f, target, source)
  f.invoke('plan.update', { ...target, category: '散步' })
  assert.equal(inviteRaw(f, invitation).status, 'expired')
  f.invoke('plan.update', target)
  assert.equal(inviteRaw(f, invitation).status, 'expired')
  f.invoke('plan.close', { id: target.id })
  assert.equal(raw(f, target).status, 'closed')
  fail(() => f.invoke('plan.update', { ...target, capacity: 3 }), 'CONFLICT')
  fail(() => f.invoke('plan.complete', { id: target.id }), 'CONFLICT')
  assert.deepEqual(send(f, target, source), invitation)
  assert.equal(inviteRaw(f, invitation).status, 'expired')
})

test('到期边界变为 expired，进行中只可保留原开始时刻并扩容，不能伪造过去时间', (t) => {
  const f = setup(t), [target] = pair(f)
  t.mock.method(Date, 'now', () => Date.parse(target.startAt) + 1000)
  const edited = f.invoke('plan.update', { ...target, body: '可以修改进行中计划', capacity: 3 })
  assert.equal(edited.capacity, 3)
  fail(() => f.invoke('plan.update', { ...edited, startAt: new Date(Date.now() - 500).toISOString() }), 'INVALID_ARGUMENT')
  t.mock.method(Date, 'now', () => Date.parse(target.endAt))
  assert.equal(f.invoke('plan.get', { id: target.id }).status, 'expired')
  fail(() => f.invoke('plan.update', payload({ id: target.id })), 'CONFLICT')
  fail(() => f.invoke('plan.complete', { id: target.id }), 'CONFLICT')
})

test('拒绝与取消使用相应身份及幂等回执，不会改变双方成员', (t) => {
  const f = setup(t), [target, source] = pair(f)
  const first = send(f, target, source), rejected = reply(f, first, 'reject')
  assert.deepEqual(reply(f, first, 'reject'), rejected)
  assert.equal(rejected.invitation.status, 'rejected')
  const second = send(f, target, source, 'send-again')
  const params = { invitationId: second.id, idempotencyKey: 'cancel-second' }
  fail(() => f.invoke('invitation.cancel', params, 'bob'), 'FORBIDDEN')
  const cancelled = f.invoke('invitation.cancel', params)
  assert.deepEqual(f.invoke('invitation.cancel', params), cancelled)
  assert.equal(cancelled.invitation.status, 'cancelled')
  assert.deepEqual(raw(f, target).memberIds, ['alice'])
  assert.deepEqual(raw(f, source).memberIds, ['bob'])
  assert.equal(notifications(f).length, 4)
})

test('通知写入失败回滚邀请、通知、状态和幂等回执，重试可以正常成功', (t) => {
  let shouldFail = true, currentStore
  const f = setup(t, ':memory:', (event) => {
    currentStore.insert('notifications', { id: event.eventId, ...event })
    if (shouldFail) throw Object.assign(new Error('storage failure'), { code: 'SERVICE_UNAVAILABLE' })
  })
  currentStore = f.store
  const [target, source] = pair(f)
  fail(() => send(f, target, source), 'SERVICE_UNAVAILABLE')
  assert.equal(f.store.query('campus.invitations').length, 0)
  assert.equal(notifications(f).length, 0)
  assert.equal(f.store.receipt('alice', 'invitation.create', 'send'), undefined)
  shouldFail = false
  const invitation = send(f, target, source)
  shouldFail = true
  fail(() => reply(f, invitation), 'SERVICE_UNAVAILABLE')
  assert.deepEqual(raw(f, target).memberIds, ['alice'])
  assert.equal(raw(f, source).status, 'open')
  assert.equal(inviteRaw(f, invitation).status, 'pending')
  assert.equal(notifications(f).length, 1)
})

test('关闭数据库重开后内容、成员、通知和幂等回执仍在，不重复确认', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'campus-plans-'))
  const f = setup(t, join(dir, 'campus.sqlite')), [target, source] = pair(f)
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const invitation = send(f, target, source), result = reply(f, invitation)
  f.restart()
  assert.equal(f.invoke('plan.get', { id: target.id }).status, 'full')
  assert.deepEqual(reply(f, invitation), result)
  assert.equal(f.invoke('invitation.list', {}, 'bob').items[0].status, 'accepted')
  assert.equal(f.cService.invoke('notification.list', {}, { userId: 'alice' }).items.length, 1)
  assert.equal(notifications(f).length, 2)
})

test('技能参考仅本人公开求助匹配真实同校区公开技能，不自动联系或暴露私有求助', (t) => {
  const f = setup(t)
  const help = f.invoke('help.create', payload())
  const matches = f.invoke('help.getCandidates', { helpId: help.id }).items
  assert.deepEqual(new Set(matches.map((value) => value.userId)), new Set(['bob', 'carol']))
  assert.ok(matches.every((value) => value.rule.includes('仅供联系参考') && value.reasons.includes('同一校区')))
  fail(() => f.invoke('help.getCandidates', { helpId: help.id }, 'bob'), 'FORBIDDEN')
  const privateHelp = f.invoke('help.update', { ...help, visibility: 'private' })
  assert.deepEqual(f.invoke('help.getCandidates', { id: privateHelp.id }).items, [])
  fail(() => f.invoke('help.get', { id: help.id }, 'bob'), 'FORBIDDEN')
  f.invoke('help.complete', { id: help.id })
  fail(() => f.invoke('help.update', help), 'CONFLICT')
  assert.equal(notifications(f).length, 0)
})

test('两个独立 SQLite worker 竞争最后名额时仅一次接受且通知不重复', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'campus-plan-race-'))
  const filename = join(dir, 'campus.sqlite'), f = setup(t, filename), [target, source] = pair(f)
  const third = f.invoke('plan.create', payload({ startAt: target.startAt, endAt: target.endAt }), 'carol')
  const invitations = [send(f, target, source), send(f, target, third, 'third')]
  const code = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { openCStore } = await import(workerData.storeUrl);
      const { createCService } = await import(workerData.cUrl);
      const { createPlanService } = await import(workerData.plansUrl);
      const store = openCStore(workerData.filename);
      const accounts = { getUser: id => store.get('campus.users', id), publicUser: id => ({id, nickname:id}) };
      const content = { summarize: value => ({...value, owner: accounts.publicUser(value.ownerId)}) };
      const c = createCService({store, getUser:accounts.getUser, getExternalContent:(type,id)=>store.get('campus.'+type,id)});
      const service = createPlanService({store,accounts,content,notify:c.notifyInTransaction});
      parentPort.once('message', () => {
        let result;
        try { result = { code:'OK', value: service.invoke('invitation.respond', {invitationId:workerData.invitation.id,action:'accept',idempotencyKey:'race'}, {userId:workerData.invitation.recipientId})}; }
        catch(error) { result = {code:error.code || error.message}; }
        store.close(); parentPort.postMessage(result);
      });
      parentPort.postMessage({ready:true});
    })().catch(error => {parentPort.postMessage({fatal:error.stack});process.exitCode=1;});
  `
  const workers = invitations.map((invitation) => new Worker(code, { eval: true, workerData: {
    filename, invitation, storeUrl: new URL('../backend/c/store.js', import.meta.url).href,
    cUrl: new URL('../backend/c/service.js', import.meta.url).href, plansUrl: new URL('../backend/campus/plans.js', import.meta.url).href
  } }))
  t.after(() => Promise.all(workers.map((worker) => worker.terminate())))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const results = await Promise.all(workers.map((worker) => new Promise((resolve, reject) => {
    worker.once('error', reject)
    worker.once('message', (value) => value.ready ? resolve(value) : reject(new Error(value.fatal || JSON.stringify(value))))
  })))
  assert.equal(results.length, 2)
  const done = workers.map((worker) => new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject) }))
  workers.forEach((worker) => worker.postMessage('go'))
  const outcomes = await Promise.all(done)
  assert.deepEqual(outcomes.map((value) => value.code).sort(), ['CONFLICT', 'OK'])
  assert.equal(raw(f, target).memberIds.length, 2)
  assert.equal(raw(f, target).status, 'full')
  assert.equal(f.store.query('campus.invitations').filter(({ value }) => value.status === 'accepted').length, 1)
  assert.equal(f.store.query('campus.invitations').filter(({ value }) => value.status === 'expired').length, 1)
  assert.equal(notifications(f).length, 3)
})
