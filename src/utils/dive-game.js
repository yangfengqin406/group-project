import { requireThat } from './errors.js'

export const DIVE_STEP_MS = 50
export const DIVE_WIDTH = 100
export const DIVE_HEIGHT = 64
export const DIVE_RULES_VERSION = 2
export const DIVE_MAX_TICKS = 1200
export const DIVE_MAX_TRACE = DIVE_MAX_TICKS
export const DIVE_RETURN_TICKS = 40
export const DIVE_OXYGEN_DAMAGE_TICKS = 100
export const DIVE_LEVELS = Object.freeze([
  Object.freeze({
    id: 1,
    name: '浅湾拾光',
    oxygenSeconds: 40,
    requiredPearls: 3
  }),
  Object.freeze({
    id: 2,
    name: '珊瑚小径',
    oxygenSeconds: 42,
    requiredPearls: 4
  }),
  Object.freeze({
    id: 3,
    name: '星光海沟',
    oxygenSeconds: 45,
    requiredPearls: 5
  })
])
const configurations = {
  1: {
    pearls: [
      [22, 52],
      [49, 42],
      [76, 21]
    ],
    walls: [
      [34, 34, 8, 22],
      [61, 10, 8, 22]
    ],
    enemies: [
      ['fish', 44, 53, 55, 53],
      ['urchin', 80, 41, 80, 41]
    ],
    exit: [91, 12]
  },
  2: {
    pearls: [
      [21, 52],
      [45, 20],
      [74, 18],
      [85, 47]
    ],
    walls: [
      [30, 12, 7, 35],
      [58, 30, 8, 27]
    ],
    enemies: [
      ['fish', 41, 34, 49, 34],
      ['fish', 76, 38, 88, 38],
      ['urchin', 46, 56, 46, 56]
    ],
    exit: [91, 11]
  },
  3: {
    pearls: [
      [20, 52],
      [41, 16],
      [62, 44],
      [84, 48],
      [88, 15]
    ],
    walls: [
      [28, 24, 7, 33],
      [50, 4, 7, 28],
      [72, 28, 7, 28]
    ],
    enemies: [
      ['fish', 39, 40, 46, 40],
      ['fish', 60, 14, 68, 14],
      ['urchin', 65, 53, 65, 53],
      ['urchin', 87, 31, 87, 31]
    ],
    exit: [92, 10]
  }
}
const clone = (value) => JSON.parse(JSON.stringify(value))
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const playerRadius = 2.4
const speed = 0.55

function validInput(input) {
  requireThat(
    input &&
      typeof input === 'object' &&
      !Array.isArray(input) &&
      Reflect.ownKeys(input).every((key) =>
        ['dx', 'dy', 'fire', 'returning'].includes(key)
      ) &&
      ['dx', 'dy', 'fire'].every((key) =>
        Object.prototype.hasOwnProperty.call(input, key)
      ) &&
      [-1, 0, 1].includes(input.dx) &&
      [-1, 0, 1].includes(input.dy) &&
      typeof input.fire === 'boolean' &&
      (!Object.prototype.hasOwnProperty.call(input, 'returning') ||
        typeof input.returning === 'boolean'),
    'INVALID_ARGUMENT',
    '潜水输入只接受方向、泡泡和返航操作'
  )
  return {
    dx: input.dx,
    dy: input.dy,
    fire: input.fire,
    returning: Object.prototype.hasOwnProperty.call(input, 'returning')
      ? input.returning
      : false
  }
}

function intersectsWall(point, radius, wall) {
  const x = clamp(point.x, wall.x, wall.x + wall.width)
  const y = clamp(point.y, wall.y, wall.y + wall.height)
  return Math.hypot(point.x - x, point.y - y) < radius - 0.00001
}

