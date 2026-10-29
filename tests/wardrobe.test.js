import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import {
  dispatchWardrobe,
  getWardrobeState,
  grantDiveReward
} from '../src/mock/wardrobe.js'
import { STARTER_ITEMS, WARDROBE_ITEMS } from '../src/utils/wardrobe-catalog.js'

const owner = 'user_demo_a'
const run = (db, action, params = {}) =>
  dispatchWardrobe(db, owner, action, params)

test('新身份衣柜为空，重复读取不赠送，目录和装备返回独立副本', () => {
  const db = createSeed()
  const state = run(db, 'getState')
  assert.equal(state.catalog.length, 23)
  assert.deepEqual(STARTER_ITEMS, [])
  assert.deepEqual(state.owned, [])
  assert.deepEqual(state.equipped, {
    hair: null,
    head: null,
    outfit: null,
    feet: null,
    bag: null,
    hand: null,
    charm: null
  })
  assert.equal(state.pearls, 0)
  assert.deepEqual(state.clearedLevels, [])
  state.owned.push({ id: 'acorn-bob', count: 999 })
  state.catalog[0].cost = 999
  state.equipped.hair = 'forged'
  assert.deepEqual(getWardrobeState(db, owner).owned, [])
  assert.deepEqual(getWardrobeState(db, owner).owned, [])
  assert.equal(getWardrobeState(db, owner).catalog[0].cost, 60)
  assert.equal(getWardrobeState(db, owner).equipped.hair, null)
  assert.deepEqual(dispatchWardrobe(db, 'user_demo_b', 'getState').owned, [])
})

test('旧钓鱼数量与单件佩戴迁移一次，后续只吸收数量增量，不随重读增长', () => {
  const db = createSeed()
  db.fishingStates = {
    [owner]: {
      catchCount: 6,
      fishBook: [],
      activeCast: null,
      equipped: 'bubble-star',
      collection: [
        { id: 'lily-pad', name: '小荷叶', count: 2 },
        { id: 'reed-bow', name: '芦苇结', count: 1 },
        { id: 'bubble-star', name: '水泡星', count: 3 }
      ]
    }
  }
  const readCounts = () =>
    Object.fromEntries(
      run(db, 'getState').owned.map(({ id, count }) => [id, count])
    )
  assert.equal(readCounts()['lily-pad'], 2)
  assert.equal(readCounts()['reed-bow'], 1)
  assert.equal(readCounts()['bubble-star'], 3)
  assert.equal(run(db, 'getState').equipped.charm, 'bubble-star')
  assert.equal(readCounts()['bubble-star'], 3)
  db.fishingStates[owner].collection[0].count = 1
  assert.equal(readCounts()['lily-pad'], 2)
  db.fishingStates[owner].collection[0].count = 3
  assert.equal(readCounts()['lily-pad'], 3)
  assert.equal(readCounts()['lily-pad'], 3)
})

test('衣柜同槽替换、不同槽叠穿和单槽摘下，旧单件佩戴不会再次夺回槽位', () => {
  const db = createSeed()
  db.fishingStates = {
    [owner]: {
      collection: [
        { id: 'lily-pad', count: 2 },
        { id: 'bubble-star', count: 1 }
      ],
      equipped: 'lily-pad'
    }
  }
  assert.equal(run(db, 'getState').equipped.head, 'lily-pad')
  grantDiveReward(db, owner, 1)
  grantDiveReward(db, owner, 2)
  run(db, 'redeem', { itemId: 'straw-hat' })
  run(db, 'equip', { slot: 'head', itemId: 'straw-hat' })
  run(db, 'equip', { slot: 'bag', itemId: 'shell-pouch' })
  const worn = run(db, 'equip', { slot: 'charm', itemId: 'bubble-star' })
  assert.equal(worn.equipped.head, 'straw-hat')
  assert.equal(worn.equipped.bag, 'shell-pouch')
  assert.equal(worn.equipped.charm, 'bubble-star')
  assert.equal(run(db, 'getState').equipped.head, 'straw-hat')
  const removed = run(db, 'equip', { slot: 'head', itemId: null })
  assert.equal(removed.equipped.head, null)
  assert.equal(run(db, 'getState').equipped.head, null)
  assert.equal(removed.equipped.charm, 'bubble-star')
  assert.equal(removed.owned.find((item) => item.id === 'lily-pad').count, 2)
  assert.throws(() => run(db, 'equip', { slot: 'bag', itemId: 'straw-hat' }), {
    code: 'INVALID_ARGUMENT'
  })
  assert.throws(
    () => run(db, 'equip', { slot: 'outfit', itemId: 'coral-dress' }),
    { code: 'FORBIDDEN' }
  )
  assert.throws(() => run(db, 'equip', { slot: '__proto__', itemId: null }), {
    code: 'INVALID_ARGUMENT'
  })
})

