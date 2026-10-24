import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'

const failCode = (run, code) =>
  assert.throws(run, (error) => error.code === code)
const fixture = () => {
  const db = createSeed()
  const [target, source, third] = db.contents.plan
  return { db, target, source, third }
}
const edits = (plan, changes = {}) => ({
  id: plan.id,
  title: plan.title,
  body: plan.body,
  category: plan.category,
  location: plan.location,
  startAt: plan.startAt,
  endAt: plan.endAt,
  capacity: plan.capacity,
  ...changes
})
const invite = (db, target, source, key = 'send') =>
  dispatch(db, 'invitation.create', {
    targetPlanId: target.id,
    sourcePlanId: source.id,
    idempotencyKey: key
  })
const respond = (db, invitation, action = 'accept', key = action) =>
  dispatch(db, 'invitation.respond', {
    invitationId: invitation.id,
    action,
    idempotencyKey: key
  })
const storedInvitation = (db, invitation) =>
  db.invitations.find((item) => item.id === invitation.id)

test('推荐不泄露私有候选，自己的私有目标也不能获取推荐或发送邀请', () => {
  const { db, target, source } = fixture()
  source.visibility = 'private'
  assert.deepEqual(dispatch(db, 'plan.getCandidates', { planId: target.id }).items, [])
  failCode(() => invite(db, target, source), 'CONFLICT')
  source.visibility = 'public'
  target.visibility = 'private'
  assert.deepEqual(dispatch(db, 'plan.getCandidates', { planId: target.id }).items, [])
  failCode(() => invite(db, target, source), 'CONFLICT')
  assert.equal(db.invitations.length, 0)
  assert.equal(db.notifications.length, 0)
})

test('推荐排除已加入目标的同学、有加入记录及没有空位的单人候选', () => {
  const { db, target, source } = fixture()
  target.capacity = 3
  target.memberIds.push(source.ownerId)
  assert.equal(dispatch(db, 'plan.getCandidates', { planId: target.id }).items.length, 0)
  target.memberIds.pop()
  source.joinedPlanId = 'another-plan'
  assert.equal(dispatch(db, 'plan.getCandidates', { planId: target.id }).items.length, 0)
  delete source.joinedPlanId
  source.capacity = 1
  assert.equal(dispatch(db, 'plan.getCandidates', { planId: target.id }).items.length, 0)
})

test('满员计划允许作者扩容重新招募，缩至现有人数后恢复满员', () => {
  const { db, target, source } = fixture()
  target.memberIds.push(source.ownerId)
  target.status = 'full'
  const enlarged = dispatch(db, 'plan.update', edits(target, { capacity: 3 }))
  assert.equal(enlarged.status, 'open')
  assert.equal(dispatch(db, 'plan.get', { id: target.id }).status, 'open')
  const full = dispatch(db, 'plan.update', edits(target, { capacity: 2 }))
  assert.equal(full.status, 'full')
  assert.deepEqual(full.memberIds, [target.ownerId, source.ownerId])
})

test('读取按容量归一旧 open/full 状态，并且不能缩到现有成员数以下', () => {
  const { db, target, source, third } = fixture()
  target.status = 'full'
  assert.equal(dispatch(db, 'plan.get', { id: target.id }).status, 'open')
  target.memberIds.push(source.ownerId, third.ownerId)
  target.capacity = 3
  assert.equal(dispatch(db, 'myContent.list').items.find((p) => p.id === target.id).status, 'full')
  failCode(() => dispatch(db, 'plan.update', edits(target, { capacity: 2 })), 'CONFLICT')
  assert.equal(target.capacity, 3)
  assert.equal(target.memberIds.length, 3)
})

test('结束时间边界转 expired，不能通过编辑或完成恢复到期计划', (t) => {
  const { db, target } = fixture()
  t.mock.method(Date, 'now', () => Date.parse(target.endAt))
  assert.equal(dispatch(db, 'plan.get', { id: target.id }).status, 'expired')
  const future = Date.now() + 86400000
  failCode(() => dispatch(db, 'plan.update', edits(target, {
    startAt: new Date(future).toISOString(),
    endAt: new Date(future + 3600000).toISOString()
  })), 'CONFLICT')
  failCode(() => dispatch(db, 'plan.complete', { id: target.id }), 'CONFLICT')
  assert.equal(target.status, 'expired')
})

for (const status of ['closed', 'completed']) {
  test(`${status} 终态到期后保持原样，不可再次编辑`, (t) => {
    const { db, target } = fixture()
    target.status = status
    t.mock.method(Date, 'now', () => Date.parse(target.endAt) + 1)
    assert.equal(dispatch(db, 'plan.get', { id: target.id }).status, status)
    failCode(() => dispatch(db, 'plan.update', edits(target)), 'CONFLICT')
  })
}

