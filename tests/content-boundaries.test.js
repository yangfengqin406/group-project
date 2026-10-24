import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'

for (const initialAction of ['complete', 'close']) {
  for (const staleAction of ['complete', 'close']) {
    test(`商品${initialAction}之后的旧${staleAction}操作返回冲突且不改写终态`, () => {
      const db = createSeed()
      const item = db.contents.market[0]
      db.currentUserId = item.ownerId
      const finished = dispatch(db, `market.${initialAction}`, { id: item.id })
      assert.equal(finished.status, initialAction === 'complete' ? 'completed' : 'closed')
      assert.throws(
        () => dispatch(db, `market.${staleAction}`, { id: item.id }),
        { code: 'CONFLICT' }
      )
      assert.equal(item.status, finished.status)
      assert.throws(() => dispatch(db, 'market.reserve', { id: item.id }), {
        code: 'INVALID_ARGUMENT'
      })
      db.currentUserId = 'user_demo_a'
      assert.throws(() => dispatch(db, 'market.reserve', { id: item.id }), {
        code: 'CONFLICT'
      })
      assert.equal(db.reservations.length, 0)
    })
  }
}

test('收藏的内容转私有后与详情权限一致，分页不返回被隐藏的内容', () => {
  const db = createSeed()
  const privateItem = db.contents.market[0]
  const publicItem = db.contents.lost_found[0]
  for (const item of [privateItem, publicItem]) {
    dispatch(db, 'favorite.set', {
      contentType: item.type,
      contentId: item.id,
      selected: true
    })
  }
  privateItem.visibility = 'private'
  assert.throws(() => dispatch(db, 'market.get', { id: privateItem.id }), {
    code: 'FORBIDDEN'
  })
  const page = dispatch(db, 'favorite.list', { pageSize: 1 })
  assert.deepEqual(page.items.map((entry) => entry.contentId), [publicItem.id])
  assert.equal(page.nextCursor, null)
  assert.equal(JSON.stringify(page).includes(privateItem.body), false)
  assert.equal(db.favorites.length, 2, '隐藏不删除收藏，重新公开后可恢复展示')
  privateItem.visibility = 'public'
  assert.equal(dispatch(db, 'favorite.list').items.length, 2)
})

test('收藏列表保留本人私有内容，失效条目不阻断其余收藏', () => {
  const db = createSeed()
  const ownItem = db.contents.plan[0]
  dispatch(db, 'favorite.set', {
    contentType: ownItem.type,
    contentId: ownItem.id,
    selected: true
  })
  ownItem.visibility = 'private'
  db.favorites.unshift({
    userId: db.currentUserId,
    contentType: 'market',
    contentId: 'removed-market-post'
  })
  assert.equal(dispatch(db, 'plan.get', { id: ownItem.id }).id, ownItem.id)
  const page = dispatch(db, 'favorite.list', { pageSize: 1 })
  assert.deepEqual(page.items.map((entry) => entry.contentId), [ownItem.id])
  assert.equal(page.nextCursor, null)
})

test('私有商品不能通过预约旁路访问，失败不创建预约', () => {
  const db = createSeed()
  const item = db.contents.market[0]
  item.visibility = 'private'
  assert.throws(() => dispatch(db, 'market.get', { id: item.id }), {
    code: 'FORBIDDEN'
  })
  assert.throws(() => dispatch(db, 'market.reserve', { id: item.id }), {
    code: 'FORBIDDEN'
  })
  assert.equal(db.reservations.length, 0)
  item.visibility = 'public'
  const reservation = dispatch(db, 'market.reserve', { id: item.id })
  assert.equal(reservation.status, 'pending')
  assert.equal(reservation.buyerId, db.currentUserId)
  assert.throws(() => dispatch(db, 'market.reserve', { id: item.id }), {
    code: 'CONFLICT'
  })
  assert.equal(db.reservations.length, 1)
})
