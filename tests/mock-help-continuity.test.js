import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'

const author = 'user_demo_a', helper = 'user_demo_b', other = 'user_demo_c'
const now = Date.parse('2026-10-28T09:00:00+08:00')
const fail = (run, code) => assert.throws(run, error => error.code === code)
const payload = (title = '需要同学讲解一道题', changes = {}) => ({ title, body: '可以一起讨论题目', category: '学习', location: '图书馆', images: [], ...changes })
function fixture() {
  const db = createSeed()
  db.contents.help = []
  return { db, run(method, params = {}, userId = author, clock = now) {
    db.currentUserId = userId
    return dispatch(db, method, params, { now: clock })
  } }
}
const mine = (f, scope, userId = author, rest = {}) => f.run('help.listMine', { scope, ...rest }, userId)
const apply = (f, help, applicant = helper, key = `apply-${help.id}`) => f.run('help.apply', { helpId: help.id, idempotencyKey: key }, applicant).application
const select = (f, help, app) => f.run('help.selectHelper', { helpId: help.id, applicationId: app.id, idempotencyKey: `select-${app.id}` }, help.ownerId)
const confirm = (f, help, app, actor) => f.run('help.confirmCompletion', { helpId: help.id, applicationId: app.id, idempotencyKey: `confirm-${app.id}-${actor}` }, actor)
const cancel = (f, help, app, actor = app.helperId) => f.run('help.cancelCooperation', { helpId: help.id, applicationId: app.id, idempotencyKey: `cancel-${app.id}` }, actor)

test('演示求助说明可选、旧记录兼容，更新保留未提供字段且严格限制输入', () => {
  const f = fixture()
  const old = f.run('help.create', payload())
  assert.equal(old.preferredTime, '')
  assert.equal(old.estimatedMinutes, null)
  assert.equal(old.meetingMode, 'flexible')
  const filled = f.run('help.create', payload('请教编程课的小问题', { preferredTime: '  周六下午，时间可商量  ', estimatedMinutes: 45, meetingMode: 'online' }))
  assert.equal(filled.preferredTime, '周六下午，时间可商量')
  assert.equal(filled.estimatedMinutes, 45)
  assert.equal(filled.meetingMode, 'online')
  const updated = f.run('help.update', { ...payload('补充一下题目说明'), id: filled.id })
  assert.equal(updated.preferredTime, filled.preferredTime)
  assert.equal(updated.estimatedMinutes, filled.estimatedMinutes)
  assert.equal(updated.meetingMode, filled.meetingMode)
  const cleared = f.run('help.update', { ...payload(), id: filled.id, preferredTime: '', estimatedMinutes: null, meetingMode: 'flexible' })
  assert.equal(cleared.preferredTime, '')
  assert.equal(cleared.estimatedMinutes, null)
  for (const changes of [
    { preferredTime: 3 }, { preferredTime: null }, { preferredTime: '字'.repeat(81) },
    { estimatedMinutes: 0 }, { estimatedMinutes: 481 }, { estimatedMinutes: 1.5 }, { estimatedMinutes: '30' },
    { meetingMode: 'anywhere' }, { meetingMode: null }
  ]) {
    const count = f.db.contents.help.length
    fail(() => f.run('help.create', payload('字段校验不应落库', changes)), 'INVALID_ARGUMENT')
    assert.equal(f.db.contents.help.length, count)
  }
  const application = apply(f, filled)
  select(f, filled, application)
  fail(() => f.run('help.update', { ...payload(), id: filled.id, estimatedMinutes: 10 }), 'CONFLICT')
})

