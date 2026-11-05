import { requireThat } from '../../utils/errors.js'

export const CONTRIBUTION_RULES = Object.freeze({
  publish: Object.freeze({ pearls: 5, limit: 3, duplicateDays: 7 }),
  helpCompletion: Object.freeze({ authorPearls: 5, helperPearls: 15, limit: 2, pairLimit: 1 })
})

const clone = value => JSON.parse(JSON.stringify(value))
const DAY_MS = 86400000
const completionKinds = ['help_author', 'help_helper']
const kinds = ['publish', ...completionKinds]
const sourceTypes = ['market', 'help', 'plan', 'lost_found']
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 200

export function contributionDayKey(now) {
  requireThat(Number.isFinite(now) && Math.abs(now) < 8640000000000000 - DAY_MS,
    'INVALID_ARGUMENT', '奖励时间无效')
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10)
}

export function contributionPairKey(a, b) {
  requireThat(identifier(a) && identifier(b) && a !== b, 'INVALID_ARGUMENT', '互助需要两个不同账号')
  return JSON.stringify([a, b].sort())
}

const normalizedText = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase()

// The caller supplies trusted business facts and this beneficiary's history.
// This function never writes a wallet, performs I/O, or accepts a reward amount.
export function decideContribution(event, history = [], now) {
  const sourceType = event?.sourceType === 'lostFound' ? 'lost_found' : event?.sourceType
  requireThat(event && identifier(event.userId) && identifier(event.sourceId) &&
    kinds.includes(event.kind) && sourceTypes.includes(sourceType), 'INVALID_ARGUMENT', '贡献事件无效')
  const dayKey = contributionDayKey(now)
  const eventId = `contribution:${JSON.stringify([event.userId, event.kind, sourceType, event.sourceId])}`
  const ownHistory = history.filter(record => record.userId === event.userId)
  const previous = ownHistory.find(record => record.eventId === eventId)
  if (previous) return clone(previous)
  const record = {
    id: eventId, eventId, userId: event.userId, kind: event.kind, sourceType,
    sourceId: event.sourceId, dayKey, createdAt: new Date(now).toISOString(), delta: 0, reason: 'awarded'
  }
  const today = ownHistory.filter(entry => entry.dayKey === dayKey && entry.delta > 0)
  if (event.kind === 'publish') {
    requireThat(typeof (event.title ?? '') === 'string' && typeof (event.body ?? '') === 'string',
      'INVALID_ARGUMENT', '贡献正文无效')
    record.textKey = JSON.stringify([normalizedText(event.title ?? ''), normalizedText(event.body ?? '')])
    if ((event.visibility ?? 'public') !== 'public') record.reason = 'not_public'
    else if (ownHistory.some(entry => entry.kind === 'publish' && entry.reason !== 'not_public' &&
      entry.textKey === record.textKey && Date.parse(entry.createdAt) > now - CONTRIBUTION_RULES.publish.duplicateDays * DAY_MS &&
      Date.parse(entry.createdAt) <= now)) record.reason = 'duplicate_text'
    else if (today.filter(entry => entry.kind === 'publish').length >= CONTRIBUTION_RULES.publish.limit)
      record.reason = 'daily_limit'
    else record.delta = CONTRIBUTION_RULES.publish.pearls
  } else {
    let pair
    try { pair = JSON.parse(event.pairKey) } catch { /* Invalid trusted input is rejected below. */ }
    requireThat(sourceType === 'help' && Array.isArray(pair) && pair.length === 2 &&
      pair.includes(event.userId) && event.pairKey === contributionPairKey(pair[0], pair[1]),
    'INVALID_ARGUMENT', '互助奖励需要有效的双方记录')
    record.pairKey = event.pairKey
    if (today.some(entry => completionKinds.includes(entry.kind) && entry.pairKey === event.pairKey))
      record.reason = 'pair_limit'
    else if (today.filter(entry => completionKinds.includes(entry.kind)).length >= CONTRIBUTION_RULES.helpCompletion.limit)
      record.reason = 'daily_limit'
    else record.delta = event.kind === 'help_helper' ? CONTRIBUTION_RULES.helpCompletion.helperPearls : CONTRIBUTION_RULES.helpCompletion.authorPearls
  }
  return record
}

export function getContributionSummary(history = [], now) {
  const dayKey = contributionDayKey(now)
  const today = history.filter(entry => entry.dayKey === dayKey && entry.delta > 0)
  return {
    dayKey,
    daily: {
      publish: { awarded: today.filter(entry => entry.kind === 'publish').length, limit: CONTRIBUTION_RULES.publish.limit },
      helpCompletion: { awarded: today.filter(entry => completionKinds.includes(entry.kind)).length, limit: CONTRIBUTION_RULES.helpCompletion.limit }
    },
    rules: clone(CONTRIBUTION_RULES),
    recent: clone([...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.eventId.localeCompare(a.eventId)).slice(0, 20)
      .map(entry => Object.fromEntries(Object.entries(entry).filter(([key]) => !['textKey', 'pairKey'].includes(key)))))
  }
}