export function createDiveGame(levelId, { seed = 1 } = {}) {
  const level = DIVE_LEVELS.find((item) => item.id === levelId)
  requireThat(level, 'INVALID_ARGUMENT', '请选择1～3关')
  requireThat(
    Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff,
    'INVALID_ARGUMENT',
    '潜水种子无效'
  )
  const config = configurations[levelId]
  const state = {
    levelId,
    rulesVersion: DIVE_RULES_VERSION,
    tick: 0,
    status: 'playing',
    reason: '',
    player: {
      x: 9,
      y: 54,
      radius: playerRadius,
      facing: 1,
      hearts: 3,
      invulnerableTicks: 0
    },
    oxygenTicks: (level.oxygenSeconds * 1000) / DIVE_STEP_MS,
    oxygenDamageTicks: 0,
    returningTicks: 0,
    pearlsCollected: 0,
    requiredPearls: level.requiredPearls,
    exit: { x: config.exit[0], y: config.exit[1], radius: 4 },
    obstacles: config.walls.map(([x, y, width, height], i) => ({
      id: `coral-${i}`,
      x,
      y,
      width,
      height
    })),
    pearls: config.pearls.map(([x, y], i) => ({
      id: `pearl-${i}`,
      x,
      y,
      radius: 1.5,
      collected: false
    })),
    enemies: config.enemies.map(([type, x, y], i) => ({
      id: `friend-${i}`,
      type,
      x,
      y,
      radius: type === 'fish' ? 2.5 : 2.8,
      stunnedTicks: 0
    })),
    bubbles: []
  }
  let input = { dx: 0, dy: 0, fire: false }
  let aim = { x: 1, y: 0 }
  let cooldown = 0
  let bubbleSequence = 0
  const patrols = config.enemies.map(([, x, y, endX, endY], i) => ({
    x,
    y,
    endX,
    endY,
    phase: ((seed + i * 17) % 100) / 100,
    direction: 1
  }))
  function movePlayer(dx, dy) {
    const player = state.player
    const nextX = clamp(player.x + dx, playerRadius, DIVE_WIDTH - playerRadius)
    if (
      !state.obstacles.some((wall) =>
        intersectsWall({ x: nextX, y: player.y }, playerRadius, wall)
      )
    )
      player.x = nextX
    const nextY = clamp(player.y + dy, playerRadius, DIVE_HEIGHT - playerRadius)
    if (
      !state.obstacles.some((wall) =>
        intersectsWall({ x: player.x, y: nextY }, playerRadius, wall)
      )
    )
      player.y = nextY
  }
  function tick() {
    if (state.status !== 'playing') return
    const player = state.player
    let damaged = false
    const magnitude = Math.hypot(input.dx, input.dy)
    if (magnitude) {
      aim = { x: input.dx / magnitude, y: input.dy / magnitude }
      if (input.dx) player.facing = input.dx
      movePlayer(aim.x * speed, aim.y * speed)
    }
    if (player.invulnerableTicks > 0) player.invulnerableTicks--
    if (cooldown > 0) cooldown--
    if (input.fire && cooldown === 0) {
      cooldown = 8
      state.bubbles.push({
        id: `bubble-${++bubbleSequence}`,
        x: player.x + aim.x * 3,
        y: player.y + aim.y * 3,
        radius: 1.25,
        vx: aim.x * 1.5,
        vy: aim.y * 1.5,
        life: 45
      })
    }
    state.enemies.forEach((enemy, index) => {
      if (enemy.stunnedTicks > 0) {
        enemy.stunnedTicks--
        return
      }
      const patrol = patrols[index]
      const length = Math.hypot(patrol.endX - patrol.x, patrol.endY - patrol.y)
      if (!length) return
      patrol.phase += (patrol.direction * (0.15 + levelId * 0.025)) / length
      if (patrol.phase > 1) {
        patrol.phase = 1
        patrol.direction = -1
      }
      if (patrol.phase < 0) {
        patrol.phase = 0
        patrol.direction = 1
      }
      const target = {
        x: patrol.x + (patrol.endX - patrol.x) * patrol.phase,
        y: patrol.y + (patrol.endY - patrol.y) * patrol.phase
      }
      // Return gently from a bubble nudge instead of jumping back onto the route.
      enemy.x += clamp(target.x - enemy.x, -0.3, 0.3)
      enemy.y += clamp(target.y - enemy.y, -0.3, 0.3)
    })
    state.bubbles = state.bubbles.filter((bubble) => {
      bubble.x += bubble.vx
      bubble.y += bubble.vy
      bubble.life--
      if (
        bubble.life <= 0 ||
        bubble.x < 0 ||
        bubble.x > DIVE_WIDTH ||
        bubble.y < 0 ||
        bubble.y > DIVE_HEIGHT ||
        state.obstacles.some((wall) =>
          intersectsWall(bubble, bubble.radius, wall)
        )
      )
        return false
      const enemy = state.enemies.find(
        (item) => distance(item, bubble) < item.radius + bubble.radius
      )
      if (!enemy) return true
      enemy.stunnedTicks = 60
      enemy.x = clamp(
        enemy.x + bubble.vx * 3,
        enemy.radius,
        DIVE_WIDTH - enemy.radius
      )
      enemy.y = clamp(
        enemy.y + bubble.vy * 3,
        enemy.radius,
        DIVE_HEIGHT - enemy.radius
      )
      return false
    })
    if (player.invulnerableTicks === 0) {
      const enemy = state.enemies.find(
        (item) =>
          !item.stunnedTicks &&
          distance(item, player) < item.radius + playerRadius
      )
      if (enemy) {
        player.hearts--
        damaged = true
        player.invulnerableTicks = 30
        const dx = player.x - enemy.x
        const dy = player.y - enemy.y
        const length = Math.hypot(dx, dy) || 1
        movePlayer((dx / length) * 2, (dy / length) * 2)
      }
    }
    state.pearls.forEach((pearl) => {
      if (
        !pearl.collected &&
        distance(pearl, player) <= pearl.radius + playerRadius
      ) {
        pearl.collected = true
        state.pearlsCollected++
      }
    })
    state.tick++
    let oxygenDamageDue = false
    if (state.oxygenTicks > 0) {
      state.oxygenTicks--
      if (state.oxygenTicks === 0) oxygenDamageDue = true
    } else {
      state.oxygenDamageTicks--
      if (state.oxygenDamageTicks <= 0) oxygenDamageDue = true
    }
    if (oxygenDamageDue) {
      state.oxygenDamageTicks = DIVE_OXYGEN_DAMAGE_TICKS
      // A collision on the same simulation step already paid this heart.
      if (!damaged) {
        player.hearts--
        player.invulnerableTicks = 30
        damaged = true
      }
    }
    if (input.returning && magnitude === 0 && !damaged)
      state.returningTicks++
    else state.returningTicks = 0
    if (player.hearts <= 0) {
      state.status = 'failed'
      state.reason = '爱心用完了，本次未带回的收获留在水里；已有珍珠和装扮保留。'
    } else if (
      state.pearlsCollected === state.requiredPearls &&
      distance(player, state.exit) <= playerRadius + state.exit.radius
    )
      state.status = 'cleared'
    else if (state.returningTicks >= DIVE_RETURN_TICKS) {
      state.status = 'returned'
      state.reason = '已带着本局收获返回岸边，新一局会恢复爱心和氧气。'
    } else if (state.tick >= DIVE_MAX_TICKS) {
      state.status = 'failed'
      state.reason = '本次探索时间结束，未带回的收获留在水里；已有珍珠和装扮保留。'
    }
  }
  return {
    getState: () => clone(state),
    setInput(value) {
      input = validInput(value)
    },
    step(count = 1) {
      requireThat(
        Number.isInteger(count) && count >= 0 && count <= DIVE_MAX_TICKS,
        'INVALID_ARGUMENT',
        '潜水步数无效'
      )
      for (let i = 0; i < count && state.status === 'playing'; i++) tick()
      return clone(state)
    }
  }
}