test('三关按顺序解锁，首通固定装扮和珍珠，重玩只给对应珍珠', () => {
  const db = createSeed()
  assert.throws(() => grantDiveReward(db, owner, 2), { code: 'FORBIDDEN' })
  assert.throws(() => grantDiveReward(db, owner, 0), {
    code: 'INVALID_ARGUMENT'
  })
  const first = grantDiveReward(db, owner, 1)
  assert.equal(first.firstClear, true)
  assert.deepEqual(first.items, ['sailor-shirt', 'shell-shoes'])
  assert.equal(first.pearls, 30)
  assert.deepEqual(first.state.clearedLevels, [1])
  first.state.clearedLevels.push(3)
  first.state.owned[0].count = 99
  assert.deepEqual(run(db, 'getState').clearedLevels, [1])
  assert.throws(() => grantDiveReward(db, owner, 3), { code: 'FORBIDDEN' })
  assert.deepEqual(grantDiveReward(db, owner, 1).items, [])
  const second = grantDiveReward(db, owner, 2)
  assert.deepEqual(second.items, ['cloud-bun', 'shell-pouch'])
  assert.equal(second.pearls, 45)
  assert.equal(grantDiveReward(db, owner, 2).pearls, 12)
  const third = grantDiveReward(db, owner, 3)
  assert.deepEqual(third.items, ['shell-crown', 'star-wand', 'pearl-badge'])
  assert.equal(third.pearls, 60)
  const replay = grantDiveReward(db, owner, 3)
  assert.equal(replay.firstClear, false)
  assert.deepEqual(replay.items, [])
  assert.equal(replay.pearls, 18)
  const final = run(db, 'getState')
  assert.equal(final.pearls, 173)
  assert.deepEqual(final.clearedLevels, [1, 2, 3])
  assert.equal(final.owned.find((item) => item.id === 'sailor-shirt').count, 1)
  assert.equal(final.owned.find((item) => item.id === 'shell-crown').count, 1)
})

test('珍珠兑换不足或参数伪造不扣款，重试已拥有装扮不重复扣款和发放', () => {
  const db = createSeed()
  assert.throws(() => run(db, 'redeem', { itemId: 'lily-pad' }), {
    code: 'CONFLICT'
  })
  grantDiveReward(db, owner, 1)
  const bought = run(db, 'redeem', { itemId: 'lily-pad' })
  assert.equal(bought.pearls, 5)
  assert.equal(bought.owned.find((item) => item.id === 'lily-pad').count, 1)
  assert.equal(run(db, 'redeem', { itemId: 'lily-pad' }).pearls, 5)
  assert.equal(run(db, 'redeem', { itemId: 'sailor-shirt' }).pearls, 5)
  for (const [params, code] of [
    [{ itemId: 'rain-boots' }, 'CONFLICT'],
    [{ itemId: 'straw-hat' }, 'CONFLICT'],
    [{ itemId: 'unknown' }, 'INVALID_ARGUMENT'],
    [{ itemId: 'rain-boots', cost: 0 }, 'INVALID_ARGUMENT'],
    [{ itemId: 'rain-boots', pearls: 1000 }, 'INVALID_ARGUMENT'],
    [{ itemId: 'rain-boots', userId: 'user_demo_b' }, 'INVALID_ARGUMENT'],
    [{ itemId: 'rain-boots', unlockLevel: 0 }, 'INVALID_ARGUMENT'],
    [{ itemId: 'rain-boots', clearedLevels: [1] }, 'INVALID_ARGUMENT']
  ]) {
    assert.throws(() => run(db, 'redeem', params), { code })
    const state = run(db, 'getState')
    assert.equal(state.pearls, 5)
    assert.equal(
      state.owned.some((item) => item.id === 'rain-boots'),
      false
    )
    assert.equal(state.owned.find((item) => item.id === 'lily-pad').count, 1)
  }
})