for (const side of ['target', 'source']) {
  for (const action of ['close', 'complete']) {
    test(`${side} 计划 ${action} 后待处理邀请立即失效，不能新增成员或通知`, () => {
      const state = fixture()
      const { db, target, source } = state
      const sent = invite(db, target, source)
      const plan = state[side]
      db.currentUserId = plan.ownerId
      dispatch(db, `plan.${action}`, { id: plan.id })
      assert.equal(storedInvitation(db, sent).status, 'expired')
      db.currentUserId = source.ownerId
      failCode(() => respond(db, sent), 'CONFLICT')
      assert.deepEqual(target.memberIds, [target.ownerId])
      assert.equal(db.notifications.length, 1)
    })
  }
}

for (const invalidation of ['private-target', 'private-source', 'expired-target', 'expired-source', 'category', 'campus', 'time', 'joined']) {
  test(`邀请读取收敛 ${invalidation} 变化，失效后接受和拒绝都返回冲突`, () => {
    const { db, target, source } = fixture()
    const sent = invite(db, target, source)
    if (invalidation === 'private-target') target.visibility = 'private'
    if (invalidation === 'private-source') source.visibility = 'private'
    if (invalidation === 'expired-target') target.endAt = new Date(Date.now() - 1).toISOString()
    if (invalidation === 'expired-source') source.endAt = new Date(Date.now() - 1).toISOString()
    if (invalidation === 'category') source.category = '散步'
    if (invalidation === 'campus') source.campusId = 'another-campus'
    if (invalidation === 'time') source.startAt = target.endAt
    if (invalidation === 'joined') source.joinedPlanId = 'another-plan'
    db.currentUserId = source.ownerId
    const listed = dispatch(db, 'invitation.list').items.find((item) => item.id === sent.id)
    assert.equal(listed.status, 'expired')
    failCode(() => respond(db, sent), 'CONFLICT')
    failCode(() => respond(db, sent, 'reject'), 'CONFLICT')
    assert.deepEqual(target.memberIds, [target.ownerId])
    assert.equal(db.notifications.length, 1)
  })
}

test('目标满员使旧邀请永久失效，扩容后只能创建新邀请', () => {
  const { db, target, source, third } = fixture()
  const sent = invite(db, target, source)
  target.memberIds.push(third.ownerId)
  dispatch(db, 'plan.get', { id: target.id })
  assert.equal(storedInvitation(db, sent).status, 'expired')
  dispatch(db, 'plan.update', edits(target, { capacity: 3 }))
  assert.equal(storedInvitation(db, sent).status, 'expired')
  const next = invite(db, target, source, 'send-after-expand')
  assert.notEqual(next.id, sent.id)
  assert.equal(next.status, 'pending')
})

test('修改类别使邀请立即失效，改回原类别不会恢复旧邀请', () => {
  const { db, target, source } = fixture()
  const sent = invite(db, target, source)
  const original = target.category
  dispatch(db, 'plan.update', edits(target, { category: '散步' }))
  assert.equal(storedInvitation(db, sent).status, 'expired')
  dispatch(db, 'plan.update', edits(target, { category: original }))
  assert.equal(storedInvitation(db, sent).status, 'expired')
})

test('最后空位仅一人能接受，其他邀请同步失效，成功幂等重试不重复通知', () => {
  const { db, target, source, third } = fixture()
  Object.assign(third, {
    category: source.category,
    startAt: source.startAt,
    endAt: source.endAt
  })
  const first = invite(db, target, source, 'first')
  const second = invite(db, target, third, 'second')
  db.currentUserId = source.ownerId
  const accepted = respond(db, first)
  assert.equal(accepted.invitation.status, 'accepted')
  assert.equal(storedInvitation(db, second).status, 'expired')
  assert.deepEqual(respond(db, first), accepted)
  assert.equal(db.notifications.length, 3)
  db.currentUserId = third.ownerId
  failCode(() => respond(db, second), 'CONFLICT')
  assert.deepEqual(target.memberIds, [target.ownerId, source.ownerId])
  assert.equal(third.status, 'open')
  assert.equal(third.joinedPlanId, undefined)
  assert.equal(db.notifications.length, 3)
})

test('来源加入另一目标后，发给同一来源的其他邀请失效', () => {
  const { db, target, source, third } = fixture()
  Object.assign(third, {
    category: source.category,
    startAt: source.startAt,
    endAt: source.endAt
  })
  const first = invite(db, target, source)
  db.currentUserId = third.ownerId
  const second = invite(db, third, source, 'other-host')
  db.currentUserId = source.ownerId
  respond(db, first)
  assert.equal(storedInvitation(db, second).status, 'expired')
  failCode(() => respond(db, second), 'CONFLICT')
  assert.deepEqual(third.memberIds, [third.ownerId])
  assert.equal(source.joinedPlanId, target.id)
})

