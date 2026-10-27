import { ServiceError, requireThat } from '../../utils/errors.js'
import { linePosition } from '../../utils/fishing-timing.js'
import { dispatchWardrobe, getWardrobeState } from './wardrobe.js'

const fishTypes = [
  { id: 'lotus-carp', name: '荷塘小鲤' },
  { id: 'silver-minnow', name: '银光小鱼' },
  { id: 'sunny-medaka', name: '日光青鳉' }
]
const decorations = [
  { id: 'lily-pad', name: '小荷叶' },
  { id: 'reed-bow', name: '芦苇结' },
  { id: 'bubble-star', name: '水泡星' }
]

const clone = (value) => JSON.parse(JSON.stringify(value))
const emptyState = () => ({
  catchCount: 0,
  fishBook: [],
  collection: [],
  equipped: null,
  activeCast: null
})
const fields = {
  getState: [],
  cast: [],
  hook: ['castId'],
  land: ['castId'],
  equip: ['decorationId']
}
function addOne(items, item) {
  const existing = items.find((entry) => entry.id === item.id)
  if (existing) existing.count++
  else items.push({ ...item, count: 1 })
}
function snapshot(db, userId, state) {
  const wardrobe = getWardrobeState(db, userId)
  const worn = decorations.filter((item) =>
    Object.values(wardrobe.equipped).includes(item.id)
  )
  state.equipped =
    worn.find((item) => item.id === state.equipped)?.id || worn[0]?.id || null
  const collection = decorations.flatMap((item) => {
    const owned = wardrobe.owned.find((entry) => entry.id === item.id)
    return owned ? [{ ...item, count: owned.count }] : []
  })
  return clone({
    catchCount: state.catchCount,
    fishBook: state.fishBook,
    collection,
    equipped: state.equipped,
    activeCast: state.activeCast
  })
}

export function dispatchFishing(
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
  if (!Object.prototype.hasOwnProperty.call(fields, action))
    throw new ServiceError('NOT_IMPLEMENTED', '钓鱼操作尚未实现')
  requireThat(
    params &&
      typeof params === 'object' &&
      !Array.isArray(params) &&
      Reflect.ownKeys(params).length === fields[action].length &&
      Reflect.ownKeys(params).every((key) => fields[action].includes(key)),
    'INVALID_ARGUMENT',
    '请只提供本次钓鱼操作所需参数，不能指定身份或奖励'
  )
  db.fishingStates ||= {}
  const state = (db.fishingStates[userId] ||= emptyState())
  if (action === 'getState') {
    const deadline =
      state.activeCast?.status === 'hooked'
        ? state.activeCast.landDeadlineAt
        : state.activeCast?.escapeAt
    if (deadline != null && now > deadline) state.activeCast = null
    return snapshot(db, userId, state)
  }
  if (action === 'cast') {
    db.fishingSequence = (db.fishingSequence || 0) + 1
    const biteAt = now + 1400 + Math.floor(random() * 1100)
    state.activeCast = {
      id: createId ? createId('cast') : `cast_${db.fishingSequence}_${now}`,
      status: 'waiting',
      biteAt,
      escapeAt: biteAt + 2400
    }
    return clone(state.activeCast)
  }
  if (action === 'hook') {
    requireThat(
      typeof params.castId === 'string' && params.castId.length > 0,
      'INVALID_ARGUMENT',
      '缺少本次抛竿编号'
    )
    const cast = state.activeCast
    requireThat(
      cast && cast.id === params.castId && cast.status === 'waiting',
      'CONFLICT',
      '这次抛竿已失效，请重新抛竿'
    )
    if (now < cast.biteAt || now > cast.escapeAt) {
      state.activeCast = null
      return {
        status: 'escaped',
        reason:
          now < cast.biteAt
            ? '提竿太早，鱼儿游走了'
            : '错过了咬钩时机，鱼儿游走了',
        state: snapshot(db, userId, state)
      }
    }
    Object.assign(cast, {
      status: 'hooked',
      meterStartAt: now + 150,
      meterPeriodMs: 1600,
      meterZone: [0.28, 0.78],
      landDeadlineAt: now + 10000
    })
    return { status: 'hooked', cast: clone(cast) }
  }
  if (action === 'land') {
    requireThat(
      typeof params.castId === 'string' && params.castId.length > 0,
      'INVALID_ARGUMENT',
      '缺少本次抛竿编号'
    )
    const cast = state.activeCast
    requireThat(
      cast && cast.id === params.castId && cast.status === 'hooked',
      'CONFLICT',
      '这次收线已失效，请重新抛竿'
    )
    const position = linePosition(cast, now)
    state.activeCast = null
    if (
      now < cast.meterStartAt ||
      now > cast.landDeadlineAt ||
      position < cast.meterZone[0] ||
      position > cast.meterZone[1]
    ) {
      return {
        status: 'escaped',
        reason:
          now > cast.landDeadlineAt
            ? '等待太久，鱼儿游走了'
            : '收线没有落在绿色区域，鱼儿游走了',
        state: snapshot(db, userId, state)
      }
    }
    const fish = fishTypes[Math.floor(random() * fishTypes.length)]
    const reward =
      state.catchCount === 0
        ? decorations[0]
        : random() < 0.35
          ? decorations[Math.floor(random() * decorations.length)]
          : null
    state.catchCount++
    addOne(state.fishBook, fish)
    if (reward) addOne(state.collection, reward)
    return {
      status: 'caught',
      fish: clone(fish),
      reward: reward ? clone(reward) : null,
      state: snapshot(db, userId, state)
    }
  }
  if (action === 'equip') {
    const decorationId = params.decorationId
    requireThat(
      decorationId === null ||
        decorations.some((item) => item.id === decorationId),
      'INVALID_ARGUMENT',
      '请选择有效的装饰，或摘下当前装饰'
    )
    const wardrobe = getWardrobeState(db, userId)
    if (decorationId === null) {
      for (const [slot, itemId] of Object.entries(wardrobe.equipped)) {
        if (decorations.some((item) => item.id === itemId))
          dispatchWardrobe(db, userId, 'equip', { slot, itemId: null })
      }
    } else {
      const item = wardrobe.catalog.find((entry) => entry.id === decorationId)
      dispatchWardrobe(db, userId, 'equip', {
        slot: item.slot,
        itemId: decorationId
      })
    }
    state.equipped = decorationId
    return snapshot(db, userId, state)
  }
  throw new ServiceError('NOT_IMPLEMENTED', '钓鱼操作尚未实现')
}