test('全部衣柜目录取消关卡兑换门槛，价格与首通或钓鱼获取方式保留', () => {
  assert.equal(new Set(WARDROBE_ITEMS.map((item) => item.id)).size, 23)
  assert.deepEqual(
    WARDROBE_ITEMS.filter((item) => item.unlockLevel === 0).length,
    23
  )
  for (const item of WARDROBE_ITEMS) {
    assert.equal(item.unlockLevel, 0)
    assert.ok(Number.isSafeInteger(item.cost) && item.cost > 0)
    assert.equal(item.source.includes('入门赠送'), false)
  }
  const backpack = WARDROBE_ITEMS.find((item) => item.id === 'leaf-backpack')
  assert.equal(backpack.unlockLevel, 0)
  assert.equal(backpack.cost, 90)
})

test('旧存款无需潜水通关即可兑换服饰，余额不足仍不扣钱不发物', () => {
  const db = createSeed()
  run(db, 'getState')
  // 升级后的旧余额继续有效，不要求重玩潜水。
  db.wardrobes[owner].pearls = 1000
  for (const itemId of [
    'acorn-bob',
    'leaf-slippers',
    'leaf-backpack',
    'glow-jelly'
  ]) {
    const state = run(db, 'redeem', { itemId })
    assert.ok(state.owned.some(item => item.id === itemId))
    assert.deepEqual(state.clearedLevels, [])
  }
  assert.equal(run(db, 'getState').pearls, 715)
  db.wardrobes[owner].pearls = 0
  assert.throws(() => run(db, 'redeem', { itemId: 'rain-boots' }), {
    code: 'CONFLICT'
  })
  assert.equal(run(db, 'getState').pearls, 0)
})

test('原通关与重玩珍珠按保留标价兑换，仅按余额检查并保持兑换幂等', () => {
  const db = createSeed()
  grantDiveReward(db, owner, 1)
  for (let index = 0; index < 10; index++) grantDiveReward(db, owner, 1)
  assert.equal(run(db, 'getState').pearls, 110)
  assert.equal(run(db, 'getState').catalog.find(item => item.id === 'leaf-backpack').unlockLevel, 0)
  const firstPurchase = run(db, 'redeem', { itemId: 'acorn-bob' })
  assert.equal(firstPurchase.pearls, 50)
  assert.equal(
    firstPurchase.owned.find((item) => item.id === 'acorn-bob').count,
    1
  )
  assert.equal(run(db, 'redeem', { itemId: 'acorn-bob' }).pearls, 50)
  grantDiveReward(db, owner, 2)
  const backpack = run(db, 'redeem', { itemId: 'leaf-backpack' })
  assert.equal(backpack.pearls, 5)
  assert.equal(
    backpack.owned.find((item) => item.id === 'leaf-backpack').count,
    1
  )
  assert.equal(run(db, 'redeem', { itemId: 'leaf-backpack' }).pearls, 5)
  assert.throws(() => run(db, 'redeem', { itemId: 'glow-jelly' }), {
    code: 'CONFLICT'
  })
  grantDiveReward(db, owner, 3)
  assert.throws(() => run(db, 'redeem', { itemId: 'glow-jelly' }), {
    code: 'CONFLICT'
  })
  for (let index = 0; index < 2; index++) grantDiveReward(db, owner, 3)
  const final = run(db, 'redeem', { itemId: 'glow-jelly' })
  assert.equal(final.pearls, 11)
  assert.equal(final.owned.find((item) => item.id === 'glow-jelly').count, 1)
  assert.deepEqual(final.clearedLevels, [1, 2, 3])
})