test('演示helpProgress从选定申请转换，所有公共摘要只加进度和说明，不带申请隐私', () => {
  const f = fixture(), help = f.run('help.create', payload('需要一起看一下摄影作品', { meetingMode: 'offline' }))
  f.run('favorite.set', { contentType: 'help', contentId: help.id, selected: true }, other)
  const progress = expected => {
    const results = [
      f.run('help.get', { id: help.id }),
      f.run('help.list').items.find(item => item.id === help.id),
      f.run('myContent.list').items.find(item => item.id === help.id),
      f.run('user.listPublicContent', { userId: author }, other).items.find(item => item.id === help.id),
      f.run('favorite.list', {}, other).items.find(item => item.contentId === help.id).content
    ]
    for (const item of results) {
      assert.equal(item.helpProgress, expected)
      assert.equal(item.meetingMode, 'offline')
      for (const privateKey of ['application', 'applications', 'pendingCount', 'ownerConfirmedAt', 'helperConfirmedAt', 'helper', 'helperId'])
        assert.equal(Object.hasOwn(item, privateKey), false, `公共摘要不应含${privateKey}`)
    }
  }
  progress('waiting')
  const application = apply(f, help)
  progress('waiting')
  select(f, help, application)
  progress('helping')
  confirm(f, help, application, helper)
  progress('awaiting_confirmation')
  confirm(f, help, application, author)
  progress('resolved')
  const selfSolved = f.run('help.create', payload('已经自行解决的问题'))
  assert.equal(f.run('help.complete', { id: selfSolved.id }).helpProgress, 'resolved')
  const reopened = f.run('help.create', payload('临时帮忙后又撤回的需求'))
  const withdrawn = apply(f, reopened)
  select(f, reopened, withdrawn)
  cancel(f, reopened, withdrawn)
  assert.equal(f.run('help.get', { id: reopened.id }).helpProgress, 'waiting')
})

test('演示我的互助待办只包含本人选人或本人待确认，已确认等对方与终态仅留历史', () => {
  const f = fixture(), help = f.run('help.create', payload())
  assert.equal(mine(f, 'todo').items.length, 0)
  const application = apply(f, help)
  assert.equal(mine(f, 'todo', helper).items.length, 0)
  const choose = mine(f, 'todo').items[0]
  assert.equal(choose.helpId, help.id)
  assert.equal(choose.role, 'owner')
  assert.equal(choose.pendingCount, 1)
  assert.equal(choose.actionLabel, '选择帮助者')
  select(f, help, application)
  for (const actor of [author, helper]) {
    const waiting = mine(f, 'todo', actor).items[0]
    assert.equal(waiting.actionLabel, '确认已解决')
    assert.equal(waiting.progress, 'helping')
  }
  assert.equal(Object.hasOwn(mine(f, 'todo', helper).items[0], 'pendingCount'), false)
  confirm(f, help, application, author)
  assert.equal(mine(f, 'todo').items.length, 0)
  assert.equal(mine(f, 'posted').items[0].progress, 'awaiting_confirmation')
  assert.equal(mine(f, 'todo', helper).items[0].actionRequired, true)
  confirm(f, help, application, helper)
  assert.equal(mine(f, 'todo').items.length, 0)
  assert.equal(mine(f, 'todo', helper).items.length, 0)
  assert.equal(mine(f, 'posted').items[0].progress, 'resolved')
  assert.equal(mine(f, 'applied', helper).items[0].progress, 'resolved')
  assert.equal(mine(f, 'posted', helper).items.length, 0)
  assert.equal(mine(f, 'applied', author).items.length, 0)
})

test('演示撤回重申请同帖仅保留最新申请，取消后旧确认不产生待办', () => {
  const f = fixture(), help = f.run('help.create', payload())
  const old = apply(f, help, helper, 'first-application')
  select(f, help, old)
  confirm(f, help, old, author)
  cancel(f, help, old)
  assert.equal(mine(f, 'todo', helper).items.length, 0)
  const history = mine(f, 'applied', helper).items[0]
  assert.equal(history.progress, 'closed')
  const latest = apply(f, help, helper, 'fresh-application')
  const applied = mine(f, 'applied', helper)
  assert.equal(applied.items.length, 1)
  assert.equal(applied.items[0].application.id, latest.id)
  assert.equal(applied.items[0].application.ownerConfirmedAt, null)
  assert.equal(mine(f, 'todo').items[0].actionLabel, '选择帮助者')
  select(f, help, latest)
  assert.equal(mine(f, 'todo').items[0].actionRequired, true)
  fail(() => confirm(f, help, old, helper), 'CONFLICT')
  assert.equal(mine(f, 'todo', helper).items[0].application.id, latest.id)
})

