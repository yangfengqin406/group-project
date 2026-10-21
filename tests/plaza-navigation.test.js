import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPlazaNavigator,
  PLAZA_HOUSES,
  PLAZA_AREAS
} from '../src/utils/plaza-navigation.js'

const distance = (a, b) => Math.hypot(a.x - b.x, ((a.y - b.y) * 801) / 1280)
const inside = (point, box) =>
  point.x > box[0] && point.x < box[2] && point.y > box[1] && point.y < box[3]
const obstacles = [
  [0.43, 0.43, 0.59, 0.59], // 中心树岛
  [0.17, 0.17, 0.365, 0.36], // 搭子屋顶
  [0.63, 0.11, 0.89, 0.305], // 失物屋顶
  [0.11, 0.61, 0.335, 0.69], // 集市实体屋顶；右上角斜檐外是步道
  [0.72, 0.53, 0.95, 0.69] // 自己的家屋顶
]

test('点击房子先行走，抵达真实门口后只能消费一次进入事件', () => {
  const navigator = createPlazaNavigator()
  const house = PLAZA_HOUSES.find((item) => item.id === 'partner')
  navigator.enterHouse(house.id)
  assert.equal(navigator.getState().moving, true)
  assert.equal(navigator.consumeEntry(), null)
  navigator.advance(0.1)
  assert.equal(navigator.consumeEntry(), null)
  navigator.advance(100)
  assert.equal(navigator.getState().moving, false)
  assert.ok(distance(navigator.getState().position, house.door) < 0.000001)
  assert.equal(navigator.consumeEntry().id, house.id)
  assert.equal(navigator.consumeEntry(), null)
  navigator.advance(100)
  assert.equal(navigator.consumeEntry(), null)
})

test('四条门口支路与步道相接，逐步行走不会穿过中心树岛或建筑屋顶', () => {
  const navigator = createPlazaNavigator({ speed: 0.16 })
  for (const house of PLAZA_HOUSES) {
    navigator.enterHouse(house.id)
    let steps = 0
    while (navigator.getState().moving && steps++ < 1000) {
      const before = navigator.getState().position
      navigator.advance(0.04)
      const after = navigator.getState().position
      assert.ok(distance(before, after) <= 0.16 * 0.04 + 0.000001)
      assert.ok(obstacles.every((box) => !inside(after, box)))
    }
    assert.ok(steps < 1000)
    assert.ok(distance(navigator.getState().position, house.door) < 0.000001)
    assert.equal(navigator.consumeEntry().id, house.id)
  }
})

test('支路途中改目标保留当前位置，退回相连步道后前往新门口', () => {
  const navigator = createPlazaNavigator({ speed: 0.16 })
  navigator.enterHouse('partner')
  for (let i = 0; i < 200 && navigator.getState().position.x >= 0.34; i++)
    navigator.advance(0.04)
  const branchPosition = navigator.getState().position
  assert.ok(branchPosition.x < 0.34)
  navigator.enterHouse('lost')
  assert.deepEqual(navigator.getState().position, branchPosition)
  assert.equal(navigator.consumeEntry(), null)
  let returnedToLoop = false
  while (navigator.getState().moving) {
    const before = navigator.getState().position
    navigator.advance(0.04)
    const after = navigator.getState().position
    if (after.x >= 0.369) returnedToLoop = true
    assert.ok(distance(before, after) <= 0.16 * 0.04 + 0.000001)
    assert.ok(obstacles.every((box) => !inside(after, box)))
  }
  assert.equal(returnedToLoop, true)
  assert.equal(navigator.consumeEntry().id, 'lost')
})

test('新普通目标和离页取消都清除待进入，位置不跳动也不会延迟入门', () => {
  const navigator = createPlazaNavigator()
  navigator.enterHouse('home')
  navigator.advance(0.2)
  navigator.moveTo({ x: 0.33, y: 0.5 })
  navigator.advance(100)
  assert.equal(navigator.consumeEntry(), null)
  navigator.enterHouse('market')
  navigator.advance(0.2)
  const stopped = navigator.getState().position
  navigator.cancelEntry()
  navigator.advance(100)
  assert.deepEqual(navigator.getState().position, stopped)
  assert.equal(navigator.consumeEntry(), null)
  navigator.enterHouse('market')
  navigator.advance(100)
  navigator.cancelEntry()
  assert.equal(navigator.consumeEntry(), null)
})

test('普通门口目标也能触发进入，非法目标不会破坏当前行走', () => {
  const navigator = createPlazaNavigator()
  const house = PLAZA_HOUSES.find((item) => item.id === 'home')
  navigator.moveTo(house.door)
  const before = navigator.getState()
  assert.throws(() => navigator.moveTo({ x: NaN, y: 0 }), TypeError)
  assert.throws(() => navigator.enterHouse('missing'), RangeError)
  assert.deepEqual(navigator.getState(), before)
  navigator.advance(100)
  assert.equal(navigator.consumeEntry().id, 'home')
  assert.throws(() => createPlazaNavigator({ speed: 0 }), TypeError)
})