test('旧衣柜已有物品和穿戴原样保留，没有通关记录也能继续穿和安全重试', () => {
  const db = createSeed()
  const previous = run(db, 'getState')
  const oldItems = [
    'acorn-bob',
    'straw-hat',
    'moss-cape',
    'leaf-slippers',
    'leaf-backpack',
    'tiny-net',
    'clover-pin'
  ]
  const equipped = Object.fromEntries(
    oldItems.map((id) => [
      WARDROBE_ITEMS.find((item) => item.id === id).slot,
      id
    ])
  )
  db.wardrobes[owner] = {
    owned: oldItems.map((id) => ({ id, count: 1 })),
    equipped,
    pearls: 12,
    clearedLevels: [],
    legacyEquipmentSeen: true,
    legacyFishingCounts: {}
  }
  const expected = structuredClone(db.wardrobes[owner])
  for (const itemId of oldItems) {
    const slot = WARDROBE_ITEMS.find((item) => item.id === itemId).slot
    run(db, 'equip', { slot, itemId })
    assert.equal(run(db, 'redeem', { itemId }).pearls, 12)
  }
  const state = run(db, 'getState')
  assert.deepEqual(state.owned, expected.owned)
  assert.deepEqual(state.equipped, expected.equipped)
  assert.deepEqual(state.clearedLevels, [])
  assert.equal(state.pearls, 12)
  assert.deepEqual(previous.owned, [])
  db.wardrobes[owner].clearedLevels = [1, 2]
  assert.deepEqual(run(db, 'getState').clearedLevels, [1, 2])
})

test('拥有物、珍珠、通关与装备按身份隔离，非法身份和额外参数不放行', () => {
  const db = createSeed()
  grantDiveReward(db, owner, 1)
  run(db, 'equip', { slot: 'outfit', itemId: 'sailor-shirt' })
  const other = dispatchWardrobe(db, 'user_demo_b', 'getState')
  assert.equal(other.pearls, 0)
  assert.deepEqual(other.clearedLevels, [])
  assert.equal(other.equipped.outfit, null)
  assert.equal(
    other.owned.some((item) => item.id === 'sailor-shirt'),
    false
  )
  assert.throws(
    () =>
      dispatchWardrobe(db, 'user_demo_b', 'equip', {
        slot: 'outfit',
        itemId: 'sailor-shirt'
      }),
    { code: 'FORBIDDEN' }
  )
  for (const action of [
    () => dispatchWardrobe(db, 'missing', 'getState'),
    () => grantDiveReward(db, 'missing', 1)
  ])
    assert.throws(action, { code: 'UNAUTHENTICATED' })
  assert.throws(() => run(db, 'getState', { userId: 'user_demo_b' }), {
    code: 'INVALID_ARGUMENT'
  })
  assert.throws(
    () =>
      run(db, 'equip', {
        slot: 'hair',
        itemId: 'acorn-bob',
        ownerId: 'user_demo_b'
      }),
    { code: 'INVALID_ARGUMENT' }
  )
  assert.equal(run(db, 'getState').pearls, 30)
  assert.equal(run(db, 'getState').equipped.outfit, 'sailor-shirt')
  assert.deepEqual(Object.keys(run(db, 'getState')).sort(), [
    'catalog',
    'clearedLevels',
    'equipped',
    'owned',
    'pearls'
  ])
})
