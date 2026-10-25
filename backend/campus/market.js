import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export class MarketServiceError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
const requireThat = (ok, code, message) => { if (!ok) throw new MarketServiceError(code, message) }
const text = (value, min, max, label) => {
  requireThat(typeof value === 'string', 'INVALID_ARGUMENT', `${label}格式不正确`)
  const result = value.trim()
  requireThat(result.length >= min && result.length <= max, 'INVALID_ARGUMENT', `${label}需为 ${min}～${max} 个字`)
  return result
}
const canonical = (value) => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v)
const clone = (value) => JSON.parse(JSON.stringify(value))
const MARKET = 'campus.market', RESERVATIONS = 'campus.reservations', FAVORITES = 'campus.favorites'
const TYPES = ['market', 'plan', 'help', 'lost_found']
const RULE = '类别+成色示例估价'
const NOTE = '参考估价，仅供参考，最终价格由发布者决定'
const publicFields = ['id', 'nickname', 'campusId', 'campusName', 'bio', 'skillTags', 'avatarImageId', 'avatarUrl']

export const MARKET_METHODS = new Set([
  'market.create', 'market.update', 'market.get', 'market.list', 'market.close', 'market.complete',
  'market.reserve', 'market.getCandidates', 'market.matchCandidates', 'reservation.respond', 'reservation.complete',
  'appraisal.estimate', 'user.getProfile', 'user.updateProfile', 'user.listPublicContent', 'myContent.list',
  'favorite.list', 'favorite.set'
])

