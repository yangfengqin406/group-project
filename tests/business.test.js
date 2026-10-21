import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'
import { findCandidates } from '../src/mock/matching.js'
import { formatTime, localToIso } from '../src/utils/routes.js'
const failCode = (run, code) =>
  assert.throws(run, (error) => error.code === code)
test('午夜边界按北京时间展示、输入，避免电脑时区改变活动日期', () => {
  assert.equal(formatTime('2026-10-13T16:30:00Z'), '10月14日 00:30')
  assert.equal(localToIso('2026-10-14', '00:30'), '2026-10-13T16:30:00.000Z')
  const db = createSeed(new Date('2026-10-13T16:30:00Z'))
  assert(db.contents.plan[0].startAt.startsWith('2026-10-17'))
})
test('同类、同校、同日且时间真正重叠才推荐；端点接触不算重叠', () => {
  const db = createSeed(),
    a = db.contents.plan[0],
    b = db.contents.plan[1]
  assert.deepEqual(
    findCandidates(a, db.contents.plan).map((c) => c.candidatePlanId),
    [b.id]
  )
  const sameDayLater = {
    ...b,
    id: 'later',
    startAt: a.endAt,
    endAt: new Date(Date.parse(a.endAt) + 3600000).toISOString()
  }
  assert.equal(findCandidates(a, [a, sameDayLater]).length, 0)
  assert.equal(findCandidates(a, [a, { ...b, campusId: 'other' }]).length, 0)
  assert.equal(findCandidates(a, [a, { ...b, category: '散步' }]).length, 0)
  assert.equal(findCandidates(a, [a, { ...b, ownerId: a.ownerId }]).length, 0)
})
test('不同日期、已过期、满员和非单人来源不推荐', () => {
  const db = createSeed(),
    a = db.contents.plan[0],
    b = db.contents.plan[1]
  const otherDay = {
    ...b,
    startAt: new Date(Date.parse(b.startAt) + 86400000).toISOString(),
    endAt: new Date(Date.parse(b.endAt) + 86400000).toISOString()
  }
  assert.equal(findCandidates(a, [otherDay]).length, 0)
  assert.equal(findCandidates(a, [b], Date.parse(a.endAt) + 1).length, 0)
  assert.equal(findCandidates({ ...a, capacity: 1 }, [b]).length, 0)
  assert.equal(
    findCandidates(a, [{ ...b, memberIds: [b.ownerId, 'extra'] }]).length,
    0
  )
})
test('邀请方向、双方确认、通知与幂等；接收后不会重复加人', () => {
  const db = createSeed(),
    [a, b] = db.contents.plan
  const p = {
    sourcePlanId: b.id,
    targetPlanId: a.id,
    idempotencyKey: 'invite-1'
  }
  const invite = dispatch(db, 'invitation.create', p)
  assert.equal(dispatch(db, 'invitation.create', p).id, invite.id)
  assert.equal(db.invitations.length, 1)
  assert.equal(invite.recipientId, b.ownerId)
  failCode(
    () =>
      dispatch(db, 'invitation.respond', {
        invitationId: invite.id,
        action: 'accept',
        idempotencyKey: 'wrong'
      }),
    'FORBIDDEN'
  )
  db.currentUserId = b.ownerId
  const response = {
    invitationId: invite.id,
    action: 'accept',
    idempotencyKey: 'accept-1'
  }
  dispatch(db, 'invitation.respond', response)
  dispatch(db, 'invitation.respond', response)
  assert.equal(a.status, 'full')
  assert.deepEqual(a.memberIds, [a.ownerId, b.ownerId])
  assert.equal(b.status, 'closed')
  assert.equal(b.joinedPlanId, a.id)
  assert.equal(db.notifications.length, 2)
  failCode(
    () => dispatch(db, 'invitation.respond', { ...response, action: 'reject' }),
    'CONFLICT'
  )
})
test('满员后接受其他邀请失败，不留下半写入状态', () => {
  const db = createSeed(),
    [a, b] = db.contents.plan
  const c = {
    ...b,
    id: 'third',
    ownerId: 'user_demo_c',
    memberIds: ['user_demo_c']
  }
  db.contents.plan.push(c)
  const first = dispatch(db, 'invitation.create', {
    sourcePlanId: b.id,
    targetPlanId: a.id,
    idempotencyKey: 'one'
  })
  const second = dispatch(db, 'invitation.create', {
    sourcePlanId: c.id,
    targetPlanId: a.id,
    idempotencyKey: 'two'
  })
  db.currentUserId = b.ownerId
  dispatch(db, 'invitation.respond', {
    invitationId: first.id,
    action: 'accept',
    idempotencyKey: 'accept-one'
  })
  db.currentUserId = c.ownerId
  failCode(
    () =>
      dispatch(db, 'invitation.respond', {
        invitationId: second.id,
        action: 'accept',
        idempotencyKey: 'accept-two'
      }),
    'CONFLICT'
  )
  assert.equal(a.memberIds.length, 2)
  assert.equal(c.status, 'open')
  assert.equal(second.status, 'pending')
})
test('本人发布与他人公开发布分开，不能读取私有内容', () => {
  const db = createSeed(),
    b = db.contents.plan[1]
  db.contents.market[0].visibility = 'private'
  assert(
    dispatch(db, 'myContent.list').items.every(
      (c) => c.ownerId === db.currentUserId
    )
  )
  assert(
    dispatch(db, 'user.listPublicContent', { userId: b.ownerId }).items.every(
      (c) => c.visibility === 'public' && c.ownerId === b.ownerId
    )
  )
  failCode(
    () => dispatch(db, 'market.get', { id: 'market_demo_lamp' }),
    'FORBIDDEN'
  )
  failCode(
    () => dispatch(db, 'lostFound.markReturned', { id: 'lost_demo_card' }),
    'FORBIDDEN'
  )
})
test('消息保留内容链接，参与者校验，重复发送不重复落消息', () => {
  const db = createSeed()
  const p = {
    contentType: 'market',
    contentId: 'market_demo_lamp',
    peerUserId: 'user_demo_b'
  }
  const c = dispatch(db, 'conversation.open', p)
  assert.equal(c.contentId, p.contentId)
  assert.equal(c.contentType, p.contentType)
  assert.equal(dispatch(db, 'conversation.open', p).id, c.id)
  const message = {
    conversationId: c.id,
    body: '台灯还在吗？',
    idempotencyKey: 'message-1'
  }
  dispatch(db, 'message.send', message)
  dispatch(db, 'message.send', message)
  assert.equal(db.messages.length, 1)
  db.currentUserId = 'user_demo_c'
  failCode(
    () => dispatch(db, 'message.list', { conversationId: c.id }),
    'FORBIDDEN'
  )
  failCode(
    () =>
      dispatch(db, 'notification.markRead', {
        notificationId: db.notifications[0].id
      }),
    'FORBIDDEN'
  )
})
test('分页不会悄悄漏掉下一页，收藏取消可重复', () => {
  const db = createSeed(),
    first = dispatch(db, 'plan.list', { pageSize: 1 })
  assert.equal(first.items.length, 1)
  assert.equal(first.nextCursor, '1')
  assert.equal(
    dispatch(db, 'plan.list', { pageSize: 1, cursor: first.nextCursor })
      .items[0].id,
    db.contents.plan[1].id
  )
  const p = {
    contentType: 'market',
    contentId: 'market_demo_lamp',
    selected: true
  }
  dispatch(db, 'favorite.set', p)
  dispatch(db, 'favorite.set', p)
  assert.equal(db.favorites.length, 1)
  dispatch(db, 'favorite.set', { ...p, selected: false })
  assert.equal(db.favorites.length, 0)
})
test('服务端身份约定不接收前端伪造 owner；保留接口明确报未实现', () => {
  const db = createSeed()
  const item = dispatch(db, 'market.create', {
    title: '一本教材',
    body: '保存良好',
    category: '教材',
    marketType: 'sell',
    condition: '九成新',
    priceCents: 2500,
    ownerId: 'user_demo_c'
  })
  assert.equal(item.ownerId, 'user_demo_a')
  failCode(
    () =>
      dispatch(db, 'market.create', {
        title: '错误价格',
        body: '',
        marketType: 'sell',
        priceCents: 1.5
      }),
    'INVALID_ARGUMENT'
  )
  failCode(() => dispatch(db, 'upload.create', {}), 'INVALID_ARGUMENT')
  failCode(() => dispatch(db, 'auth.login', {}), 'INVALID_ARGUMENT')
  failCode(
    () => dispatch(db, 'auth.login', { type: 'wechat' }),
    'NOT_IMPLEMENTED'
  )
  failCode(() => dispatch(db, 'appraisal.estimate', {}), 'NOT_IMPLEMENTED')
})
