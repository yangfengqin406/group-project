import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDiveGame,
  replayDive,
  DIVE_MAX_TICKS,
  DIVE_MAX_TRACE
} from '../src/utils/dive-game.js'
import { createSeed } from '../src/mock/seed.js'
import { dispatchDive } from '../src/mock/dive.js'
import { getWardrobeState, grantDiveReward } from '../src/mock/wardrobe.js'

const owner = 'user_demo_a'
const startedAt = Date.parse('2026-10-24T12:00:00+08:00')
const service = (db, action, params = {}, now = startedAt, userId = owner) =>
  dispatchDive(db, userId, action, params, { now, random: () => 0.1 })

function recordedGame(issued) {
  const game = createDiveGame(issued.levelId, { seed: issued.seed })
  const trace = []
  let previous = ''
  const advance = (input, ticks = 1) => {
    if (JSON.stringify(input) !== previous) {
      trace.push({ tick: game.getState().tick, ...input })
      previous = JSON.stringify(input)
    }
    game.setInput(input)
    return game.step(ticks)
  }
  const swimTo = (x, y, extra = {}) => {
    for (let guard = 0; guard < 300; guard++) {
      const state = game.getState()
      if (Math.hypot(x - state.player.x, y - state.player.y) < 0.7 ||
          state.status !== 'playing') return state
      advance({
        dx: Math.abs(x - state.player.x) > 0.4 ? Math.sign(x - state.player.x) : 0,
        dy: Math.abs(y - state.player.y) > 0.4 ? Math.sign(y - state.player.y) : 0,
        fire: false,
        ...extra
      })
    }
    throw new Error('Route fixture did not reach waypoint')
  }
  return {
    game, advance, swimTo,
    proof: () => ({ runId: issued.id, ticks: game.getState().tick, trace })
  }
}

test('缺氧先扣一心，此后每五秒扣一心，仍可操作且不会恢复氧气', () => {
  const game = createDiveGame(1)
  game.step(799)
  assert.equal(game.getState().player.hearts, 3)
  assert.equal(game.getState().oxygenTicks, 1)
  game.step()
  assert.equal(game.getState().status, 'playing')
  assert.equal(game.getState().player.hearts, 2)
  assert.equal(game.getState().oxygenTicks, 0)
  assert.equal(game.getState().oxygenDamageTicks, 100)
  game.setInput({ dx: -1, dy: 0, fire: false })
  game.step(99)
  assert.equal(game.getState().player.hearts, 2)
  assert.ok(game.getState().player.x < 9)
  assert.equal(game.getState().oxygenTicks, 0)
  game.step()
  assert.equal(game.getState().player.hearts, 1)
  game.step(100)
  assert.equal(game.getState().status, 'failed')
  assert.equal(game.getState().player.hearts, 0)
  assert.equal(game.getState().tick, 1000)
})

test('按住返航静止两秒才回岸，移动和松开打断，新一局恢复满心满氧', () => {
  const game = createDiveGame(1)
  game.setInput({ dx: 0, dy: 0, fire: false, returning: true })
  game.step(39)
  assert.equal(game.getState().status, 'playing')
  assert.equal(game.getState().returningTicks, 39)
  game.setInput({ dx: 1, dy: 0, fire: false, returning: true })
  game.step()
  assert.equal(game.getState().returningTicks, 0)
  game.setInput({ dx: 0, dy: 0, fire: false, returning: true })
  game.step(20)
  game.setInput({ dx: 0, dy: 0, fire: false })
  game.step()
  assert.equal(game.getState().returningTicks, 0)
  game.setInput({ dx: 0, dy: 0, fire: false, returning: true })
  game.step(40)
  assert.equal(game.getState().status, 'returned')
  assert.equal(game.getState().returningTicks, 40)
  const ended = game.getState()
  game.step(100)
  assert.deepEqual(game.getState(), ended)
  const fresh = createDiveGame(1).getState()
  assert.equal(fresh.player.hearts, 3)
  assert.equal(fresh.oxygenTicks, 800)
  assert.equal(fresh.returningTicks, 0)
})

