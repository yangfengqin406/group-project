import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDiveGame,
  replayDive,
  DIVE_STEP_MS,
  DIVE_LEVELS
} from '../src/utils/dive-game.js'

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

function completeLevel(levelId, seed = 123) {
  const game = createDiveGame(levelId, { seed })
  const trace = []
  let last = ''
  for (const [x, y] of routes[levelId]) {
    for (let guard = 0; guard < 500; guard++) {
      const state = game.getState()
      if (state.status !== 'playing') return { state, trace, ticks: state.tick }
      if (Math.hypot(x - state.player.x, y - state.player.y) < 0.8) break
      const input = {
        dx:
          Math.abs(x - state.player.x) > 0.45
            ? Math.sign(x - state.player.x)
            : 0,
        dy:
          Math.abs(y - state.player.y) > 0.45
            ? Math.sign(y - state.player.y)
            : 0,
        fire: true
      }
      if (JSON.stringify(input) !== last) {
        trace.push({ tick: state.tick, ...input })
        last = JSON.stringify(input)
      }
      game.setInput(input)
      game.step()
    }
  }
  const state = game.getState()
  return { state, trace, ticks: state.tick }
}

test('固定50ms步长、输入移动与快照独立，撞珊瑚不穿墙', () => {
  assert.equal(DIVE_STEP_MS, 50)
  assert.equal(DIVE_LEVELS.length, 3)
  const game = createDiveGame(1, { seed: 5 })
  const first = game.getState()
  first.player.x = 99
  assert.equal(game.getState().player.x, 9)
  game.setInput({ dx: 1, dy: 0, fire: false })
  game.step(10)
  assert.ok(Math.abs(game.getState().player.x - 14.5) < 0.00001)
  game.step(60)
  assert.ok(game.getState().player.x <= 31.6)
  assert.equal(game.getState().player.hearts, 3)
})

function swim(game, waypoints, fire = false) {
  for (const [x, y] of waypoints) {
    for (let guard = 0; guard < 250; guard++) {
      const state = game.getState()
      if (
        Math.hypot(x - state.player.x, y - state.player.y) < 0.7 ||
        state.status !== 'playing'
      )
        break
      game.setInput({
        dx:
          Math.abs(x - state.player.x) > 0.4
            ? Math.sign(x - state.player.x)
            : 0,
        dy:
          Math.abs(y - state.player.y) > 0.4
            ? Math.sign(y - state.player.y)
            : 0,
        fire
      })
      game.step()
    }
  }
}

test('斜游速度不翻倍，边界与珊瑚阻挡，贴墙仍可沿边滑动', () => {
  const diagonal = createDiveGame(1)
  diagonal.setInput({ dx: -1, dy: -1, fire: false })
  diagonal.step()
  const player = diagonal.getState().player
  assert.ok(Math.abs(Math.hypot(player.x - 9, player.y - 54) - 0.55) < 1e-9)
  diagonal.step(200)
  assert.equal(diagonal.getState().player.x, 2.4)
  assert.equal(diagonal.getState().player.y, 2.4)
  const wall = createDiveGame(1)
  wall.setInput({ dx: 1, dy: 0, fire: false })
  wall.step(60)
  const before = wall.getState().player
  wall.setInput({ dx: 1, dy: -1, fire: false })
  wall.step()
  assert.equal(wall.getState().player.x, before.x)
  assert.ok(wall.getState().player.y < before.y)
})

test('泡泡真实击退海胆；碰撞扣心且有短暂无敌，不会一帧耗尽爱心', () => {
  const bubbleGame = createDiveGame(1)
  swim(bubbleGame, [
    [22, 60],
    [80, 60],
    [80, 49]
  ])
  const before = bubbleGame
    .getState()
    .enemies.find((enemy) => enemy.type === 'urchin')
  bubbleGame.setInput({ dx: 0, dy: -1, fire: true })
  bubbleGame.step(8)
  const hit = bubbleGame
    .getState()
    .enemies.find((enemy) => enemy.type === 'urchin')
  assert.ok(hit.stunnedTicks > 0)
  assert.ok(hit.y < before.y)
  const collision = createDiveGame(1)
  swim(collision, [
    [22, 60],
    [80, 60],
    [80, 44]
  ])
  const touched = collision.getState().player
  assert.equal(touched.hearts, 2)
  assert.ok(touched.invulnerableTicks > 0)
  collision.setInput({ dx: 0, dy: 0, fire: false })
  collision.step(5)
  assert.equal(collision.getState().player.hearts, 2)
})

test('未捡齐珍珠不能走捷径通关；缺氧逐步耗尽爱心且终局不再推进', () => {
  const game = createDiveGame(1)
  swim(game, [
    [9, 3],
    [91, 3],
    [91, 12]
  ])
  assert.equal(game.getState().pearlsCollected, 0)
  assert.equal(game.getState().status, 'playing')
  const idle = createDiveGame(1)
  idle.step(800)
  assert.equal(idle.getState().status, 'playing')
  assert.equal(idle.getState().player.hearts, 2)
  assert.equal(idle.getState().oxygenTicks, 0)
  idle.step(200)
  assert.equal(idle.getState().status, 'failed')
  assert.equal(idle.getState().player.hearts, 0)
  const final = idle.getState()
  idle.step(20)
  assert.deepEqual(idle.getState(), final)
})

test('重放拒绝过量、非整数、倒序/重复时间、速度和成功字段伪造', () => {
  const bad = [
    { ticks: 1201, trace: [] },
    { ticks: 1.5, trace: [] },
    { ticks: 1, trace: [{ tick: 1, dx: 0, dy: 0, fire: false }] },
    {
      ticks: 3,
      trace: [
        { tick: 1, dx: 0, dy: 0, fire: false },
        { tick: 0, dx: 1, dy: 0, fire: false }
      ]
    },
    {
      ticks: 3,
      trace: [
        { tick: 1, dx: 0, dy: 0, fire: false },
        { tick: 1, dx: 1, dy: 0, fire: false }
      ]
    },
    { ticks: 2, trace: [{ tick: 0, dx: 99, dy: 0, fire: false }] },
    { ticks: 2, trace: Array(1) },
    { ticks: 2, trace: [{ tick: 0, dx: 1, dy: 0, fire: true, won: true }] }
  ]
  for (const proof of bad)
    assert.throws(() => replayDive(1, { seed: 5, ...proof }), {
      code: 'INVALID_ARGUMENT'
    })
  assert.throws(() => createDiveGame(4), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => createDiveGame(1, { seed: NaN }), {
    code: 'INVALID_ARGUMENT'
  })
})

test('三关可通过公开方向/泡泡输入收集珍珠并找到出口，seed回放一致', () => {
  for (const levelId of [1, 2, 3]) {
    const result = completeLevel(levelId)
    assert.equal(
      result.state.status,
      'cleared',
      `level ${levelId}: ${JSON.stringify(result.state.player)}`
    )
    assert.equal(result.state.pearlsCollected, result.state.requiredPearls)
    assert.deepEqual(
      replayDive(levelId, {
        seed: 123,
        ticks: result.ticks,
        trace: result.trace
      }),
      result.state
    )
  }
})
