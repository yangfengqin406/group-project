import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'

const failCode = (run, code) =>
  assert.throws(run, (error) => error.code === code)
const sale = {
  marketType: 'sell',
  title: '九成新的高数教材',
  body: '可在教学楼门口交接',
  category: '教材',
  priceCents: 3000,
  condition: '九成新',
  imageIds: []
}
const appraisal = () => ({
  minCents: 2000,
  maxCents: 8000,
  basis: { category: '教材', condition: '九成新', rule: '类别+成色示例估价' },
  note: '参考估价，仅供参考，最终价格由发布者决定'
})

test('求购匹配仅返回公开、同类同校、预算内的他人在售闲置，筛选后分页', () => {
  const db = createSeed()
  const buy = db.contents.market.find((c) => c.id === 'market_demo_buy_book')
  const book = db.contents.market.find((c) => c.id === 'market_demo_book')
  const variants = [
    { id: 'private', visibility: 'private' },
    { id: 'closed', status: 'closed' },
    { id: 'completed', status: 'completed' },
    { id: 'self', ownerId: db.currentUserId },
    { id: 'other-campus', campusId: 'other' },
    { id: 'other-category', category: '数码' },
    { id: 'over-budget', priceCents: buy.budgetCents + 1 }
  ]
  db.contents.market = [
    buy,
    ...variants.map((variant) => ({ ...book, ...variant })),
    book,
    { ...book, id: 'boundary-price', priceCents: buy.budgetCents }
  ]
  const first = dispatch(db, 'market.matchCandidates', { buyId: buy.id, pageSize: 1 })
  assert.deepEqual(first.items.map((c) => c.id), [book.id])
  assert.deepEqual(first.items[0].reasons, [
    '同类别', '同校区', '价格在预算内', '包含求购关键词'
  ])
  assert.equal(first.nextCursor, '1')
  const second = dispatch(db, 'market.matchCandidates', {
    buyId: buy.id, pageSize: 1, cursor: first.nextCursor
  })
  assert.deepEqual(second.items.map((c) => c.id), ['boundary-price'])
  assert.equal(second.nextCursor, null)
})

test('求购匹配限制本人求购；无候选返回明确空分页', () => {
  const db = createSeed()
  const buy = db.contents.market.find((c) => c.id === 'market_demo_buy_book')
  db.currentUserId = db.users[1].id
  failCode(() => dispatch(db, 'market.matchCandidates', { buyId: buy.id }), 'FORBIDDEN')
  failCode(() => dispatch(db, 'market.matchCandidates', { buyId: 'market_demo_book' }), 'INVALID_ARGUMENT')
  db.currentUserId = buy.ownerId
  buy.category = '没有闲置的分类'
  assert.deepEqual(dispatch(db, 'market.matchCandidates', { buyId: buy.id }), {
    items: [], nextCursor: null
  })
})

test('参考估价要求当前账号图片，按类别和成色规则返回固定参考声明', () => {
  const db = createSeed()
  const img = dispatch(db, 'upload.create', { usage: 'content', data: 'demo-photo' })
  const result = dispatch(db, 'appraisal.estimate', {
    imageId: img.imageId, category: '教材', condition: '八成新'
  })
  assert.equal(result.minCents, 1600)
  assert.equal(result.maxCents, 6400)
  assert.deepEqual(result.basis, {
    category: '教材', condition: '八成新', rule: '类别+成色示例估价'
  })
  assert.equal(result.note, appraisal().note)
  db.currentUserId = db.users[1].id
  failCode(() => dispatch(db, 'appraisal.estimate', { imageId: img.imageId }), 'FORBIDDEN')
  failCode(() => dispatch(db, 'appraisal.estimate', {}), 'INVALID_ARGUMENT')
})

test('闲置可保存完整参考快照，缺失依据、错误金额和伪装AI的快照拒绝写入', () => {
  const db = createSeed()
  const created = dispatch(db, 'market.create', { ...sale, appraisal: appraisal() })
  assert.deepEqual(dispatch(db, 'market.get', { id: created.id }).appraisal, appraisal())
  const count = db.contents.market.length
  const invalid = [
    { minCents: 1, maxCents: 2 },
    { ...appraisal(), minCents: -1 },
    { ...appraisal(), maxCents: 1 },
    { ...appraisal(), minCents: 1.5 },
    { ...appraisal(), maxCents: Number.MAX_SAFE_INTEGER + 1 },
    { ...appraisal(), basis: null },
    { ...appraisal(), basis: { ...appraisal().basis, rule: 'AI精准估价' } },
    { ...appraisal(), note: '平台保证实际成交价' }
  ]
  for (const snapshot of invalid)
    failCode(() => dispatch(db, 'market.create', { ...sale, appraisal: snapshot }), 'INVALID_ARGUMENT')
  assert.equal(db.contents.market.length, count)
})

test('求购不能提交估价，闲置切换求购清除旧快照', () => {
  const db = createSeed()
  const params = {
    marketType: 'buy', title: '求购高数教材', body: '七成新以上',
    category: '教材', budgetCents: 5000, keywords: '高数'
  }
  failCode(() => dispatch(db, 'market.create', { ...params, appraisal: appraisal() }), 'INVALID_ARGUMENT')
  const created = dispatch(db, 'market.create', { ...sale, appraisal: appraisal() })
  const updated = dispatch(db, 'market.update', { ...params, id: created.id })
  assert.equal(updated.marketType, 'buy')
  assert.equal(updated.appraisal, undefined)
})