test('服务验证返航带回本局珍珠，保留历史成果，不解锁或重复结算', () => {
  const db = createSeed()
  grantDiveReward(db, owner, 1)
  const before = getWardrobeState(db, owner)
  const issued = service(db, 'start', { levelId: 2 })
  assert.equal(issued.rulesVersion, 2)
  const run = recordedGame(issued)
  run.swimTo(21, 52)
  run.advance({ dx: 0, dy: 0, fire: false, returning: true }, 40)
  const proof = run.proof()
  assert.equal(run.game.getState().status, 'returned')
  const now = startedAt + proof.ticks * 50
  const result = service(db, 'finish', proof, now)
  assert.equal(result.status, 'returned')
  assert.equal(result.rulesVersion, 2)
  assert.equal(result.collectedPearls, 1)
  assert.deepEqual(result.reward, { firstClear: false, items: [], pearls: 1 })
  assert.equal(result.wardrobe.pearls, 31)
  assert.deepEqual(result.wardrobe.owned, before.owned)
  assert.deepEqual(result.state.clearedLevels, [1])
  assert.equal(result.state.unlockedLevel, 2)
  assert.equal(result.state.activeRun, null)
  assert.deepEqual(result.state.lastSettlement, {
    runId: issued.id, levelId: 2, rulesVersion: 2,
    status: 'returned', collectedPearls: 1, reward: result.reward
  })
  assert.throws(() => service(db, 'finish', proof, now), { code: 'CONFLICT' })
  const state = service(db, 'getState', {}, now)
  assert.equal(state.pearls, 31)
  state.lastSettlement.reward.pearls = 999
  assert.equal(service(db, 'getState', {}, now).lastSettlement.reward.pearls, 1)
  assert.equal(service(db, 'getState', {}, now, 'user_demo_b').pearls, 0)
  assert.equal(service(db, 'getState', {}, now, 'user_demo_b').lastSettlement, null)
})

test('返航中缺氧受伤会打断进度；低血仍可完成返航', () => {
  const game = createDiveGame(1)
  game.step(770)
  game.setInput({ dx: 0, dy: 0, fire: false, returning: true })
  game.step(29)
  assert.equal(game.getState().returningTicks, 29)
  game.step()
  assert.equal(game.getState().player.hearts, 2)
  assert.equal(game.getState().returningTicks, 0)
  game.step(39)
  assert.equal(game.getState().status, 'playing')
  game.step()
  assert.equal(game.getState().status, 'returned')
  assert.equal(game.getState().player.hearts, 2)
  assert.equal(game.getState().oxygenTicks, 0)
  assert.equal(game.getState().tick, 840)
})

function firstUrchinCollision(waitTicks = 0) {
  const run = recordedGame({ levelId: 1, seed: 1 })
  if (waitTicks) run.advance({ dx: 0, dy: 0, fire: false }, waitTicks)
  run.swimTo(22, 60)
  run.swimTo(80, 60)
  for (let guard = 0; guard < 60; guard++) {
    const state = run.advance({ dx: 0, dy: -1, fire: false })
    if (state.player.hearts < 3) return run
  }
  throw new Error('Route fixture must collide with the fixed urchin')
}

test('碰撞和第一次缺氧同一步发生最多扣一心，仍保留受伤保护', () => {
  const baseline = firstUrchinCollision()
  const travelTicks = baseline.game.getState().tick
  assert.ok(travelTicks < 800)
  const run = firstUrchinCollision(800 - travelTicks)
  const state = run.game.getState()
  assert.equal(state.tick, 800)
  assert.equal(state.oxygenTicks, 0)
  assert.equal(state.player.hearts, 2)
  assert.equal(state.player.invulnerableTicks, 30)
  assert.equal(state.oxygenDamageTicks, 100)
  run.advance({ dx: 0, dy: 0, fire: false }, 5)
  assert.equal(run.game.getState().player.hearts, 2)
})

test('失败只失去本局已拾收获，历史余额、装扮与通关保留', () => {
  const db = createSeed()
  grantDiveReward(db, owner, 1)
  const before = getWardrobeState(db, owner)
  const issued = service(db, 'start', { levelId: 1 })
  const run = recordedGame(issued)
  run.swimTo(22, 52)
  assert.equal(run.game.getState().pearlsCollected, 1)
  run.advance({ dx: 0, dy: 0, fire: false }, 1100)
  const proof = run.proof()
  assert.equal(run.game.getState().status, 'failed')
  const now = startedAt + proof.ticks * 50
  const result = service(db, 'finish', proof, now)
  assert.equal(result.reward, null)
  assert.equal(result.collectedPearls, 1)
  assert.deepEqual(result.wardrobe, before)
  assert.equal(result.state.lastSettlement.status, 'failed')
  assert.equal(result.state.lastSettlement.collectedPearls, 1)
  assert.throws(() => service(db, 'finish', proof, now), { code: 'CONFLICT' })
  assert.deepEqual(getWardrobeState(db, owner), before)
})

