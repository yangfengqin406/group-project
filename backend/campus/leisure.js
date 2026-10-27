import { randomInt, randomUUID } from 'node:crypto'
import { dispatchWardrobe } from '../../src/domain/leisure/wardrobe.js'
import { dispatchFishing } from '../../src/domain/leisure/fishing.js'
import { dispatchDive } from '../../src/domain/leisure/dive.js'
import { CServiceError } from '../c/service.js'

const handlers = { wardrobe: dispatchWardrobe, fishing: dispatchFishing, dive: dispatchDive }

export function createLeisureService({ store, accounts, now = Date.now,
  random = () => randomInt(0x100000000) / 0x100000000 }) {
  return {
    invoke(method, params, principal) {
      const me = accounts.getUser(principal.userId)
      if (!me || me.disabled) throw new CServiceError('UNAUTHENTICATED', '请先登录本地账号')
      const [module, action] = method.split('.')
      const handler = handlers[module]
      if (!handler) throw new CServiceError('NOT_IMPLEMENTED', '未找到玩法')
      return store.transaction(() => {
        const previous = store.get('campus.leisure', me.id)
        const state = previous?.state || {}
        // Identity is always server-owned. Never seed or import a demo database.
        state.users = [{ id: me.id }]
        const result = handler(state, me.id, action, params, {
          now: now(), random, createId: prefix => `${prefix}_${randomUUID()}`
        })
        const record = { id: me.id, version: 1, state }
        previous ? store.update('campus.leisure', record) : store.insert('campus.leisure', record)
        return result
      })
    }
  }
}
