import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'

const failCode = (run, code) =>
  assert.throws(run, (error) => error.code === code)

test('直接读取会话只允许参与者，通知保留会话链接，最新摘要按实际时间选取', () => {
  const db = createSeed()
  const c = dispatch(db, 'conversation.open', { contentType: 'lost_found', contentId: 'lost_demo_key', peerUserId: 'user_demo_b' })
  dispatch(db, 'message.send', { conversationId: c.id, body: '物品线索', idempotencyKey: 'direct-chat' })
  assert.equal(db.notifications[0].conversationId, c.id)
  db.messages.push({ id: 'older', conversationId: c.id, body: '旧留言', createdAt: '2000-01-01T00:00:00Z' })
  assert.equal(dispatch(db, 'conversation.get', { id: c.id }).lastMessage.body, '物品线索')
  db.currentUserId = 'user_demo_c'
  failCode(() => dispatch(db, 'conversation.get', { id: c.id }), 'FORBIDDEN')
})

test('失物按丢失拾获和卡片钥匙杂物组合筛选', () => {
  const db = createSeed()
  const cards = dispatch(db, 'lostFound.list', { category: 'card' })
  assert.equal(cards.items.length, 1)
  assert.equal(cards.items[0].lostKind, 'found')

  const lostKeys = dispatch(db, 'lostFound.list', {
    category: 'key',
    lostKind: 'lost'
  })
  assert.equal(lostKeys.items.length, 1)
  assert.equal(lostKeys.items[0].id, 'lost_demo_key')
})

test('演示归还重复确认不重复通知，原内容私有后保留历史但不能再发送', () => {
  const db = createSeed()
  const post = db.contents.lost_found.find((item) => item.id === 'lost_demo_key')
  const c = dispatch(db, 'conversation.open', { contentType: 'lost_found', contentId: post.id, peerUserId: post.ownerId })
  const senderId = db.currentUserId
  dispatch(db, 'message.send', { conversationId: c.id, body: '我丢了钥匙', idempotencyKey: 'before-return' })
  db.currentUserId = post.ownerId
  const count = db.notifications.length
  dispatch(db, 'lostFound.markReturned', { id: post.id })
  dispatch(db, 'lostFound.markReturned', { id: post.id })
  assert.equal(db.notifications.length, count + 1)
  assert.equal(db.notifications[0].conversationId, c.id)
  post.visibility = 'private'
  db.currentUserId = senderId
  assert.equal(dispatch(db, 'message.list', { conversationId: c.id }).items.length, 1)
  failCode(() => dispatch(db, 'message.send', { conversationId: c.id, body: '不可发送', idempotencyKey: 'after-private' }), 'FORBIDDEN')
  assert.equal(db.messages.length, 1)
})

test('发布失物必须选择规范分类并提供照片', () => {
  const db = createSeed()
  const base = {
    title: '丢失校园卡',
    body: '卡套为绿色，请联系核对信息。',
    category: 'card',
    lostKind: 'lost',
    location: '教学楼',
    images: ['wxfile://lost-card.jpg']
  }
  const item = dispatch(db, 'lostFound.create', base)
  assert.equal(item.category, 'card')
  assert.equal(item.lostKind, 'lost')
  assert.deepEqual(item.images, base.images)
  failCode(
    () => dispatch(db, 'lostFound.create', { ...base, images: [] }),
    'INVALID_ARGUMENT'
  )
  failCode(
    () => dispatch(db, 'lostFound.create', { ...base, category: '证件' }),
    'INVALID_ARGUMENT'
  )
})

test('失物评论公开可见并通知发布者', () => {
  const db = createSeed()
  const post = db.contents.lost_found.find((item) => item.id === 'lost_demo_key')
  const comment = dispatch(db, 'comment.create', {
    contentType: 'lost_found',
    contentId: post.id,
    body: '我在看台入口附近见过类似钥匙。'
  })
  assert.equal(comment.authorId, db.currentUserId)
  assert.equal(db.notifications[0].recipientId, post.ownerId)
  const list = dispatch(db, 'comment.list', {
    contentType: 'lost_found',
    contentId: post.id
  })
  assert.equal(list.items[0].body, comment.body)
  assert.equal(list.items[0].author.nickname, '小林')
})

test('二手失物搭子会话共用消息中心且始终保留原内容链接', () => {
  const db = createSeed()
  const targets = [
    ['market', 'market_demo_lamp', 'user_demo_b'],
    ['lost_found', 'lost_demo_key', 'user_demo_b'],
    ['plan', 'plan_demo_b', 'user_demo_b']
  ]
  for (const [contentType, contentId, peerUserId] of targets)
    dispatch(db, 'conversation.open', { contentType, contentId, peerUserId })

  const conversations = dispatch(db, 'conversation.list').items
  assert.deepEqual(
    new Set(conversations.map((item) => item.contentType)),
    new Set(['market', 'lost_found', 'plan'])
  )
  assert(
    conversations.every(
      (item) => item.contentId && item.contentTitle && item.peer.id === 'user_demo_b'
    )
  )
})
