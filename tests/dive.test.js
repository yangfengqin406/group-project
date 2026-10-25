import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import { dispatchDive } from '../src/mock/dive.js'
import { createDiveGame } from '../src/utils/dive-game.js'

const owner = 'user_demo_a'
const startedAt = Date.parse('2026-10-16T12:00:00+08:00')
const run = (db, action, params = {}, now = startedAt) =>
  dispatchDive(db, owner, action, params, { now, random: () => 0.1 })
function proofFor(issued) {
  const game = createDiveGame(issued.levelId, { seed: issued.seed })
  const routes = {
    1: [
      [22, 54],
      [22, 60],
      [49, 60],
      [49, 42],
      [76, 42],
      [76, 21],
      [91, 12]
    ],
    2: [
      [21, 52],
      [45, 52],
      [45, 20],
      [74, 18],
      [85, 47],
      [91, 11]
    ],
    3: [
      [20, 52],
      [20, 18],
      [41, 16],
      [41, 37],
      [62, 44],
      [66, 60],
      [84, 60],
      [84, 48],
      [88, 15],
      [92, 10]
    ]
  }
  const trace = []
  let previous = ''
  for (const [x, y] of routes[issued.levelId]) {
    for (let guard = 0; guard < 500; guard++) {
      const s = game.getState()
      if (s.status !== 'playing')
        return { runId: issued.id, ticks: s.tick, trace }
      if (Math.hypot(x - s.player.x, y - s.player.y) < 0.8) break
      const input = {
        dx: Math.abs(x - s.player.x) > 0.45 ? Math.sign(x - s.player.x) : 0,
        dy: Math.abs(y - s.player.y) > 0.45 ? Math.sign(y - s.player.y) : 0,
        fire: true
      }
      if (JSON.stringify(input) !== previous) {
        trace.push({ tick: s.tick, ...input })
        previous = JSON.stringify(input)
      }
      game.setInput(input)
      game.step()
    }
  }
  throw new Error('Fixture did not reach exit')
}

test('首次只解锁浅湾，服务签发种子与编号，真实回放成功后只发一次首通奖励', () => {
  const db = createSeed()
  assert.equal(run(db, 'getState').unlockedLevel, 1)
  assert.throws(() => run(db, 'start', { levelId: 2 }), { code: 'FORBIDDEN' })
  const issued = run(db, 'start', { levelId: 1 })
  const proof = proofFor(issued)
  assert.throws(() => run(db, 'finish', proof, startedAt + 100), {
    code: 'INVALID_ARGUMENT'
  })
  const result = run(db, 'finish', proof, startedAt + proof.ticks * 50)
  assert.equal(result.status, 'cleared')
  assert.deepEqual(result.reward, {
    firstClear: true,
    items: ['sailor-shirt', 'shell-shoes'],
    pearls: 33
  })
  assert.equal(result.state.unlockedLevel, 2)
  assert.equal(result.state.activeRun, null)
  assert.throws(() => run(db, 'finish', proof, startedAt + proof.ticks * 50), {
    code: 'CONFLICT'
  })
  assert.equal(run(db, 'getState').pearls, 33)
})

test('失败不给奖励、不扣衣柜，编号消费；新run、过期及他人run不能结算', () => {
  const db = createSeed()
  const before = run(db, 'getState')
  const stale = run(db, 'start', { levelId: 1 })
  const issued = run(db, 'start', { levelId: 1 })
  assert.notEqual(stale.id, issued.id)
  assert.throws(
    () =>
      run(
        db,
        'finish',
        { runId: stale.id, ticks: 1000, trace: [] },
        startedAt + 50000
      ),
    { code: 'CONFLICT' }
  )
  assert.throws(
    () =>
      dispatchDive(
        db,
        'user_demo_b',
        'finish',
        { runId: issued.id, ticks: 1000, trace: [] },
        { now: startedAt + 50000 }
      ),
    { code: 'CONFLICT' }
  )
  const failed = run(
    db,
    'finish',
    { runId: issued.id, ticks: 1000, trace: [] },
    startedAt + 50000
  )
  assert.equal(failed.status, 'failed')
  assert.equal(failed.reward, null)
  assert.equal(failed.wardrobe.pearls, before.pearls)
  assert.deepEqual(failed.wardrobe.clearedLevels, [])
  assert.throws(
    () =>
      run(
        db,
        'finish',
        { runId: issued.id, ticks: 1000, trace: [] },
        startedAt + 50000
      ),
    { code: 'CONFLICT' }
  )
  const expired = run(db, 'start', { levelId: 1 })
  assert.equal(run(db, 'getState', {}, expired.expiresAt + 1).activeRun, null)
  assert.throws(
    () =>
      run(
        db,
        'finish',
        { runId: expired.id, ticks: 1000, trace: [] },
        expired.expiresAt + 1
      ),
    { code: 'CONFLICT' }
  )
})

test('关卡递进首通固定奖励，重玩只给珍珠，返回值不能改写保存结果', () => {
  const db = createSeed()
  let now = startedAt
  const amounts = [33, 49, 65]
  for (const levelId of [1, 2, 3, 1]) {
    const issued = run(db, 'start', { levelId }, now)
    const proof = proofFor(issued)
    now += proof.ticks * 50
    const result = run(db, 'finish', proof, now)
    assert.equal(result.status, 'cleared')
    const repeated = result.state.clearedLevels.length === 3 && levelId === 1
    assert.equal(result.reward.firstClear, !repeated)
    assert.equal(result.reward.pearls, repeated ? 11 : amounts[levelId - 1])
    if (repeated) assert.deepEqual(result.reward.items, [])
    result.wardrobe.pearls = 99999
    result.state.clearedLevels.length = 0
  }
  assert.deepEqual(run(db, 'getState').clearedLevels, [1, 2, 3])
  assert.equal(run(db, 'getState').pearls, 158)
  assert.equal(dispatchDive(db, 'user_demo_b', 'getState').pearls, 0)
})

test('拒绝伪造奖励/身份/完成状态、未完成证明和非记录输入，失败不影响有效run', () => {
  const db = createSeed()
  const issued = run(db, 'start', { levelId: 1 })
  for (const [action, params] of [
    ['getState', { userId: 'user_demo_b' }],
    ['start', { levelId: 1, seed: 1 }],
    ['finish', { runId: issued.id, ticks: 1, trace: [], won: true }],
    ['finish', { runId: issued.id, ticks: 1, trace: [], reward: 9999 }],
    ['finish', { runId: issued.id, ticks: 1, trace: [] }],
    [
      'finish',
      {
        runId: issued.id,
        ticks: 1,
        trace: [{ tick: 0, dx: 999, dy: 0, fire: true }]
      }
    ]
  ])
    assert.throws(() => run(db, action, params, startedAt + 1000), {
      code: 'INVALID_ARGUMENT'
    })
  assert.equal(run(db, 'getState').activeRun.id, issued.id)
  assert.equal(run(db, 'getState').pearls, 0)
  assert.throws(() => dispatchDive(db, 'missing', 'getState'), {
    code: 'UNAUTHENTICATED'
  })
})
