import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'

const sell = (imageIds = []) => ({
  marketType: 'sell',
  title: '整合测试教材',
  body: '校内当面交接',
  category: '教材',
  priceCents: 1200,
  condition: '九成新',
  imageIds
})
const lost = (images = ['wxfile://test-key.png']) => ({
  title: '整合测试钥匙',
  body: '蓝色钥匙扣',
  category: 'key',
  lostKind: 'lost',
  location: '操场',
  images
})

test('B二手图片ID与C失物照片并存，详情及公开主页按各自来源解析', () => {
  const db = createSeed()
  const image = dispatch(db, 'upload.create', {
    usage: 'content',
    data: 'blob:market-image'
  })
  const market = dispatch(db, 'market.create', sell([image.imageId]))
  const found = dispatch(db, 'lostFound.create', lost())
  assert.deepEqual(market.images, ['blob:market-image'])
  assert.deepEqual(found.images, ['wxfile://test-key.png'])
  const page = dispatch(db, 'user.listPublicContent', {
    userId: db.currentUserId
  })
  assert.deepEqual(
    page.items.find((p) => p.id === market.id).images,
    market.images
  )
  assert.deepEqual(
    page.items.find((p) => p.id === found.id).images,
    found.images
  )
  assert.throws(() => dispatch(db, 'lostFound.create', lost([])), {
    code: 'INVALID_ARGUMENT'
  })
  db.currentUserId = 'user_demo_b'
  assert.throws(() => dispatch(db, 'market.create', sell([image.imageId])), {
    code: 'FORBIDDEN'
  })
})

test('二手和失物专属筛选互不串入搭子/技能列表，组合筛选后分页', () => {
  const db = createSeed()
  dispatch(db, 'market.create', sell())
  dispatch(db, 'market.create', {
    ...sell(),
    marketType: 'buy',
    budgetCents: 2000,
    keywords: '教材'
  })
  const buys = dispatch(db, 'market.list', {
    marketType: 'buy',
    campusId: 'demo-campus',
    lostKind: 'lost'
  })
  assert.equal(buys.items.length, 1)
  assert.equal(buys.items[0].marketType, 'buy')
  const keys = dispatch(db, 'lostFound.list', {
    lostKind: 'lost',
    category: 'key',
    marketType: 'buy',
    campusId: 'other'
  })
  assert.equal(keys.items.length, 1)
  const plans = dispatch(db, 'plan.list', {
    marketType: 'buy',
    campusId: 'other',
    lostKind: 'lost',
    pageSize: 1
  })
  assert.equal(plans.items.length, 1)
  assert.ok(plans.nextCursor)
  const next = dispatch(db, 'plan.list', {
    marketType: 'buy',
    pageSize: 1,
    cursor: plans.nextCursor
  })
  assert.notEqual(next.items[0].id, plans.items[0].id)
})

test('资料头像与失物评论作者可共用，二手/失物联系仍归同一消息中心', () => {
  const db = createSeed()
  const market = dispatch(db, 'market.create', sell())
  const found = dispatch(db, 'lostFound.create', lost())
  db.currentUserId = 'user_demo_b'
  const avatar = dispatch(db, 'upload.create', {
    usage: 'avatar',
    data: 'blob:avatar-b'
  })
  dispatch(db, 'user.updateProfile', {
    nickname: '整合同学',
    avatarImageId: avatar.imageId
  })
  const comment = dispatch(db, 'comment.create', {
    contentType: 'lost_found',
    contentId: found.id,
    body: '见到过这把钥匙'
  })
  assert.equal(comment.author.avatarUrl, 'blob:avatar-b')
  for (const item of [market, found]) {
    const conversation = dispatch(db, 'conversation.open', {
      contentType: item.type,
      contentId: item.id,
      peerUserId: 'user_demo_a'
    })
    dispatch(db, 'message.send', {
      conversationId: conversation.id,
      body: '联系一下',
      idempotencyKey: item.id
    })
  }
  assert.equal(dispatch(db, 'conversation.list').items.length, 2)
  db.currentUserId = 'user_demo_a'
  assert.equal(
    dispatch(db, 'comment.list', {
      contentType: 'lost_found',
      contentId: found.id
    }).items[0].author.nickname,
    '整合同学'
  )
  assert.ok(
    dispatch(db, 'notification.list').items.some(
      (n) => n.contentId === found.id
    )
  )
  dispatch(db, 'market.complete', { id: market.id })
  dispatch(db, 'lostFound.markReturned', { id: found.id })
  assert.equal(
    dispatch(db, 'market.get', { id: market.id }).status,
    'completed'
  )
  assert.equal(
    dispatch(db, 'lostFound.get', { id: found.id }).status,
    'returned'
  )
})
