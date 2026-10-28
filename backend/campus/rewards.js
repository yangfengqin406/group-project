import { CServiceError } from '../c/service.js'
import { decideContribution, getContributionSummary } from '../../src/domain/rewards/contribution.js'
import { getWardrobeState, grantContributionPearls } from '../../src/domain/leisure/wardrobe.js'

const EVENTS = 'campus.rewardEvents'
const check = (ok, code, message) => { if (!ok) throw new CServiceError(code, message) }
const receipt = event => ({ eventId: event.eventId, delta: event.delta, reason: event.reason })

export function createRewardsService({ store, accounts, now = Date.now }) {
  const history = userId => store.query(EVENTS, "json_extract(data, '$.userId') = ?", [userId], 'seq ASC', -1)
    .map(row => row.value)
  const currentUser = userId => {
    check(typeof userId === 'string' && userId.length > 0, 'UNAUTHENTICATED', '请先登录本地账号')
    const me = accounts.getUser(userId)
    check(me && !me.disabled, 'UNAUTHENTICATED', '请先登录本地账号')
    return me
  }
  return {
    // Trusted server hook only. The caller owns the existing SQLite transaction.
    awardInTransaction(event) {
      const me = currentUser(event?.userId)
      const decision = decideContribution(event, history(me.id), event.now ?? now())
      if (store.get(EVENTS, decision.id)) return receipt(decision)
      store.insert(EVENTS, decision)
      if (decision.delta > 0) {
        const previous = store.get('campus.leisure', me.id)
        const state = previous?.state || {}
        state.users = [{ id: me.id }]
        grantContributionPearls(state, me.id, decision.delta)
        const record = { id: me.id, version: 1, state }
        previous ? store.update('campus.leisure', record) : store.insert('campus.leisure', record)
      }
      return receipt(decision)
    },
    invoke(method, params = {}, principal = {}) {
      check(method === 'rewards.getState', 'NOT_IMPLEMENTED', '贡献奖励仅支持读取本人记录')
      check(params && typeof params === 'object' && !Array.isArray(params) && !Reflect.ownKeys(params).length,
        'INVALID_ARGUMENT', '只能读取当前账号的贡献记录')
      return store.transaction(() => {
        const me = currentUser(principal.userId)
        const state = store.get('campus.leisure', me.id)?.state || { users: [{ id: me.id }] }
        return { pearls: getWardrobeState(state, me.id).pearls, ...getContributionSummary(history(me.id), now()) }
      })
    }
  }
}
