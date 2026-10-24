import { requireThat } from '../utils/errors.js'
import { DIVE_LEVELS, DIVE_STEP_MS, replayDive } from '../utils/dive-game.js'
import { getWardrobeState, grantDiveReward } from './wardrobe.js'

const clone = (value) => JSON.parse(JSON.stringify(value))
const fields = {
  getState: [],
  start: ['levelId'],
  finish: ['runId', 'ticks', 'trace']
}

export function dispatchDive(
  db,
  userId,
  action,
  params = {},
  { now = Date.now(), random = Math.random } = {}
) {
  requireThat(
    db.users.some((user) => user.id === userId),
    'UNAUTHENTICATED',
    '请先登录'
  )
  requireThat(
    Object.prototype.hasOwnProperty.call(fields, action),
    'NOT_IMPLEMENTED',
    '潜水操作尚未实现'
  )
  requireThat(
    params &&
      typeof params === 'object' &&
      !Array.isArray(params) &&
      Reflect.ownKeys(params).length === fields[action].length &&
      Reflect.ownKeys(params).every((key) => fields[action].includes(key)),
    'INVALID_ARGUMENT',
    '请只提供潜水操作所需参数，不能指定身份或奖励'
  )
  db.diveRuns ||= {}
  db.diveSettlements ||= {}
  function currentState() {
    const wardrobe = getWardrobeState(db, userId)
    const clearedLevels = [...wardrobe.clearedLevels]
    let unlockedLevel = 1
    while (unlockedLevel < 3 && clearedLevels.includes(unlockedLevel))
      unlockedLevel++
    const run = db.diveRuns[userId]
    if (run && now > run.expiresAt) delete db.diveRuns[userId]
    return {
      clearedLevels,
      unlockedLevel,
      pearls: wardrobe.pearls,
      activeRun: clone(db.diveRuns[userId] || null),
      lastSettlement: clone(db.diveSettlements[userId] || null)
    }
  }
  if (action === 'getState') return currentState()
  if (action === 'start') {
    const level = DIVE_LEVELS.find((item) => item.id === params.levelId)
    requireThat(level, 'INVALID_ARGUMENT', '请选择1～3关')
    requireThat(
      params.levelId <= currentState().unlockedLevel,
      'FORBIDDEN',
      '先通过前一关，再来探索这里吧'
    )
    db.diveSequence = (db.diveSequence || 0) + 1
    const run = {
      id: `dive_${db.diveSequence}_${now}`,
      levelId: params.levelId,
      seed: Math.floor(random() * 0x100000000) >>> 0,
      startedAt: now,
      expiresAt: now + level.oxygenSeconds * 1000 + 300000
    }
    db.diveRuns[userId] = run
    return clone(run)
  }
  const run = db.diveRuns[userId]
  requireThat(
    typeof params.runId === 'string' &&
      run &&
      run.id === params.runId &&
      now <= run.expiresAt,
    'CONFLICT',
    '这次潜水已结束或过期，请重新出发'
  )
  const replay = replayDive(run.levelId, {
    seed: run.seed,
    ticks: params.ticks,
    trace: params.trace
  })
  requireThat(
    now >= run.startedAt &&
      now - run.startedAt >= params.ticks * DIVE_STEP_MS - 500,
    'INVALID_ARGUMENT',
    '潜水记录比实际经过的时间更长，请稍后重试'
  )
  requireThat(
    replay.status !== 'playing',
    'INVALID_ARGUMENT',
    '还没有完成这次潜水，不能领取奖励'
  )
  let reward = null
  let wardrobe
  if (replay.status === 'cleared') {
    const result = grantDiveReward(db, userId, run.levelId)
    reward = {
      firstClear: result.firstClear,
      items: result.items,
      pearls: result.pearls
    }
    wardrobe = result.state
  } else wardrobe = getWardrobeState(db, userId)
  db.diveSettlements[userId] = {
    runId: run.id,
    levelId: run.levelId,
    status: replay.status,
    reward: clone(reward)
  }
  delete db.diveRuns[userId]
  return { status: replay.status, reward, wardrobe, state: currentState() }
}
