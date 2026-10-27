import { ServiceError, requireThat } from '../../utils/errors.js'
import { DIVE_LEVELS } from '../../utils/dive-game.js'
import {
  WARDROBE_ITEMS,
  WARDROBE_SLOTS,
  STARTER_ITEMS
} from '../../utils/wardrobe-catalog.js'

const clone = (value) => JSON.parse(JSON.stringify(value))
const legacyItems = ['lily-pad', 'reed-bow', 'bubble-star']
const actionFields = {
  getState: [],
  equip: ['slot', 'itemId'],
  redeem: ['itemId']
}
const diveRewards = {
  1: { items: ['sailor-shirt', 'shell-shoes'], pearls: 30, replay: 8 },
  2: { items: ['cloud-bun', 'shell-pouch'], pearls: 45, replay: 12 },
  3: {
    items: ['shell-crown', 'star-wand', 'pearl-badge'],
    pearls: 60,
    replay: 18
  }
}
function emptyEquipment() {
  const equipped = {}
  for (const { id } of WARDROBE_SLOTS) equipped[id] = null
  return equipped
}
function addOwned(state, id, count = 1) {
  const existing = state.owned.find((item) => item.id === id)
  if (existing) existing.count += count
  else state.owned.push({ id, count })
}
function migrateFishing(db, userId, state) {
  const legacy = db.fishingStates?.[userId]
  if (!legacy) return
  state.legacyFishingCounts ||= {}
  const totals = {}
  for (const item of legacy.collection || []) {
    if (
      legacyItems.includes(item.id) &&
      Number.isSafeInteger(item.count) &&
      item.count > 0
    )
      totals[item.id] = (totals[item.id] || 0) + item.count
  }
  for (const [id, count] of Object.entries(totals)) {
    const previous = state.legacyFishingCounts[id] || 0
    if (count > previous) addOwned(state, id, count - previous)
    state.legacyFishingCounts[id] = Math.max(count, previous)
  }
  if (!state.legacyEquipmentSeen) {
    const item = WARDROBE_ITEMS.find(
      (entry) => entry.id === legacy.equipped && legacyItems.includes(entry.id)
    )
    if (
      item &&
      !state.equipped[item.slot] &&
      state.owned.some((entry) => entry.id === item.id && entry.count > 0)
    )
      state.equipped[item.slot] = item.id
    state.legacyEquipmentSeen = true
  }
}
function stateFor(db, userId) {
  requireThat(
    db.users.some((user) => user.id === userId),
    'UNAUTHENTICATED',
    '请先登录'
  )
  db.wardrobes ||= {}
  const state = (db.wardrobes[userId] ||= {
    owned: STARTER_ITEMS.map((id) => ({ id, count: 1 })),
    equipped: emptyEquipment(),
    pearls: 0,
    clearedLevels: []
  })
  migrateFishing(db, userId, state)
  return state
}

export function getWardrobeState(db, userId) {
  const state = stateFor(db, userId)
  return clone({
    catalog: WARDROBE_ITEMS,
    owned: state.owned,
    equipped: state.equipped,
    pearls: state.pearls,
    clearedLevels: state.clearedLevels
  })
}

export function dispatchWardrobe(db, userId, action, params = {}) {
  requireThat(
    Object.prototype.hasOwnProperty.call(actionFields, action),
    'NOT_IMPLEMENTED',
    '衣柜操作尚未实现'
  )
  requireThat(
    params &&
      typeof params === 'object' &&
      !Array.isArray(params) &&
      Reflect.ownKeys(params).length === actionFields[action].length &&
      Reflect.ownKeys(params).every((key) =>
        actionFields[action].includes(key)
      ),
    'INVALID_ARGUMENT',
    '请只提供分类与装扮编号，不能指定身份、价格或余额'
  )
  if (action === 'getState') return getWardrobeState(db, userId)
  const state = stateFor(db, userId)
  if (action === 'equip') {
    requireThat(
      WARDROBE_SLOTS.some((slot) => slot.id === params.slot),
      'INVALID_ARGUMENT',
      '请选择有效的衣柜分类'
    )
    const item = WARDROBE_ITEMS.find((entry) => entry.id === params.itemId)
    requireThat(
      params.itemId === null || item?.slot === params.slot,
      'INVALID_ARGUMENT',
      '这件装扮不属于所选分类'
    )
    requireThat(
      params.itemId === null ||
        state.owned.some(
          (entry) => entry.id === params.itemId && entry.count > 0
        ),
      'FORBIDDEN',
      '还没有获得这件装扮'
    )
    state.equipped[params.slot] = params.itemId
    return getWardrobeState(db, userId)
  }
  if (action === 'redeem') {
    const item = WARDROBE_ITEMS.find((entry) => entry.id === params.itemId)
    requireThat(item, 'INVALID_ARGUMENT', '请选择衣柜中已有的装扮')
    if (state.owned.some((entry) => entry.id === item.id && entry.count > 0))
      return getWardrobeState(db, userId)
    requireThat(
      item.unlockLevel === 0 || state.clearedLevels.includes(item.unlockLevel),
      'FORBIDDEN',
      `请先通关第${item.unlockLevel}关，再兑换这件装扮`
    )
    requireThat(
      state.pearls >= item.cost,
      'CONFLICT',
      '珍珠还不够，去潜水闯关收集一些吧'
    )
    state.pearls -= item.cost
    addOwned(state, item.id)
    return getWardrobeState(db, userId)
  }
  throw new ServiceError('NOT_IMPLEMENTED', '衣柜操作尚未实现')
}

function validateDiveCollection(levelId, collectedPearls) {
  const level = DIVE_LEVELS.find((entry) => entry.id === levelId)
  requireThat(
    level && Number.isInteger(levelId),
    'INVALID_ARGUMENT',
    '请选择第一至第三关'
  )
  requireThat(
    Number.isInteger(collectedPearls) &&
      collectedPearls >= 0 && collectedPearls <= level.requiredPearls,
    'INVALID_ARGUMENT',
    '本次收获必须来自关卡中的珍珠'
  )
}

export function grantDiveReturnReward(db, userId, levelId, collectedPearls) {
  validateDiveCollection(levelId, collectedPearls)
  const state = stateFor(db, userId)
  requireThat(
    levelId === 1 || state.clearedLevels.includes(levelId - 1),
    'FORBIDDEN',
    '请先完成上一关'
  )
  state.pearls += collectedPearls
  return {
    firstClear: false, items: [], pearls: collectedPearls,
    state: getWardrobeState(db, userId)
  }
}

export function grantDiveReward(db, userId, levelId, collectedPearls = 0) {
  validateDiveCollection(levelId, collectedPearls)
  const state = stateFor(db, userId)
  requireThat(
    levelId === 1 || state.clearedLevels.includes(levelId - 1),
    'FORBIDDEN',
    '请先完成上一关'
  )
  const firstClear = !state.clearedLevels.includes(levelId)
  const rule = diveRewards[levelId]
  const items = firstClear ? [...rule.items] : []
  const pearls = (firstClear ? rule.pearls : rule.replay) + collectedPearls
  if (firstClear) {
    state.clearedLevels.push(levelId)
    for (const id of items) addOwned(state, id)
  }
  state.pearls += pearls
  return { firstClear, items, pearls, state: getWardrobeState(db, userId) }
}
