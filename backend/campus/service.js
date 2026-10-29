import { C_METHODS, CServiceError, createCService } from '../c/service.js'
import { createAccounts } from './accounts.js'
import { createMarketService } from './market.js'
import { createPlanService } from './plans.js'
import { createLeisureService } from './leisure.js'
import { createPrivacyService, PRIVACY_METHODS } from './privacy.js'
import { createRewardsService } from './rewards.js'
import { defaultPet, validateAppearance } from '../../src/utils/pet-appearance.js'
import { getHelpProgress, normalizeHelpBrief } from '../../src/domain/help/brief.js'

const collections = { market: 'campus.market', plan: 'campus.plan', help: 'campus.help', lost_found: 'lost' }
const requireThat = (ok, code, message) => { if (!ok) throw new CServiceError(code, message) }

export function createCampusService({ store, uploadsDir, uploadOrigin, trustedUploadOrigins = [], leisureOptions = {}, now = () => Date.now() }) {
  const accounts = createAccounts({ store, uploadsDir, uploadOrigin })
  const content = {
    get(type, id) { return collections[type] ? store.get(collections[type], id) : null },
    list(type) {
      return (type ? [collections[type]].filter(Boolean) : Object.values(collections))
        .flatMap((collection) => store.query(collection, '1', [], 'seq DESC', 100000).map((row) => row.value))
    },
    summarize(item) {
      if (!item) return null
      return {
        ...item,
        ...(item.type === 'help' ? { ...normalizeHelpBrief({}, item),
          helpProgress: getHelpProgress(item, item.selectedApplicationId ? store.get('campus.helpApplications', item.selectedApplicationId) : null) } : {}),
        images: item.imageIds ? item.imageIds.map((id) => accounts.getUpload(id)?.url).filter(Boolean) : item.images || [],
        owner: accounts.publicUser(item.ownerId)
      }
    }
  }
  const privacy = createPrivacyService({ store, accounts, uploadsDir })
  const rewards = createRewardsService({ store, accounts, now })
  const c = createCService({
    store, getUser: accounts.getUser, getExternalContent: content.get,
    getUploadByUrl: accounts.getUploadByUrl, trustedUploadOrigins,
    assertCanContact: privacy.assertCanContact,
    canContactHelpApplicant: ({ help, ownerId, helperId }) => help.ownerId === ownerId &&
      store.query('campus.helpApplications', "json_extract(data, '$.helpId') = ? AND json_extract(data, '$.ownerId') = ? AND json_extract(data, '$.helperId') = ? AND json_extract(data, '$.status') IN ('pending', 'accepted', 'completed')", [help.id, ownerId, helperId], 'seq DESC', 1).length > 0,
    awardContribution: rewards.awardInTransaction,
    now: () => new Date(now()).toISOString()
  })
  const options = { store, accounts, content, notify: c.notifyInTransaction,
    assertCanContact: privacy.assertCanContact, awardContribution: rewards.awardInTransaction, now }
  const market = createMarketService(options)
  const plans = createPlanService(options)
  const leisure = createLeisureService({ ...leisureOptions, store, accounts })
  function invoke(method, params = {}, principal = {}) {
    requireThat(typeof method === 'string' && method.length < 100, 'INVALID_ARGUMENT', '接口名称无效')
    requireThat(params && typeof params === 'object' && !Array.isArray(params), 'INVALID_ARGUMENT', '参数须为对象')
    if (PRIVACY_METHODS.has(method)) return privacy.invoke(method, params, principal)
    if (method.startsWith('auth.')) return accounts.invoke(method, params, principal)
    const me = accounts.getUser(principal.userId)
    requireThat(me && !me.disabled, 'UNAUTHENTICATED', '请先登录本地账号')
    if (method === 'rewards.getState') return rewards.invoke(method, params, principal)
    if (method === 'upload.confirm') {
      let uploadTargetVerified = false
      if (params.contentId || params.contentType) {
        const item = content.get(params.contentType, params.contentId)
        const image = accounts.getUpload(params.imageId)
        requireThat(item?.ownerId === me.id && image &&
          (item.imageIds?.includes(image.imageId) || item.images?.includes(image.url)), 'FORBIDDEN', '不能关联他人的内容或无关图片')
        uploadTargetVerified = true
      }
      return accounts.invoke(method, params, { ...principal, uploadTargetVerified })
    }
    if (C_METHODS.has(method)) return c.invoke(method, params, principal)
    if (/^(market|reservation|appraisal|user|favorite|myContent)\./.test(method)) {
      plans.reconcile()
      return market.invoke(method, params, principal)
    }
    if (/^(plan|invitation|help)\./.test(method)) return plans.invoke(method, params, principal)
    if (/^(wardrobe|fishing|dive)\./.test(method)) return leisure.invoke(method, params, principal)
    if (method === 'pet.get') {
      requireThat(!Object.keys(params).length, 'INVALID_ARGUMENT', '只能读取当前账号的宠物')
      return store.get('campus.pets', me.id)?.appearance || defaultPet()
    }
    if (method === 'pet.save') {
      const appearance = validateAppearance(params)
      return store.transaction(() => {
        const record = { id: me.id, appearance }
        store.get('campus.pets', me.id) ? store.update('campus.pets', record) : store.insert('campus.pets', record)
        return appearance
      })
    }
    // No invented activities or simulated reward successes in the real service.
    if (method === 'bulletin.list' || method === 'event.list') return { items: [], nextCursor: null }
    throw new CServiceError('NOT_IMPLEMENTED', '此功能尚未接入真实校园服务；可在演示版体验')
  }
  function canReadUpload(image, principal) {
    if (!image) return false
    if (principal?.userId === image.ownerId) return true
    if (image.status !== 'confirmed') return false
    if (image.usage === 'avatar' && accounts.getUser(image.ownerId)?.avatarImageId === image.imageId) return true
    return content.list().some((item) => !item.deletedAt && item.visibility === 'public' &&
      item.ownerId === image.ownerId && (item.imageIds?.includes(image.imageId) || item.images?.includes(image.url)))
  }
  return { invoke, accounts, content, canReadUpload }
}
