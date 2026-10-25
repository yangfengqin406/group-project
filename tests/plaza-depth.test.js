import test from 'node:test'
import assert from 'node:assert/strict'
import { plazaActorDepths } from '../src/utils/plaza-depth.js'
import { createPlazaWalker } from '../src/utils/plaza-motion.js'

test('相遇角色的脚底深度虽落在同一取整区间，遮挡仍按真实前后关系且只在过路时交换', () => {
  const a = { id: 'self', position: { x: 0.5, y: 0.5 } }
  const b = { id: 'squirrel', position: { x: 0.5, y: 0.50012 } }
  const people = [a, b]
  let previous = null, swaps = 0
  for (let tick = 0; tick <= 80; tick++) {
    a.position.y = 0.4998 + tick * 0.00001
    const depths = plazaActorDepths(people)
    assert.notEqual(depths.self, depths.squirrel)
    const front = depths.self > depths.squirrel ? 'self' : 'squirrel'
    if (a.position.y !== b.position.y)
      assert.equal(front, a.position.y > b.position.y ? 'self' : 'squirrel')
    if (previous && previous !== front) swaps++
    previous = front
  }
  assert.equal(swaps, 1, '真正越过对方脚底时仅交换一次')
})

test('同深度用稳定身份打破平局，不改原数组、不依赖调用方列表顺序', () => {
  const people = ['self', 'capybara', 'mushroom', 'squirrel'].map(id => ({ id, position: { x: 0.5, y: 0.5 } }))
  const order = people.map(p => p.id)
  const depths = plazaActorDepths(people)
  assert.deepEqual(plazaActorDepths([...people].reverse()), depths)
  assert.deepEqual(people.map(p => p.id), order)
  assert.equal(new Set(Object.values(depths)).size, people.length)
})

test('现有邻居真实路线模拟：重叠相遇时不再因取整平局反复换层', () => {
  const residents = [
    { id: 'capybara', position: { x: 0.59, y: 0.39 }, speed: 0.022 },
    { id: 'squirrel', position: { x: 0.67, y: 0.55 }, speed: 0.019 },
    { id: 'mushroom', position: { x: 0.34, y: 0.6 }, speed: 0.025 }
  ]
  const stops = [{ x: 0.43, y: 0.36 }, { x: 0.68, y: 0.45 }, { x: 0.46, y: 0.68 }, { x: 0.33, y: 0.5 }]
  const walkers = residents.map(createPlazaWalker), stopIndexes = [0, 1, 2]
  const previous = new Map()
  let oldRuleFlickers = 0, fixedRuleFlickers = 0
  for (let tick = 0; tick < 20000; tick++) {
    walkers.forEach((walker, index) => {
      if (!walker.getState().moving) {
        stopIndexes[index] = (stopIndexes[index] + 1) % stops.length
        walker.moveTo(stops[stopIndexes[index]])
      }
      walker.advance(0.033)
    })
    const people = walkers.map((walker, index) => ({ id: residents[index].id, ...walker.getState() }))
    const depths = plazaActorDepths(people)
    for (let a = 0; a < people.length; a++) for (let b = a + 1; b < people.length; b++) {
      const pa = people[a], pb = people[b], pair = `${a}:${b}`
      const actual = Math.sign(pa.position.y - pb.position.y)
      const oldDepth = Math.sign(Math.round(pa.position.y * 1000) - Math.round(pb.position.y * 1000)) || -1
      const fixedDepth = Math.sign(depths[pa.id] - depths[pb.id])
      const overlap = Math.abs(pa.position.x - pb.position.x) * 1280 < 43 && Math.abs(pa.position.y - pb.position.y) * 801 < 49
      const last = previous.get(pair)
      if (overlap && last && last.actual === actual) {
        if (last.oldDepth !== oldDepth) oldRuleFlickers++
        if (last.fixedDepth !== fixedDepth) fixedRuleFlickers++
      }
      previous.set(pair, { actual, oldDepth, fixedDepth })
    }
  }
  assert.ok(oldRuleFlickers > 0, '确保模拟确实重现现有步行路线的取整闪烁')
  assert.equal(fixedRuleFlickers, 0)
})
