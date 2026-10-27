import { requireThat } from '../../utils/errors.js'
import {
  DIVE_LEVELS, DIVE_STEP_MS, DIVE_MAX_TICKS, DIVE_RULES_VERSION, replayDive
} from '../../utils/dive-game.js'
import { getWardrobeState, grantDiveReward, grantDiveReturnReward } from './wardrobe.js'

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
  { now = Date.now(), random = Math.random, createId } = {}
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
    if (run && (now > run.expiresAt || run.rulesVersion !== DIVE_RULES_VERSION))
      delete db.diveRuns[userId]
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
      id: createId ? createId('dive') : `dive_${db.diveSequence}_${now}`,
      levelId: params.levelId,
      rulesVersion: DIVE_RULES_VERSION,
      seed: Math.floor(random() * 0x100000000) >>> 0,
      startedAt: now,
      expiresAt: now + DIVE_MAX_TICKS * DIVE_STEP_MS + 300000
    }
    db.diveRuns[userId] = run
    return clone(run)
  }
  const run = db.diveRuns[userId]
  requireThat(
    typeof params.runId === 'string' &&
      run &&
      run.id === params.runId &&
      run.rulesVersion === DIVE_RULES_VERSION &&
      now <= run.expiresAt,
    'CONFLICT',
    '这次潜水已结束、过期或规则已更新，请重新出发'
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
  if (replay.status === 'cleared' || replay.status === 'returned') {
    const grant = replay.status === 'cleared' ? grantDiveReward : grantDiveReturnReward
    const result = grant(db, userId, run.levelId, replay.pearlsCollected)
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
    rulesVersion: DIVE_RULES_VERSION,
    status: replay.status,
    collectedPearls: replay.pearlsCollected,
    reward: clone(reward)
  }
  delete db.diveRuns[userId]
  return {
    status: replay.status, rulesVersion: DIVE_RULES_VERSION,
    collectedPearls: replay.pearlsCollected, reward, wardrobe, state: currentState()
  }
}