export function createMarketService({ store, accounts, content, notify = () => {} }) {
  // Guard the invariant at the database boundary as well as inside transactions.
  store.database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS campus_active_reservation
    ON c_records(json_extract(data, '$.contentId'))
    WHERE collection = 'campus.reservations' AND json_extract(data, '$.status') IN ('pending', 'accepted')`)
  const rows = (collection) => store.query(collection, '1', [], 'seq DESC', 100000).map((r) => r.value)
  const user = (id) => {
    const raw = accounts.getUser(id)
    requireThat(raw && !raw.disabled, 'NOT_FOUND', '同学资料不存在')
    const safe = accounts.publicUser(id)
    return Object.fromEntries(publicFields.filter((key) => safe[key] !== undefined).map((key) => [key, safe[key]]))
  }
  const get = (type, id) => {
    requireThat(TYPES.includes(type), 'INVALID_ARGUMENT', '不支持的内容类型')
    const item = content.get(type, text(id, 1, 200, '内容编号'))
    requireThat(item && !item.deletedAt, 'NOT_FOUND', '内容已不存在')
    return item
  }
  const visible = (item, userId) => item && !item.deletedAt && (item.visibility === 'public' || item.ownerId === userId)
  const owned = (item, userId) => requireThat(item.ownerId === userId, 'FORBIDDEN', '只有发布者可以操作')
  const summary = (item) => content.summarize(item)
  const signature = (body) => createHmac('sha256', store.cursorSecret).update(body).digest()
  const page = (items, p, scope, map = clone) => {
    const size = p.pageSize ?? 20
    requireThat(Number.isInteger(size) && size >= 1 && size <= 50, 'INVALID_ARGUMENT', '分页数量须为 1～50')
    const binding = canonical(scope)
    let boundary = null
    if (p.cursor !== undefined && p.cursor !== null && p.cursor !== '') {
      requireThat(typeof p.cursor === 'string' && p.cursor.length <= 4096, 'INVALID_ARGUMENT', '分页游标无效')
      try {
        const [body, sig, extra] = p.cursor.split('.')
        const actual = Buffer.from(sig || '', 'base64url'), expected = signature(body)
        requireThat(!extra && actual.length === expected.length && timingSafeEqual(actual, expected), 'INVALID_ARGUMENT', '分页游标无效')
        const cursor = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
        requireThat(cursor.scope === binding && typeof cursor.createdAt === 'string' && typeof cursor.id === 'string', 'INVALID_ARGUMENT', '分页条件已改变，请刷新')
        boundary = cursor
      } catch (error) {
        if (error instanceof MarketServiceError) throw error
        throw new MarketServiceError('INVALID_ARGUMENT', '分页游标无效')
      }
    }
    // A new publication between requests must not shift an offset and repeat a
    // previously delivered row. All four domains share ISO timestamps and IDs.
    const ordered = [...items].sort((a, b) => {
      const x = a.createdAt || '', y = b.createdAt || ''
      return x === y ? a.id === b.id ? 0 : a.id < b.id ? 1 : -1 : x < y ? 1 : -1
    }).filter((item) => !boundary || (item.createdAt || '') < boundary.createdAt ||
      ((item.createdAt || '') === boundary.createdAt && item.id < boundary.id))
    const selected = ordered.slice(0, size)
    let nextCursor = null
    if (ordered.length > size) {
      const last = selected.at(-1)
      const body = Buffer.from(JSON.stringify({ scope: binding, createdAt: last.createdAt || '', id: last.id })).toString('base64url')
      nextCursor = `${body}.${signature(body).toString('base64url')}`
    }
    return { items: selected.map(map), nextCursor }
  }
  const operation = (method, p, userId, run) => {
    if (p.idempotencyKey === undefined) return run()
    const key = text(p.idempotencyKey, 1, 200, '操作编号')
    const fingerprint = canonical(p), receipt = store.receipt(userId, method, key)
    if (receipt) {
      requireThat(receipt.fingerprint === fingerprint, 'CONFLICT', '重复编号不能用于不同操作')
      return JSON.parse(receipt.response)
    }
    const result = run()
    store.saveReceipt(userId, method, key, fingerprint, result)
    return result
  }
  const upload = (imageId, ownerId, usage) => {
    const image = accounts.getUpload(text(imageId, 1, 200, '图片编号'))
    requireThat(image && image.ownerId === ownerId && image.usage === usage && image.status === 'confirmed' &&
      ['image/png', 'image/jpeg', 'image/webp'].includes(image.mime) && Number.isSafeInteger(image.size) && image.size > 0 && image.size <= 5 * 1024 * 1024,
    'FORBIDDEN', '图片未确认、用途不符或不属于当前账号')
    return image
  }
  const marketFields = (p, me, old) => {
    const fields = {
      title: text(p.title, 2, 60, '标题'), body: text(p.body ?? '', 0, 2000, '说明'),
      category: text(p.category ?? '', 0, 40, '类别'), location: text(p.location ?? '', 0, 100, '地点'),
      handoverCampus: text(p.handoverCampus ?? '', 0, 100, '交接地点')
    }
    requireThat(['sell', 'buy'].includes(p.marketType), 'INVALID_ARGUMENT', '请选择闲置或求购')
    fields.marketType = p.marketType
    requireThat(['public', 'private'].includes(p.visibility ?? old?.visibility ?? 'public'), 'INVALID_ARGUMENT', '公开范围不正确')
    fields.visibility = p.visibility ?? old?.visibility ?? 'public'
    if (p.marketType === 'sell') {
      requireThat(Number.isSafeInteger(p.priceCents) && p.priceCents >= 0 && p.priceCents <= 100000000, 'INVALID_ARGUMENT', '价格应为 0～100000000 整数分')
      fields.priceCents = p.priceCents
      fields.condition = text(p.condition, 1, 40, '成色')
    } else {
      requireThat(Number.isSafeInteger(p.budgetCents) && p.budgetCents >= 0 && p.budgetCents <= 100000000, 'INVALID_ARGUMENT', '预算应为 0～100000000 整数分')
      fields.budgetCents = p.budgetCents
      fields.keywords = text(p.keywords, 1, 100, '关键词')
    }
    const ids = p.imageIds ?? old?.imageIds ?? []
    requireThat(Array.isArray(ids) && ids.length <= 3 && new Set(ids).size === ids.length, 'INVALID_ARGUMENT', '图片最多 3 张且不能重复')
    fields.imageIds = ids.map((id) => { upload(id, me.id, 'content'); return id })
    if (p.appraisal !== undefined) {
      const a = p.appraisal
      requireThat(p.marketType === 'sell' && a && Number.isSafeInteger(a.minCents) && a.minCents >= 0 &&
        Number.isSafeInteger(a.maxCents) && a.maxCents >= a.minCents && a.basis?.rule === RULE && a.note === NOTE &&
        typeof a.basis?.category === 'string' && a.basis.category.length <= 40 &&
        typeof a.basis?.condition === 'string' && a.basis.condition.length <= 40,
      'INVALID_ARGUMENT', '估价仅适用于闲置，需保留完整参考区间、依据和声明')
      fields.appraisal = { minCents: a.minCents, maxCents: a.maxCents,
        basis: { category: a.basis.category, condition: a.basis.condition, rule: RULE }, note: NOTE }
    } else if (p.marketType === 'sell' && old?.marketType === 'sell' && old.appraisal &&
      old.category === fields.category && old.condition === fields.condition && canonical(old.imageIds) === canonical(fields.imageIds)) fields.appraisal = old.appraisal
    return fields
  }
  const reservationSummary = (r) => ({ ...r, buyer: user(r.buyerId), seller: user(r.sellerId) })
  const note = (r, recipientId, title, event) => notify({ eventId: `reservation:${r.id}:${event}`, recipientId, title, contentType: 'market', contentId: r.contentId })

  function execute(method, p, me) {
    const userId = me.id
    const scope = (filters = {}) => [userId, method, filters]
    if (method === 'user.getProfile') return user(p.userId || userId)
    if (method === 'user.updateProfile') {
      const next = { ...me }
      if (p.nickname !== undefined) next.nickname = text(p.nickname, 1, 12, '昵称')
      if (p.bio !== undefined) next.bio = text(p.bio, 0, 200, '简介')
      if (p.skillTags !== undefined) {
        requireThat(Array.isArray(p.skillTags) && p.skillTags.length <= 10, 'INVALID_ARGUMENT', '技能标签最多 10 个')
        next.skillTags = [...new Set(p.skillTags.map((tag) => text(tag, 1, 20, '技能标签')))]
      }
      if (p.avatarImageId !== undefined) {
        next.avatarImageId = p.avatarImageId ? upload(p.avatarImageId, userId, 'avatar').imageId : ''
        next.avatarUrl = next.avatarImageId ? accounts.getUpload(next.avatarImageId).url : ''
      }
      store.update('campus.users', next)
      return user(userId)
    }
    if (method === 'user.listPublicContent') {
      user(text(p.userId, 1, 200, '用户编号'))
      return page(content.list().filter((c) => !c.deletedAt && c.ownerId === p.userId && c.visibility === 'public'), p, scope({ userId: p.userId }), summary)
    }
    if (method === 'myContent.list') {
      requireThat(!p.contentType || TYPES.includes(p.contentType), 'INVALID_ARGUMENT', '不支持的内容类型')
      return page(content.list().filter((c) => !c.deletedAt && c.ownerId === userId && (!p.contentType || c.type === p.contentType) && (!p.status || c.status === p.status)), p,
        scope({ contentType: p.contentType || '', status: p.status || '' }), summary)
    }
    if (method === 'favorite.set') {
      requireThat(typeof p.selected === 'boolean', 'INVALID_ARGUMENT', '请选择收藏状态')
      const item = get(p.contentType, p.contentId)
      requireThat(visible(item, userId), 'FORBIDDEN', '无权查看内容')
      const id = createHmac('sha256', store.cursorSecret).update(canonical([userId, p.contentType, p.contentId])).digest('hex')
      const previous = store.get(FAVORITES, id)
      const favorite = { id, uniqueKey: canonical([userId, p.contentType, p.contentId]), userId, contentType: p.contentType,
        contentId: p.contentId, selected: p.selected, createdAt: previous?.createdAt || new Date().toISOString() }
      if (previous) store.update(FAVORITES, favorite)
      else store.insert(FAVORITES, favorite)
      return { selected: p.selected }
    }
    if (method === 'favorite.list') {
      const favorites = rows(FAVORITES).filter((f) => f.userId === userId && f.selected && visible(content.get(f.contentType, f.contentId), userId))
      return page(favorites, p, scope(), (f) => {
        const { uniqueKey, ...safe } = f
        return { ...safe, content: summary(content.get(f.contentType, f.contentId)) }
      })
    }
    if (method === 'appraisal.estimate') {
      upload(p.imageId, userId, 'content')
      const category = text(p.category ?? '', 0, 40, '类别'), condition = text(p.condition ?? '', 0, 40, '成色')
      const ranges = { 教材: [2000, 8000], 生活用品: [1000, 6000], 数码: [10000, 100000], 服饰: [500, 4000] }
      const key = Object.keys(ranges).find((k) => category.includes(k))
      const factor = /全新/.test(condition) ? 1.2 : /九成/.test(condition) ? 1 : /八成/.test(condition) ? 0.8 : /七成/.test(condition) ? 0.7 : /六成/.test(condition) ? 0.6 : 1
      const [lo, hi] = ranges[key] || [1500, 10000]
      return { minCents: Math.round(lo * factor / 100) * 100, maxCents: Math.round(hi * factor / 100) * 100,
        basis: { category: category || '未指定', condition: condition || '未指定', rule: RULE }, note: NOTE }
    }
    if (method === 'market.list') {
      const filters = Object.fromEntries(['keyword', 'category', 'campusId', 'marketType', 'ownerId', 'status'].map((key) => [key, p[key] || '']))
      for (const value of Object.values(filters)) requireThat(typeof value === 'string' && value.length <= 200, 'INVALID_ARGUMENT', '筛选格式不正确')
      return page(content.list('market').filter((c) => visible(c, userId) &&
        (!filters.keyword || `${c.title} ${c.body}`.includes(filters.keyword)) &&
        ['category', 'campusId', 'marketType', 'ownerId', 'status'].every((key) => !filters[key] || c[key] === filters[key])), p, scope(filters), summary)
    }
    if (method === 'market.get') {
      const item = get('market', p.id)
      requireThat(visible(item, userId), 'FORBIDDEN', '无权查看内容')
      return summary(item)
    }
    if (method === 'market.create' || method === 'market.update') {
      let old
      if (method === 'market.update') {
        old = get('market', p.id); owned(old, userId)
        requireThat(old.status === 'active', 'CONFLICT', '商品已结束或已预约，不能再编辑')
        requireThat(!rows(RESERVATIONS).some((r) => r.contentId === old.id && ['pending', 'accepted'].includes(r.status)), 'CONFLICT', '商品有进行中的预约，不能编辑')
      }
      const item = { ...marketFields(p, me, old), id: old?.id || randomUUID(), type: 'market', ownerId: userId,
        campusId: me.campusId || '', campusName: me.campusName || '', status: 'active',
        createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
      if (old) store.update(MARKET, item)
      else store.insert(MARKET, item)
      return summary(item)
    }
    if (method === 'market.close' || method === 'market.complete') {
      const item = get('market', p.id); owned(item, userId)
      requireThat(item.status === 'active', 'CONFLICT', '商品状态已变化')
      item.status = method === 'market.close' ? 'closed' : 'completed'
      item.updatedAt = new Date().toISOString()
      for (const r of rows(RESERVATIONS).filter((r) => r.contentId === item.id && r.status === 'pending')) {
        r.status = 'cancelled'; r.updatedAt = item.updatedAt; store.update(RESERVATIONS, r)
        note(r, r.buyerId, '预约商品已结束', 'cancelled')
      }
      store.update(MARKET, item)
      return summary(item)
    }
    if (method === 'market.reserve') {
      const item = get('market', p.id)
      requireThat(visible(item, userId), 'FORBIDDEN', '无权查看内容')
      requireThat(item.ownerId !== userId, 'INVALID_ARGUMENT', '不能预约自己的商品')
      requireThat(item.marketType === 'sell', 'INVALID_ARGUMENT', '求购不能预约，请联系发布者')
      const existing = rows(RESERVATIONS).find((r) => r.contentId === item.id && ['pending', 'accepted'].includes(r.status))
      if (existing?.buyerId === userId && ['active', 'reserved'].includes(item.status)) return reservationSummary(existing)
      requireThat(item.status === 'active' && !existing, 'CONFLICT', '商品已结束或已有预约')
      const r = { id: randomUUID(), contentId: item.id, buyerId: userId, sellerId: item.ownerId, status: 'pending', createdAt: new Date().toISOString() }
      store.insert(RESERVATIONS, r); note(r, item.ownerId, '收到新的商品交接预约', 'pending')
      return reservationSummary(r)
    }
    if (method === 'market.getCandidates') {
      const item = get('market', p.id)
      requireThat(visible(item, userId), 'FORBIDDEN', '无权查看内容')
      return page(rows(RESERVATIONS).filter((r) => r.contentId === item.id && (item.ownerId === userId || r.buyerId === userId)),
        p, scope({ id: item.id }), reservationSummary)
    }
    if (method === 'market.matchCandidates') {
      const buy = get('market', p.buyId); owned(buy, userId)
      requireThat(buy.marketType === 'buy', 'INVALID_ARGUMENT', '只有求购可以匹配闲置')
      const matched = content.list('market').filter((c) => c.id !== buy.id && !c.deletedAt && c.visibility === 'public' &&
        c.marketType === 'sell' && c.status === 'active' && c.ownerId !== userId && c.category === buy.category &&
        c.campusId === buy.campusId && c.priceCents <= buy.budgetCents)
      return page(matched, p, scope({ buyId: buy.id, category: buy.category, campusId: buy.campusId, budgetCents: buy.budgetCents, keywords: buy.keywords }), (c) => ({ ...summary(c), reasons: ['同类别', '同校区', '价格在预算内',
        ...(`${c.title} ${c.body}`.includes(buy.keywords) ? ['包含求购关键词'] : [])] }))
    }
    if (method.startsWith('reservation.')) {
      const r = store.get(RESERVATIONS, text(p.reservationId ?? p.id, 1, 200, '预约编号'))
      requireThat(r, 'NOT_FOUND', '预约已不存在')
      requireThat(r.buyerId === userId || r.sellerId === userId, 'FORBIDDEN', '无权操作他人预约')
      const item = get('market', r.contentId)
      if (method === 'reservation.respond') {
        requireThat(r.sellerId === userId, 'FORBIDDEN', '只有发布者可以回应预约')
        const accept = p.accept ?? (p.action === 'accept' ? true : p.action === 'reject' ? false : undefined)
        requireThat(typeof accept === 'boolean', 'INVALID_ARGUMENT', '请选择接受或拒绝')
        const nextStatus = accept ? 'accepted' : 'rejected'
        if (r.status === nextStatus) return reservationSummary(r)
        requireThat(r.status === 'pending' && item.status === 'active', 'CONFLICT', '预约或商品状态已变化')
        r.status = nextStatus; r.updatedAt = new Date().toISOString(); store.update(RESERVATIONS, r)
        if (accept) { item.status = 'reserved'; item.reservationId = r.id; item.updatedAt = r.updatedAt; store.update(MARKET, item) }
        note(r, r.buyerId, accept ? '发布者已接受交接预约' : '发布者已拒绝交接预约', nextStatus)
        return reservationSummary(r)
      }
      if (method === 'reservation.complete') {
        if (r.status === 'completed' && item.status === 'completed') return reservationSummary(r)
        requireThat(r.status === 'accepted' && item.status === 'reserved' && item.reservationId === r.id, 'CONFLICT', '仅已接受且未结束的预约可以完成')
        r.status = 'completed'; r.updatedAt = new Date().toISOString(); store.update(RESERVATIONS, r)
        item.status = 'completed'; item.updatedAt = r.updatedAt; store.update(MARKET, item)
        note(r, r.sellerId === userId ? r.buyerId : r.sellerId, '商品交接已完成', 'completed')
        return reservationSummary(r)
      }
    }
    throw new MarketServiceError('NOT_IMPLEMENTED', '此接口尚未接入本机校园服务')
  }
  return {
    invoke(method, p = {}, context = {}) {
      requireThat(MARKET_METHODS.has(method), 'NOT_IMPLEMENTED', '不支持的二手或个人空间接口')
      const me = accounts.getUser(context.userId)
      requireThat(me && !me.disabled, 'UNAUTHENTICATED', '请先登录')
      requireThat(p && typeof p === 'object' && !Array.isArray(p), 'INVALID_ARGUMENT', '请求参数格式不正确')
      return store.transaction(() => operation(method, p, me.id, () => execute(method, p, me)))
    }
  }
}
