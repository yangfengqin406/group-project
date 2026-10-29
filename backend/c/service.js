import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export class CServiceError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
const requireThat = (ok, code, message) => { if (!ok) throw new CServiceError(code, message) }
const text = (value, min, max, label) => {
  requireThat(typeof value === 'string', 'INVALID_ARGUMENT', `${label}格式不正确`)
  const result = value.trim()
  requireThat(result.length >= min && result.length <= max, 'INVALID_ARGUMENT', `${label}需为 ${min}～${max} 个字`)
  return result
}
const identifier = (value) => text(value, 1, 200, '编号')
const types = ['market', 'lost_found', 'plan', 'help']
const contentType = (type) => {
  requireThat(types.includes(type), 'INVALID_ARGUMENT', '不支持的内容来源')
  return type
}
const clean = ({ uniqueKey, ...value }) => value
const canonical = (value) => JSON.stringify(value, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v)
const sync = (value) => {
  requireThat(!value?.then, 'SERVICE_UNAVAILABLE', '存储适配必须在同一同步事务内执行')
  return value
}
const profile = (user) => user ? Object.fromEntries(
  ['id', 'nickname', 'campusId', 'campusName', 'avatarUrl', 'bio', 'skillTags']
    .filter((key) => user[key] !== undefined).map((key) => [key, user[key]])
) : { id: '', nickname: '已注销同学' }

export const C_METHODS = new Set([
  'lostFound.create', 'lostFound.update', 'lostFound.get', 'lostFound.list', 'lostFound.markReturned',
  'conversation.open', 'conversation.get', 'conversation.list', 'message.list', 'message.send',
  'comment.list', 'comment.create', 'notification.list', 'notification.markRead',
  'report.create', 'report.adminResolve', 'subscription.send'
])