test('演示私有/删除/注销原帖只返回本人申请占位，不泄作者资料和私有内容', () => {
  const f = fixture(), help = f.run('help.create', payload('私有标题不可泄露', { preferredTime: '私有时间' }))
  apply(f, help)
  const stored = f.db.contents.help.find(item => item.id === help.id)
  const checkPlaceholder = () => {
    const entry = mine(f, 'applied', helper).items[0]
    assert.equal(entry.availability, 'unavailable')
    assert.equal(entry.help, null)
    assert.equal(entry.progress, 'unavailable')
    assert.equal(entry.actionRequired, false)
    assert.deepEqual(Object.keys(entry.application).sort(), ['id', 'helpId', 'helperId', 'status', 'createdAt', 'updatedAt'].sort())
    assert.equal(JSON.stringify(entry).includes('私有标题不可泄露'), false)
    assert.equal(JSON.stringify(entry).includes('私有时间'), false)
    assert.equal(JSON.stringify(entry).includes(f.db.users.find(user => user.id === author).nickname), false)
    assert.equal(mine(f, 'todo', helper).items.length, 0)
  }
  stored.visibility = 'private'
  checkPlaceholder()
  assert.equal(mine(f, 'posted').items[0].help.title, help.title)
  stored.visibility = 'public'
  stored.deletedAt = new Date(now).toISOString()
  checkPlaceholder()
  assert.equal(mine(f, 'posted').items.length, 0)
  delete stored.deletedAt
  f.db.users.find(user => user.id === author).disabled = true
  checkPlaceholder()
  f.db.users.find(user => user.id === author).disabled = false
  f.db.contents.help = []
  checkPlaceholder()
})

test('演示我的互助先按当前scope筛选去重再分页，游标拒绝改动或跨账号scope', () => {
  const f = fixture()
  for (let index = 0; index < 4; index++) {
    const help = f.run('help.create', payload(`第${index}项互助需求`), author, now + index * 1000)
    if (index < 3) apply(f, help)
  }
  const first = mine(f, 'todo', author, { pageSize: 1 })
  assert.equal(first.items.length, 1)
  assert.ok(first.nextCursor)
  const ids = [first.items[0].helpId]
  const second = mine(f, 'todo', author, { pageSize: 1, cursor: first.nextCursor })
  ids.push(second.items[0].helpId)
  const third = mine(f, 'todo', author, { pageSize: 1, cursor: second.nextCursor })
  ids.push(third.items[0].helpId)
  assert.equal(new Set(ids).size, 3)
  assert.equal(third.nextCursor, null)
  assert.equal(mine(f, 'posted').items.length, 4)
  fail(() => mine(f, 'posted', author, { cursor: first.nextCursor }), 'INVALID_ARGUMENT')
  fail(() => mine(f, 'todo', helper, { cursor: first.nextCursor }), 'INVALID_ARGUMENT')
  fail(() => mine(f, 'todo', author, { cursor: first.nextCursor + 'modified' }), 'INVALID_ARGUMENT')
  fail(() => mine(f, 'todo', author, { cursor: '{}' }), 'INVALID_ARGUMENT')
  const newest = f.run('help.create', payload('分页期间新增的需求'), author, now + 10000)
  apply(f, newest)
  const afterInsert = mine(f, 'todo', author, { pageSize: 50, cursor: first.nextCursor })
  assert.equal(afterInsert.items.some(entry => entry.helpId === first.items[0].helpId || entry.helpId === newest.id), false)
  const applied = mine(f, 'applied', helper, { pageSize: 1 })
  assert.ok(applied.nextCursor)
  assert.equal(applied.items[0].role, 'helper')
})

test('演示我的互助不能指定身份或非法分页参数，默认仅当前账号待办', () => {
  const f = fixture(), help = f.run('help.create', payload())
  apply(f, help)
  assert.equal(f.run('help.listMine').items[0].helpId, help.id)
  for (const params of [{ ownerId: author }, { helperId: helper }, { userId: author }, { scope: 'all' },
    { scope: null }, { pageSize: null }, { pageSize: 0 }, { pageSize: 51 }, { pageSize: '2' }, { cursor: 1 }])
    fail(() => f.run('help.listMine', params, helper), 'INVALID_ARGUMENT')
  assert.equal(mine(f, 'todo', helper).items.length, 0)
  assert.equal(mine(f, 'applied', helper).items[0].application.helperId, helper)
})