test('池边与休息亭沿支路抵达后才触发一次地点事件，业务房子仍只有四栋', () => {
  assert.equal(PLAZA_HOUSES.length, 4)
  assert.deepEqual(
    PLAZA_AREAS.map((area) => area.id),
    ['pond', 'pavilion']
  )
  const navigator = createPlazaNavigator({ speed: 0.16 })
  for (const area of PLAZA_AREAS) {
    navigator.enterArea(area.id)
    assert.equal(navigator.getState().moving, true)
    assert.equal(navigator.consumeEntry(), null)
    let steps = 0
    while (navigator.getState().moving && steps++ < 1000) {
      navigator.advance(0.04)
      const point = navigator.getState().position
      assert.ok(obstacles.every((box) => !inside(point, box)))
      assert.ok(
        point.x >= 0.205 || point.y <= 0.835,
        '只在栈台上停靠，不走入池水'
      )
    }
    assert.ok(steps < 1000)
    assert.ok(distance(navigator.getState().position, area.door) < 0.000001)
    const entry = navigator.consumeEntry()
    assert.equal(entry.id, area.id)
    assert.equal(entry.kind, 'area')
    assert.equal(navigator.consumeEntry(), null)
  }
})

test('池边支路途中转去亭子或房子不会瞬移，取消后不会误开钓鱼面板', () => {
  const navigator = createPlazaNavigator({ speed: 0.16 })
  navigator.enterArea('pond')
  for (let i = 0; i < 500 && navigator.getState().position.x >= 0.29; i++)
    navigator.advance(0.04)
  const before = navigator.getState().position
  assert.ok(before.x < 0.29)
  navigator.enterArea('pavilion')
  assert.deepEqual(navigator.getState().position, before)
  assert.equal(navigator.consumeEntry(), null)
  while (navigator.getState().moving) {
    const previous = navigator.getState().position
    navigator.advance(0.04)
    const next = navigator.getState().position
    assert.ok(distance(previous, next) <= 0.16 * 0.04 + 0.000001)
    assert.ok(obstacles.every((box) => !inside(next, box)))
    assert.ok(next.x >= 0.205 || next.y <= 0.835)
  }
  assert.equal(navigator.consumeEntry().id, 'pavilion')
  navigator.enterArea('pond')
  navigator.advance(0.3)
  navigator.enterHouse('partner')
  navigator.advance(100)
  assert.equal(navigator.consumeEntry().id, 'partner')
  navigator.enterArea('pond')
  navigator.cancelEntry()
  navigator.advance(100)
  assert.equal(navigator.consumeEntry(), null)
  assert.throws(() => navigator.enterArea('missing'), RangeError)
})

test('下方石板路的普通点击停在石板附近，不再吸附到主路或门口', () => {
  const navigator = createPlazaNavigator()
  const stone = { x: 0.6, y: 0.852 }
  navigator.moveTo(stone)
  assert.ok(distance(navigator.getState().target, stone) < 0.005)
  assert.equal(navigator.getState().entering, null)
  navigator.advance(100)
  assert.ok(distance(navigator.getState().position, stone) < 0.005)
  assert.equal(navigator.consumeEntry(), null)
})

test('石板路两端连通池边和家门前，沿路逐步抵达后才触发地点事件', () => {
  const stone = { x: 0.6, y: 0.852 }
  const goals = [
    { kind: 'area', id: 'pond', junction: { x: 0.34, y: 0.78 } },
    { kind: 'house', id: 'home', junction: { x: 0.74, y: 0.74 } }
  ]
  for (const goal of goals) {
    const navigator = createPlazaNavigator({ position: stone, speed: 0.16 })
    const destination = [...PLAZA_HOUSES, ...PLAZA_AREAS].find(
      (item) => item.id === goal.id
    )
    assert.ok(distance(navigator.getState().position, stone) < 0.005)
    if (goal.kind === 'area') navigator.enterArea(goal.id)
    else navigator.enterHouse(goal.id)
    let steps = 0,
      passedJunction = false
    while (navigator.getState().moving && steps++ < 1000) {
      const before = navigator.getState().position
      assert.equal(navigator.consumeEntry(), null)
      navigator.advance(0.02)
      const after = navigator.getState().position
      assert.ok(distance(before, after) <= 0.16 * 0.02 + 0.000001)
      assert.ok(obstacles.every((box) => !inside(after, box)))
      assert.ok(after.x >= 0.205 || after.y <= 0.835)
      if (distance(after, goal.junction) < 0.005) passedJunction = true
    }
    assert.ok(steps < 1000)
    assert.equal(passedJunction, true, '从相应石板路端点接入原有支路')
    assert.ok(distance(navigator.getState().position, destination.door) < 0.000001)
    assert.equal(navigator.consumeEntry().id, goal.id)
    assert.equal(navigator.consumeEntry(), null)
  }
})

test('石板路途中改目标不瞬移，普通石板目标会取消待入屋且停止后不误触', () => {
  const navigator = createPlazaNavigator({
    position: { x: 0.45, y: 0.8 },
    speed: 0.16
  })
  navigator.moveTo({ x: 0.67, y: 0.892 })
  navigator.advance(0.3)
  const beforeHome = navigator.getState().position
  navigator.enterHouse('home')
  assert.deepEqual(navigator.getState().position, beforeHome)
  navigator.advance(0.2)
  const beforeStone = navigator.getState().position
  const stone = { x: 0.55, y: 0.83 }
  navigator.moveTo(stone)
  assert.deepEqual(navigator.getState().position, beforeStone)
  assert.equal(navigator.getState().entering, null)
  navigator.advance(100)
  assert.ok(distance(navigator.getState().position, stone) < 0.005)
  assert.equal(navigator.consumeEntry(), null)
  navigator.enterHouse('home')
  navigator.advance(0.2)
  const stopped = navigator.getState().position
  navigator.cancelEntry()
  navigator.advance(100)
  assert.deepEqual(navigator.getState().position, stopped)
  assert.equal(navigator.consumeEntry(), null)
})