test('旧规则活动编号失效，不能重放领取；新局统一版本和六十秒回放预算', () => {
  const db = createSeed()
  const oldRun = service(db, 'start', { levelId: 1 })
  delete db.diveRuns[owner].rulesVersion
  assert.throws(() => service(db, 'finish', {
    runId: oldRun.id, ticks: 40,
    trace: [{ tick: 0, dx: 0, dy: 0, fire: false, returning: true }]
  }, startedAt + 2000), { code: 'CONFLICT' })
  assert.equal(service(db, 'getState').activeRun, null)
  const fresh = service(db, 'start', { levelId: 1 })
  assert.equal(fresh.rulesVersion, 2)
  assert.equal(fresh.expiresAt - fresh.startedAt, 360000)
  assert.notEqual(fresh.id, oldRun.id)
  assert.equal(DIVE_MAX_TICKS, 1200)
  assert.equal(DIVE_MAX_TRACE, 1200)
  const terminal = replayDive(3, { seed: 1, ticks: 1100, trace: [] })
  assert.equal(terminal.status, 'failed')
  assert.equal(terminal.tick, 1100)
  assert.throws(() => replayDive(3, { seed: 1, ticks: 1201, trace: [] }), {
    code: 'INVALID_ARGUMENT'
  })
})

test('返航证明不能缩短两秒、伪造状态或金额，旧三字段输入继续兼容', () => {
  const db = createSeed()
  const issued = service(db, 'start', { levelId: 1 })
  const trace = [{ tick: 0, dx: 0, dy: 0, fire: false, returning: true }]
  for (const params of [
    { runId: issued.id, ticks: 39, trace },
    { runId: issued.id, ticks: 40, trace, status: 'returned' },
    { runId: issued.id, ticks: 40, trace, collectedPearls: 999 },
    { runId: issued.id, ticks: 40, trace, reward: { pearls: 999 } },
    { runId: issued.id, ticks: 40, trace: [{ ...trace[0], returning: 'true' }] },
    { runId: issued.id, ticks: 40, trace: [{ ...trace[0], returning: undefined }] }
  ]) {
    assert.throws(() => service(db, 'finish', params, startedAt + 2000), {
      code: 'INVALID_ARGUMENT'
    })
    assert.equal(service(db, 'getState').activeRun.id, issued.id)
    assert.equal(service(db, 'getState').pearls, 0)
  }
  assert.throws(() => service(db, 'finish', {
    runId: issued.id, ticks: 40, trace
  }, startedAt + 2000, 'user_demo_b'), { code: 'CONFLICT' })
  const valid = service(db, 'finish', { runId: issued.id, ticks: 40, trace }, startedAt + 2000)
  assert.equal(valid.status, 'returned')
  assert.deepEqual(valid.reward, { firstClear: false, items: [], pearls: 0 })
  assert.deepEqual(valid.state.clearedLevels, [])
  const legacy = replayDive(1, {
    seed: 1, ticks: 10, trace: [{ tick: 0, dx: 1, dy: 0, fire: false }]
  })
  assert.equal(legacy.status, 'playing')
  assert.ok(Math.abs(legacy.player.x - 14.5) < 1e-9)
  assert.equal(legacy.returningTicks, 0)
})

test('返航不消耗首通机会，之后真正通关才得到固定套装和通关奖金', () => {
  const db = createSeed()
  const first = service(db, 'start', { levelId: 1 })
  const outing = recordedGame(first)
  outing.swimTo(22, 52)
  outing.advance({ dx: 0, dy: 0, fire: false, returning: true }, 40)
  const returnedProof = outing.proof()
  let now = startedAt + returnedProof.ticks * 50
  const returned = service(db, 'finish', returnedProof, now)
  assert.deepEqual(returned.wardrobe.owned, [])
  assert.equal(returned.state.unlockedLevel, 1)
  const next = service(db, 'start', { levelId: 1 }, now)
  const adventure = recordedGame(next)
  for (const [x, y] of [[22, 54], [22, 60], [49, 60], [49, 42], [76, 42], [76, 21], [91, 12]])
    adventure.swimTo(x, y, { fire: true })
  const proof = adventure.proof()
  now += proof.ticks * 50
  const cleared = service(db, 'finish', proof, now)
  assert.equal(cleared.status, 'cleared')
  assert.equal(cleared.collectedPearls, 3)
  assert.deepEqual(cleared.reward, {
    firstClear: true, items: ['sailor-shirt', 'shell-shoes'], pearls: 33
  })
  assert.equal(cleared.wardrobe.pearls, 34)
  assert.equal(cleared.state.unlockedLevel, 2)
  assert.equal(cleared.wardrobe.owned.find((item) => item.id === 'sailor-shirt').count, 1)
})