export function replayDive(levelId, { seed, ticks, trace }) {
  requireThat(
    Number.isInteger(ticks) &&
      ticks >= 1 &&
      ticks <= DIVE_MAX_TICKS &&
      Array.isArray(trace) &&
      trace.length <= DIVE_MAX_TRACE,
    'INVALID_ARGUMENT',
    '潜水运行记录过长或步数无效'
  )
  let lastTick = -1
  const events = Array.from(trace, (event) => {
    requireThat(
      event &&
        typeof event === 'object' &&
        !Array.isArray(event) &&
        Reflect.ownKeys(event).every((key) =>
          ['tick', 'dx', 'dy', 'fire', 'returning'].includes(key)
        ) &&
        ['tick', 'dx', 'dy', 'fire'].every((key) =>
          Object.prototype.hasOwnProperty.call(event, key)
        ) &&
        Number.isInteger(event.tick) &&
        event.tick >= 0 &&
        event.tick < ticks &&
        event.tick > lastTick,
      'INVALID_ARGUMENT',
      '潜水输入时间无效'
    )
    lastTick = event.tick
    return {
      tick: event.tick,
      ...validInput({
        dx: event.dx,
        dy: event.dy,
        fire: event.fire,
        ...(Object.prototype.hasOwnProperty.call(event, 'returning')
          ? { returning: event.returning }
          : {})
      })
    }
  })
  const game = createDiveGame(levelId, { seed })
  let eventIndex = 0
  for (let tick = 0; tick < ticks; tick++) {
    if (events[eventIndex]?.tick === tick) {
      const { dx, dy, fire, returning } = events[eventIndex++]
      game.setInput({ dx, dy, fire, returning })
    }
    game.step()
  }
  const state = game.getState()
  requireThat(
    state.tick === ticks,
    'INVALID_ARGUMENT',
    '潜水记录包含结算后的多余步数'
  )
  return state
}