test('接受、拒绝和取消按身份校验，失败不改变有效邀请或发通知', () => {
  const { db, target, source, third } = fixture()
  const sent = invite(db, target, source)
  db.currentUserId = third.ownerId
  for (const action of ['accept', 'reject', 'cancel'])
    failCode(() => respond(db, sent, action), 'FORBIDDEN')
  failCode(() => dispatch(db, 'plan.close', { id: target.id }), 'FORBIDDEN')
  failCode(() => dispatch(db, 'plan.update', edits(target, { capacity: 3 })), 'FORBIDDEN')
  assert.equal(storedInvitation(db, sent).status, 'pending')
  assert.equal(target.capacity, 2)
  assert.deepEqual(target.memberIds, [target.ownerId])
  assert.equal(db.notifications.length, 1)
  db.currentUserId = target.ownerId
  const cancelled = dispatch(db, 'invitation.cancel', { invitationId: sent.id, idempotencyKey: 'cancel' })
  assert.equal(cancelled.invitation.status, 'cancelled')
  assert.deepEqual(dispatch(db, 'invitation.cancel', { invitationId: sent.id, idempotencyKey: 'cancel' }), cancelled)
  assert.equal(db.notifications.length, 2)
})

test('成功创建邀请的同编号重试保留原结果，不复活已失效邀请', () => {
  const { db, target, source } = fixture()
  const sent = invite(db, target, source)
  dispatch(db, 'plan.close', { id: target.id })
  assert.deepEqual(invite(db, target, source), sent)
  assert.equal(storedInvitation(db, sent).status, 'expired')
  assert.equal(db.invitations.length, 1)
  assert.equal(db.notifications.length, 1)
})

test('接收者拒绝有效邀请后双方计划不变，原编号重试只返回一次结果', () => {
  const { db, target, source } = fixture()
  const sent = invite(db, target, source)
  db.currentUserId = source.ownerId
  const rejected = respond(db, sent, 'reject')
  assert.equal(rejected.invitation.status, 'rejected')
  assert.deepEqual(respond(db, sent, 'reject'), rejected)
  failCode(() => respond(db, sent, 'accept'), 'CONFLICT')
  assert.deepEqual(target.memberIds, [target.ownerId])
  assert.equal(target.status, 'open')
  assert.equal(source.status, 'open')
  assert.equal(source.joinedPlanId, undefined)
  assert.equal(db.notifications.length, 2)
})

test('进行中的满员计划保留开始时刻可扩容，成员不变并重新招募', (t) => {
  const { db, target, source } = fixture()
  t.mock.method(Date, 'now', () => Date.parse(target.startAt) + 1800000)
  target.memberIds.push(source.ownerId)
  target.status = 'full'
  const result = dispatch(db, 'plan.update', edits(target, { capacity: 3 }))
  assert.equal(result.status, 'open')
  assert.equal(result.capacity, 3)
  assert.deepEqual(result.memberIds, [target.ownerId, source.ownerId])
})

test('已开始计划可只改正文，等价时区格式仍视为同一开始时刻', (t) => {
  const { db, target } = fixture()
  const originalStart = Date.parse(target.startAt)
  t.mock.method(Date, 'now', () => originalStart + 1800000)
  const result = dispatch(db, 'plan.update', edits(target, {
    body: '地点不变，欢迎迟到的同学。',
    startAt: new Date(originalStart).toISOString()
  }))
  assert.equal(result.body, '地点不变，欢迎迟到的同学。')
  assert.equal(Date.parse(result.startAt), originalStart)
  assert.equal(result.status, 'open')
})

test('更新不得伪造另一个过去开始时间，失败不改变原计划', (t) => {
  const { db, target } = fixture()
  const now = Date.parse(target.startAt) + 1800000
  t.mock.method(Date, 'now', () => now)
  const before = structuredClone(target)
  failCode(() => dispatch(db, 'plan.update', edits(target, {
    startAt: new Date(now - 60000).toISOString(),
    body: '不应保存的正文'
  })), 'INVALID_ARGUMENT')
  assert.deepEqual(target, before)
})

test('新发布仍必须从未来开始，不能以进行中计划字段绕过校验', (t) => {
  const { db, target } = fixture()
  t.mock.method(Date, 'now', () => Date.parse(target.startAt) + 1800000)
  failCode(() => dispatch(db, 'plan.create', edits(target)), 'INVALID_ARGUMENT')
  assert.equal(db.contents.plan.length, 3)
})

test('进行中计划不能将结束时间改到当前或过去', (t) => {
  const { db, target } = fixture()
  const now = Date.parse(target.startAt) + 1800000
  t.mock.method(Date, 'now', () => now)
  const originalEnd = target.endAt
  for (const endAt of [now, now - 60000])
    failCode(() => dispatch(db, 'plan.update', edits(target, {
      endAt: new Date(endAt).toISOString()
    })), 'INVALID_ARGUMENT')
  assert.equal(target.endAt, originalEnd)
  assert.equal(target.status, 'open')
})

test('已开始计划也可将开始和结束调整到未来', (t) => {
  const { db, target } = fixture()
  const now = Date.parse(target.startAt) + 1800000
  t.mock.method(Date, 'now', () => now)
  const startAt = new Date(now + 3600000).toISOString()
  const endAt = new Date(now + 7200000).toISOString()
  const result = dispatch(db, 'plan.update', edits(target, { startAt, endAt }))
  assert.equal(result.startAt, startAt)
  assert.equal(result.endAt, endAt)
  assert.equal(result.status, 'open')
})
