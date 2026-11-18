import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'

const failCode = (run, code) =>
  assert.throws(run, (error) => error.code === code)

test('演示首次联系仅接收方未读，所有来源一致且重复打开不制造留言或新事件', () => {
  const db = createSeed()
  const sender = db.currentUserId
  const targets = [['market', 'market_demo_lamp'], ['lost_found', 'lost_demo_key'], ['plan', 'plan_demo_b']]
  for (const [contentType, contentId] of targets) {
    const params = { contentType, contentId, peerUserId: 'user_demo_b' }
    const opened = dispatch(db, 'conversation.open', params)
    assert.equal(opened.contactRequest.senderId, sender)
    assert.equal(opened.unreadContact, false)
    assert.equal(dispatch(db, 'conversation.open', params).contactRequest.id, opened.contactRequest.id)
  }
  assert.equal(dispatch(db, 'conversation.unread').total, 0)
  assert.equal(db.messages.length, 0)
  assert.equal(db.notifications.length, 0)
  db.currentUserId = 'user_demo_b'
  const unread = dispatch(db, 'conversation.unread')
  assert.equal(unread.total, targets.length)
  assert.ok(unread.items.every(c => c.unreadContact && c.unreadCount === 1 && c.lastMessage === null))
  const c = unread.items[0]
  assert.equal(dispatch(db, 'conversation.get', { id: c.id }).unreadContact, true)
  assert.ok(dispatch(db, 'conversation.list').items.every(c => c.unreadContact))
  assert.deepEqual(dispatch(db, 'conversation.markRead', { conversationId: c.id, throughContactId: c.contactRequest.id }), { unreadCount: 0, unreadContact: false })
  assert.equal(dispatch(db, 'conversation.unread').total, targets.length - 1)
  db.currentUserId = 'user_demo_c'
  failCode(() => dispatch(db, 'conversation.markRead', { conversationId: c.id, throughContactId: c.contactRequest.id }), 'FORBIDDEN')
})

test('演示确认首次联系不会读掉并发文字，文字确认联系且拒绝错误事件及混合参数', () => {
  const db = createSeed(), sender = db.currentUserId
  const c = dispatch(db, 'conversation.open', { contentType: 'market', contentId: 'market_demo_lamp', peerUserId: 'user_demo_b' })
  const first = dispatch(db, 'message.send', { conversationId: c.id, body: '第一条', idempotencyKey: 'demo-contact-first' })
  db.currentUserId = 'user_demo_b'
  assert.equal(dispatch(db, 'conversation.unread').total, 1)
  for (const params of [
    { conversationId: c.id },
    { conversationId: c.id, throughContactId: 'wrong-contact' },
    { conversationId: c.id, throughContactId: c.contactRequest.id, throughMessageId: first.id }
  ]) failCode(() => dispatch(db, 'conversation.markRead', params), 'INVALID_ARGUMENT')
  assert.deepEqual(dispatch(db, 'conversation.markRead', { conversationId: c.id, throughContactId: c.contactRequest.id }), { unreadCount: 1, unreadContact: false })
  db.currentUserId = sender
  const second = dispatch(db, 'message.send', { conversationId: c.id, body: '后到的文字', idempotencyKey: 'demo-contact-second' })
  db.currentUserId = 'user_demo_b'
  assert.deepEqual(dispatch(db, 'conversation.markRead', { conversationId: c.id, throughMessageId: first.id }), { unreadCount: 1, unreadContact: false })
  assert.equal(dispatch(db, 'conversation.unread').items[0].lastMessage.id, second.id)
  assert.deepEqual(dispatch(db, 'conversation.markRead', { conversationId: c.id, throughMessageId: second.id }), { unreadCount: 0, unreadContact: false })
})

test('演示旧会话及字符串已读凭据兼容，文字标读也确认尚未读的首次联系', () => {
  const db = createSeed()
  const c = dispatch(db, 'conversation.open', { contentType: 'lost_found', contentId: 'lost_demo_key', peerUserId: 'user_demo_b' })
  const first = dispatch(db, 'message.send', { conversationId: c.id, body: '旧凭据', idempotencyKey: 'demo-old-read' })
  db.currentUserId = 'user_demo_b'
  assert.deepEqual(dispatch(db, 'conversation.markRead', { conversationId: c.id, throughMessageId: first.id }), { unreadCount: 0, unreadContact: false })
  const stored = db.conversations.find(item => item.id === c.id)
  delete stored.contactRequest
  db.conversationReads[JSON.stringify([db.currentUserId, c.id])] = first.id
  assert.equal(dispatch(db, 'conversation.get', { id: c.id }).unreadContact, false)
  assert.equal(dispatch(db, 'conversation.unread').total, 0)
  db.currentUserId = 'user_demo_a'
  assert.equal(dispatch(db, 'conversation.open', { contentType: 'lost_found', contentId: 'lost_demo_key', peerUserId: 'user_demo_b' }).contactRequest, null)
})

test('演示私信未读与真实接口一致：按身份隔离、快照标读且不误读后续新消息', () => {
  const db = createSeed()
  const c = dispatch(db, 'conversation.open', { contentType: 'lost_found', contentId: 'lost_demo_key', peerUserId: 'user_demo_b' })
  const send = (key) => dispatch(db, 'message.send', { conversationId: c.id, body: key, idempotencyKey: key })
  const first = send('first'), second = send('second')
  assert.equal(dispatch(db, 'conversation.unread').total, 0)
  db.currentUserId = 'user_demo_b'
  assert.equal(dispatch(db, 'conversation.get', { id: c.id }).unreadCount, 2)
  dispatch(db, 'conversation.markRead', { conversationId: c.id, throughMessageId: first.id })
  assert.equal(dispatch(db, 'conversation.unread').total, 1)
  assert.equal(db.notifications.find((n) => n.messageId === first.id).read, true)
  dispatch(db, 'conversation.markRead', { conversationId: c.id, throughMessageId: second.id })
  dispatch(db, 'conversation.markRead', { conversationId: c.id, throughMessageId: first.id })
  assert.equal(dispatch(db, 'conversation.unread').total, 0)
  db.currentUserId = 'user_demo_c'
  failCode(() => dispatch(db, 'conversation.markRead', { conversationId: c.id, throughMessageId: first.id }), 'FORBIDDEN')
  assert.equal(dispatch(db, 'conversation.unread').total, 0)
})

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
