import { decideContribution, getContributionSummary } from '../domain/rewards/contribution.js'
import { getWardrobeState, grantContributionPearls } from '../domain/leisure/wardrobe.js'
import { requireThat } from '../utils/errors.js'

// Only the demonstration adapter stores this ledger. Real errors never use it.
export function awardDemoContribution(db, event, now) {
  db.contributionRewards ||= []
  const history = db.contributionRewards.filter(record => record.userId === event.userId)
  const decision = decideContribution(event, history, now)
  if (!history.some(record => record.eventId === decision.eventId)) {
    if (decision.delta > 0) grantContributionPearls(db, event.userId, decision.delta)
    db.contributionRewards.push(decision)
  }
  return { eventId: decision.eventId, delta: decision.delta, reason: decision.reason }
}

export function getDemoContributionState(db, userId, params, now) {
  requireThat(!Object.keys(params).length, 'INVALID_ARGUMENT', '只能读取本人的贡献奖励')
  const history = (db.contributionRewards || []).filter(record => record.userId === userId)
  return { pearls: getWardrobeState(db, userId).pearls, ...getContributionSummary(history, now) }
}