export function createCService({ store, getUser, getExternalContent, getUploadByUrl, trustedUploadOrigins = [], assertCanContact = () => {},
  canContactHelpApplicant = () => false, now = () => new Date().toISOString(), awardContribution = () => undefined }) {
  requireThat(store && typeof getUser === 'function', 'SERVICE_UNAVAILABLE', '必须接入服务端存储和账号适配')
  const user = (id) => sync(getUser(id))
  const publicUser = (id) => ({ ...profile(user(id)), id })
  const findContent = (type, id) => {
    contentType(type); identifier(id)
    const item = type === 'lost_found' ? store.get('lost', id)
      : typeof getExternalContent === 'function' ? sync(getExternalContent(type, id)) : null
    requireThat(item && !item.deletedAt, 'NOT_FOUND', '原内容已不存在')
    return item
  }
  const visible = (item, userId) => requireThat(item.visibility === 'public' || item.ownerId === userId, 'FORBIDDEN', '无权查看内容')
  const summarize = (item) => ({ ...item, owner: publicUser(item.ownerId) })
  const member = (id, userId) => {
    const c = store.get('conversations', identifier(id))
    requireThat(c, 'NOT_FOUND', '会话不存在')
    requireThat(c.participantIds.includes(userId), 'FORBIDDEN', '无权访问这段会话')
    return c
  }
  const conversationSummary = (c, userId) => ({
    ...clean(c), peer: publicUser(c.participantIds.find((id) => id !== userId)),
    lastMessage: store.query('messages', "json_extract(data, '$.conversationId') = ?", [c.id], 'seq DESC', 1)[0]?.value || null
  })
  const notify = (event) => {
    const recipientId = identifier(event.recipientId)
    requireThat(user(recipientId), 'NOT_FOUND', '通知接收账号不存在')
    const uniqueKey = canonical([recipientId, text(event.eventId, 1, 300, '事件编号')])
    const existing = store.query('notifications', "json_extract(data, '$.uniqueKey') = ?", [uniqueKey], 'seq DESC', 1)[0]?.value
    if (existing) return clean(existing)
    const value = {
      id: randomUUID(), uniqueKey, recipientId,
      title: text(event.title, 1, 100, '通知标题'),
      contentType: contentType(event.contentType), contentId: identifier(event.contentId),
      read: false, createdAt: now()
    }
    if (event.conversationId) {
      member(event.conversationId, recipientId)
      value.conversationId = event.conversationId
    }
    return clean(store.insert('notifications', value))
  }
  const cursorSignature = (body) => createHmac('sha256', store.cursorSecret).update(body).digest()
  const page = (collection, params, scope, where, args, map = clean, activity = false) => {
    const size = params.pageSize === undefined ? 20 : params.pageSize
    requireThat(Number.isInteger(size) && size >= 1 && size <= 50, 'INVALID_ARGUMENT', '分页数量须为 1～50')
    const binding = canonical(scope)
    if (params.cursor !== undefined && params.cursor !== null && params.cursor !== '') {
      requireThat(typeof params.cursor === 'string' && params.cursor.length <= 4096, 'INVALID_ARGUMENT', '分页游标无效')
      try {
        const [encoded, signature, extra] = params.cursor.split('.')
        const actual = Buffer.from(signature || '', 'base64url')
        const expected = cursorSignature(encoded)
        requireThat(!extra && actual.length === expected.length && timingSafeEqual(actual, expected), 'INVALID_ARGUMENT', '分页游标无效')
        const cursor = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
        requireThat(cursor.scope === binding && Number.isSafeInteger(cursor.seq) && cursor.seq > 0, 'INVALID_ARGUMENT', '分页条件已改变，请刷新')
        if (activity) {
          requireThat(typeof cursor.activeAt === 'string', 'INVALID_ARGUMENT', '分页游标无效')
          where += " AND (json_extract(data, '$.activeAt') < ? OR (json_extract(data, '$.activeAt') = ? AND seq < ?))"
          args.push(cursor.activeAt, cursor.activeAt, cursor.seq)
        } else { where += ' AND seq < ?'; args.push(cursor.seq) }
      } catch (error) {
        if (error instanceof CServiceError) throw error
        throw new CServiceError('INVALID_ARGUMENT', '分页游标无效')
      }
    }
    const rows = store.query(collection, where, args, activity ? "json_extract(data, '$.activeAt') DESC, seq DESC" : 'seq DESC', size + 1)
    const selected = rows.slice(0, size)
    const last = selected.at(-1)
    let nextCursor = null
    if (rows.length > size) {
      const data = { scope: binding, seq: last.seq }
      if (activity) data.activeAt = last.value.activeAt
      const body = Buffer.from(JSON.stringify(data)).toString('base64url')
      nextCursor = `${body}.${cursorSignature(body).toString('base64url')}`
    }
    return { items: selected.map((row) => map(row.value)), nextCursor }
  }
  const lostFields = (p, currentUser) => {
    requireThat(['lost', 'found'].includes(p.lostKind), 'INVALID_ARGUMENT', '请选择丢失或拾获')
    requireThat(['card', 'key', 'misc'].includes(p.category), 'INVALID_ARGUMENT', '请选择卡片、钥匙或杂物')
    requireThat(['public', 'private'].includes(p.visibility ?? 'public'), 'INVALID_ARGUMENT', '公开范围不正确')
    requireThat(Array.isArray(p.images) && p.images.length >= 1 && p.images.length <= 3 && new Set(p.images).size === p.images.length,
      'INVALID_ARGUMENT', '请上传 1～3 张不同的物品照片')
    requireThat(typeof getUploadByUrl === 'function', 'SERVICE_UNAVAILABLE', '公共上传服务尚未接入')
    const images = p.images.map((url) => {
      requireThat(typeof url === 'string' && url.length <= 2048, 'INVALID_ARGUMENT', '图片地址无效')
      let parsed
      try { parsed = new URL(url) } catch { /* Reject local and malformed URLs. */ }
      const localUpload = parsed?.protocol === 'http:' && trustedUploadOrigins.includes(parsed.origin)
      requireThat((parsed?.protocol === 'https:' || localUpload) && !parsed.username && !parsed.password, 'INVALID_ARGUMENT', '图片须来自已配置的公共上传服务')
      const upload = sync(getUploadByUrl(url))
      requireThat(upload && upload.ownerId === currentUser.id && upload.usage === 'content' && upload.status === 'confirmed' &&
        upload.url === url && ['image/jpeg', 'image/png', 'image/webp'].includes(upload.mime) &&
        Number.isSafeInteger(upload.size) && upload.size > 0 && upload.size <= 5 * 1024 * 1024,
      'FORBIDDEN', '图片未确认、超限或不属于当前账号')
      return url
    })
    return {
      title: text(p.title, 2, 60, '标题'), body: text(p.body ?? '', 0, 2000, '描述'),
      location: text(p.location ?? '', 0, 100, '地点'),
      lostKind: p.lostKind, category: p.category, images, visibility: p.visibility ?? 'public'
    }
  }

  function execute(method, p, me) {
    const userId = me.id
    const scope = (...filters) => [userId, method, ...filters]
    if (method === 'subscription.send') throw new CServiceError('NOT_IMPLEMENTED', '微信订阅发送尚未接入；站内通知仍可读取')
    if (method === 'lostFound.create') {
      const create = () => {
        const createdAt = now()
        const item = store.insert('lost', {
          ...lostFields(p, me), id: randomUUID(), type: 'lost_found', ownerId: userId,
          campusId: me.campusId || '', campusName: me.campusName || '', status: 'active', createdAt
        })
        const reward = sync(awardContribution({ userId, kind: 'publish', sourceType: 'lost_found', sourceId: item.id,
          title: item.title, body: item.body, visibility: item.visibility, now: Date.parse(createdAt) }))
        return { ...summarize(item), ...(reward ? { reward } : {}) }
      }
      if (p.idempotencyKey === undefined) return create()
      const key = text(p.idempotencyKey, 1, 200, '操作编号'), fingerprint = canonical(p)
      const previous = store.receipt(userId, method, key)
      if (previous) {
        requireThat(previous.fingerprint === fingerprint, 'CONFLICT', '重复编号不能用于不同操作')
        return JSON.parse(previous.response)
      }
      const result = create()
      store.saveReceipt(userId, method, key, fingerprint, result)
      return result
    }
    if (['lostFound.get', 'lostFound.update', 'lostFound.markReturned'].includes(method)) {
      const item = findContent('lost_found', p.id)
      visible(item, userId)
      if (method === 'lostFound.get') return summarize(item)
      requireThat(item.ownerId === userId, 'FORBIDDEN', '只有发布者可以修改')
      if (method === 'lostFound.markReturned' && item.status === 'returned') return summarize(item)
      requireThat(item.status === 'active', 'CONFLICT', '失物已结束，不能再次修改')
      if (method === 'lostFound.update') Object.assign(item, lostFields({ ...item, ...p }, me))
      else {
        item.status = 'returned'; item.returnedAt = now()
        const contacts = store.query('conversations', "json_extract(data, '$.contentType') = 'lost_found' AND json_extract(data, '$.contentId') = ?", [item.id], 'seq DESC', -1)
        for (const { value: c } of contacts) for (const recipientId of c.participantIds) if (recipientId !== userId && user(recipientId)) {
          notify({ recipientId, eventId: `returned:${item.id}`, title: '联系过的失物已完成归还', contentType: 'lost_found', contentId: item.id, conversationId: c.id })
        }
      }
      item.updatedAt = now()
      store.update('lost', item)
      return summarize(item)
    }
    if (method === 'lostFound.list') {
      const filters = ['keyword', 'category', 'lostKind', 'ownerId', 'status', 'campusId'].map((key) => p[key] ?? '')
      for (const value of filters) requireThat(typeof value === 'string' && value.length <= 200, 'INVALID_ARGUMENT', '筛选条件无效')
      const [keyword, category, kind, ownerId, status, campusId] = filters
      requireThat(!category || ['card', 'key', 'misc'].includes(category), 'INVALID_ARGUMENT', '失物分类无效')
      requireThat(!kind || ['lost', 'found'].includes(kind), 'INVALID_ARGUMENT', '丢失/拾获筛选无效')
      requireThat(!status || ['active', 'returned', 'closed'].includes(status), 'INVALID_ARGUMENT', '失物状态无效')
      let where = "(json_extract(data, '$.visibility') = 'public' OR json_extract(data, '$.ownerId') = ?)"
      const args = [userId]
      for (const [key, value] of [['category', category], ['lostKind', kind], ['ownerId', ownerId], ['status', status], ['campusId', campusId]]) {
        if (value) { where += ` AND json_extract(data, '$.${key}') = ?`; args.push(value) }
      }
      if (keyword) { where += " AND instr(lower(json_extract(data, '$.title') || ' ' || json_extract(data, '$.body')), lower(?)) > 0"; args.push(keyword) }
      return page('lost', p, scope(...filters), where, args, summarize)
    }
    if (method === 'conversation.open') {
      const item = findContent(p.contentType, p.contentId)
      requireThat(item.visibility === 'public', 'FORBIDDEN', '只能联系公开内容的发布者')
      const peerId = identifier(p.peerUserId)
      requireThat(peerId !== userId, 'INVALID_ARGUMENT', '不能与自己建立联系会话')
      if (p.contentType === 'help' && item.ownerId === userId) {
        requireThat(sync(canContactHelpApplicant({ help: item, ownerId: userId, helperId: peerId })) === true,
          'FORBIDDEN', '只能联系本条求助的有效申请人')
      } else requireThat(item.ownerId === peerId && item.ownerId !== userId, 'INVALID_ARGUMENT', '请选择内容发布者联系')
      const peer = user(peerId)
      requireThat(peer && !peer.disabled, 'NOT_FOUND', '对方账号已不可用')
      sync(assertCanContact(userId, peerId))
      const participantIds = [userId, peerId].sort()
      const uniqueKey = canonical([p.contentType, p.contentId, participantIds])
      let c = store.query('conversations', "json_extract(data, '$.uniqueKey') = ?", [uniqueKey], 'seq DESC', 1)[0]?.value
      if (!c) c = store.insert('conversations', {
        id: randomUUID(), uniqueKey, participantIds, contentType: p.contentType, contentId: p.contentId,
        contentTitle: item.title, createdAt: now(), activeAt: now()
      })
      return conversationSummary(c, userId)
    }
    if (method === 'conversation.get') return conversationSummary(member(p.id, userId), userId)
    if (method === 'conversation.list') {
      const source = p.contentType ?? ''
      if (source !== '') contentType(source)
      let where = "EXISTS (SELECT 1 FROM json_each(json_extract(data, '$.participantIds')) WHERE value = ?)"
      const args = [userId]
      if (source) { where += " AND json_extract(data, '$.contentType') = ?"; args.push(source) }
      return page('conversations', p, scope(source), where, args, (c) => conversationSummary(c, userId), true)
    }
    if (method === 'message.list' || method === 'message.send') {
      const c = member(p.conversationId, userId)
      if (method === 'message.list') return page('messages', p, scope(c.id), "json_extract(data, '$.conversationId') = ?", [c.id], (m) => ({ ...m, sender: publicUser(m.senderId) }))
      assertCanContact(userId, c.participantIds.find((id) => id !== userId))
      const body = text(p.body, 1, 1000, '留言')
      const key = text(p.idempotencyKey, 1, 200, '操作编号')
      const fingerprint = canonical([c.id, body])
      const receipt = store.receipt(userId, method, key)
      if (receipt) {
        requireThat(receipt.fingerprint === fingerprint, 'CONFLICT', '重复编号不能用于不同操作')
        return JSON.parse(receipt.response)
      }
      const item = findContent(c.contentType, c.contentId)
      requireThat(item.visibility === 'public', 'FORBIDDEN', '原内容已转为私有，不能继续留言')
      const m = store.insert('messages', { id: randomUUID(), conversationId: c.id, senderId: userId, body, createdAt: now() })
      c.activeAt = m.createdAt; store.update('conversations', c)
      for (const recipientId of c.participantIds) if (recipientId !== userId) notify({
        recipientId, eventId: `message:${m.id}`, title: '收到一条联系消息',
        contentType: c.contentType, contentId: c.contentId, conversationId: c.id
      })
      store.saveReceipt(userId, method, key, fingerprint, m)
      return m
    }
    if (method === 'comment.list' || method === 'comment.create') {
      requireThat(p.contentType === 'lost_found', 'INVALID_ARGUMENT', '当前仅失物招领开放评论')
      const item = findContent(p.contentType, p.contentId)
      visible(item, userId)
      if (method === 'comment.list') return page('comments', p, scope(item.id), "json_extract(data, '$.contentId') = ?", [item.id], (c) => ({ ...c, author: publicUser(c.authorId) }))
      const c = store.insert('comments', {
        id: randomUUID(), contentType: 'lost_found', contentId: item.id,
        authorId: userId, body: text(p.body, 1, 500, '评论'), createdAt: now()
      })
      if (item.ownerId !== userId) notify({ recipientId: item.ownerId, eventId: `comment:${c.id}`, title: '失物招领收到一条新评论', contentType: 'lost_found', contentId: item.id })
      return { ...c, author: publicUser(userId) }
    }
    if (method === 'notification.list') return page('notifications', p, scope(), "json_extract(data, '$.recipientId') = ?", [userId])
    if (method === 'notification.markRead') {
      const n = store.get('notifications', identifier(p.notificationId))
      requireThat(n, 'NOT_FOUND', '通知不存在')
      requireThat(n.recipientId === userId, 'FORBIDDEN', '不能读取他人通知')
      n.read = true; store.update('notifications', n)
      return clean(n)
    }
    if (method === 'report.create') {
      const item = findContent(p.contentType, p.contentId)
      visible(item, userId)
      return store.insert('reports', {
        id: randomUUID(), reporterId: userId, contentType: p.contentType, contentId: p.contentId,
        reason: text(p.reason, 2, 500, '举报原因'), status: 'pending', createdAt: now()
      })
    }
    if (method === 'report.adminResolve') {
      requireThat(Array.isArray(me.roles) && me.roles.includes('admin'), 'FORBIDDEN', '只有管理员可以处理举报')
      const report = store.get('reports', identifier(p.reportId))
      requireThat(report, 'NOT_FOUND', '举报不存在')
      requireThat(['resolve', 'dismiss'].includes(p.action), 'INVALID_ARGUMENT', '请选择处理结果')
      const status = p.action === 'resolve' ? 'resolved' : 'dismissed'
      const resolution = text(p.resolution, 2, 500, '处理说明')
      if (report.status !== 'pending') {
        requireThat(report.status === status && report.resolution === resolution, 'CONFLICT', '举报已经处理')
        return report
      }
      Object.assign(report, { status, resolution, resolvedBy: userId, resolvedAt: now() })
      store.update('reports', report)
      notify({ recipientId: report.reporterId, eventId: `report:${report.id}`, title: '你的举报已有处理结果', contentType: report.contentType, contentId: report.contentId })
      return report
    }
    throw new CServiceError('NOT_IMPLEMENTED', '该接口不由 C 模块提供')
  }

  return {
    methods: C_METHODS,
    invoke(method, params = {}, principal) {
      requireThat(C_METHODS.has(method), 'NOT_IMPLEMENTED', '该接口不由 C 模块提供')
      requireThat(params && typeof params === 'object' && !Array.isArray(params), 'INVALID_ARGUMENT', '参数必须为对象')
      return store.transaction(() => {
        const me = typeof principal?.userId === 'string' ? user(principal.userId) : null
        requireThat(me?.id && me.id === principal.userId && !me.disabled, 'UNAUTHENTICATED', '请先登录')
        return execute(method, params, me)
      })
    },
    // Trusted A/B server events only. Deliberately absent from C_METHODS.
    notify(event) { return store.transaction(() => notify(event)) },
    // Only trusted modules sharing this SQLite connection may call this inside
    // their existing transaction; never expose it through the RPC catalog.
    notifyInTransaction(event) { return notify(event) }
  }
}
