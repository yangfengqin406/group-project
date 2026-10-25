import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export class PlanServiceError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
const check = (ok, code, message) => { if (!ok) throw new PlanServiceError(code, message) }
const text = (value, min, max, label) => {
  check(typeof value === 'string', 'INVALID_ARGUMENT', `${label}格式不正确`)
  const result = value.trim()
  check(result.length >= min && result.length <= max, 'INVALID_ARGUMENT', `${label}需为 ${min}～${max} 个字`)
  return result
}
const id = (value) => text(value, 1, 200, '编号')
const canonical = (value) => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v)
const day = (iso) => new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 10)
const clone = (value) => JSON.parse(JSON.stringify(value))

export const PLAN_METHODS = new Set([
  'plan.create', 'plan.update', 'plan.get', 'plan.list', 'plan.close', 'plan.complete', 'plan.getCandidates',
  'invitation.create', 'invitation.list', 'invitation.respond', 'invitation.cancel',
  'help.create', 'help.get', 'help.list', 'help.update', 'help.complete', 'help.getCandidates'
])

// Rules are evaluated against authoritative records inside BEGIN IMMEDIATE.
// A source represents one person; accepting never moves an existing group.
function candidates(target, plans, now) {
  if (target.visibility !== 'public' || target.joinedPlanId || target.status !== 'open' ||
      target.memberIds.length >= target.capacity || Date.parse(target.endAt) <= now) return []
  return plans.filter((other) => other.id !== target.id && other.ownerId !== target.ownerId &&
    !target.memberIds.includes(other.ownerId) && other.visibility === 'public' && !other.joinedPlanId &&
    other.campusId === target.campusId && other.category === target.category && other.status === 'open' &&
    other.memberIds.length === 1 && other.memberIds[0] === other.ownerId && other.memberIds.length < other.capacity &&
    Date.parse(other.endAt) > now && day(other.startAt) === day(target.startAt) &&
    Math.max(Date.parse(other.startAt), Date.parse(target.startAt)) < Math.min(Date.parse(other.endAt), Date.parse(target.endAt)))
}

export function createPlanService({ store, accounts, content, notify }) {
  const rows = (collection) => store.query(collection, '1', [], 'seq DESC', 1000000)
  const plans = () => rows('campus.plan').map((row) => row.value)
  const summarize = (value) => content.summarize(clone(value))
  const owned = (value, userId) => check(value.ownerId === userId, 'FORBIDDEN', '只有发布者可以修改')
  const visible = (value, userId) => check(value.visibility === 'public' || value.ownerId === userId, 'FORBIDDEN', '无权查看内容')
  const find = (collection, value) => {
    const result = store.get(collection, id(value))
    check(result && !result.deletedAt, 'NOT_FOUND', '内容已不存在')
    return result
  }
  const notification = (value) => {
    const result = notify(value)
    check(!result?.then, 'SERVICE_UNAVAILABLE', '通知必须与业务在同一同步事务内提交')
  }
  const reconcile = (now) => {
    const all = plans()
    for (const plan of all) {
      if (!['open', 'full'].includes(plan.status)) continue
      const status = Date.parse(plan.endAt) <= now ? 'expired' : plan.memberIds.length >= plan.capacity ? 'full' : 'open'
      if (status !== plan.status) { plan.status = status; store.update('campus.plan', plan) }
    }
    for (const { value: invitation } of rows('campus.invitations')) {
      if (invitation.status !== 'pending') continue
      const target = all.find((plan) => plan.id === invitation.targetPlanId)
      const source = all.find((plan) => plan.id === invitation.sourcePlanId)
      if (!target || !source || !candidates(target, all, now).some((candidate) => candidate.id === source.id)) {
        invitation.status = 'expired'
        store.update('campus.invitations', invitation)
      }
    }
  }
  const paginate = (allRows, p, binding, map = (value) => value) => {
    const pageSize = p.pageSize === undefined ? 20 : p.pageSize
    check(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50, 'INVALID_ARGUMENT', '分页数量须为 1～50')
    const scope = canonical(binding)
    const sign = (body) => createHmac('sha256', store.cursorSecret).update(body).digest()
    let before = Infinity
    if (p.cursor !== undefined && p.cursor !== null && p.cursor !== '') {
      check(typeof p.cursor === 'string' && p.cursor.length <= 4096, 'INVALID_ARGUMENT', '分页游标无效')
      try {
        const [body, signature, extra] = p.cursor.split('.')
        const actual = Buffer.from(signature || '', 'base64url'), expected = sign(body)
        check(!extra && actual.length === expected.length && timingSafeEqual(actual, expected), 'INVALID_ARGUMENT', '分页游标无效')
        const cursor = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
        check(cursor.scope === scope && Number.isSafeInteger(cursor.seq) && cursor.seq > 0, 'INVALID_ARGUMENT', '分页条件已变化，请刷新')
        before = cursor.seq
      } catch (error) {
        if (error instanceof PlanServiceError) throw error
        throw new PlanServiceError('INVALID_ARGUMENT', '分页游标无效')
      }
    }
    const selected = allRows.filter((row) => row.seq < before).sort((a, b) => b.seq - a.seq).slice(0, pageSize + 1)
    const page = selected.slice(0, pageSize)
    let nextCursor = null
    if (selected.length > pageSize) {
      const body = Buffer.from(JSON.stringify({ scope, seq: page.at(-1).seq })).toString('base64url')
      nextCursor = `${body}.${sign(body).toString('base64url')}`
    }
    return { items: page.map((row) => map(row.value)), nextCursor }
  }
  const images = (value, userId) => {
    check(Array.isArray(value) && value.length <= 3 && new Set(value).size === value.length, 'INVALID_ARGUMENT', '最多上传 3 张不同的图片')
    return value.map((url) => {
      check(typeof url === 'string' && url.length <= 2048, 'INVALID_ARGUMENT', '图片地址无效')
      const image = accounts.getUploadByUrl(url)
      check(image && image.ownerId === userId && image.url === url && image.usage === 'content' && image.status === 'confirmed' &&
        ['image/png', 'image/jpeg', 'image/webp'].includes(image.mime) && Number.isSafeInteger(image.size) && image.size > 0 && image.size <= 5 * 1024 * 1024,
      'FORBIDDEN', '图片未确认或不属于当前账号')
      return url
    })
  }
  const fields = (type, p, me, old, now) => {
    const value = {
      title: text(p.title, 2, 60, '标题'), body: text(p.body ?? '', 0, 2000, '说明'),
      category: text(p.category ?? '', 0, 60, '类别'), location: text(p.location ?? '', 0, 100, '地点'),
      images: images(p.images ?? old?.images ?? [], me.id), visibility: p.visibility ?? old?.visibility ?? 'public'
    }
    check(['public', 'private'].includes(value.visibility), 'INVALID_ARGUMENT', '公开范围不正确')
    if (type === 'plan') {
      const start = Date.parse(p.startAt), end = Date.parse(p.endAt)
      check(typeof p.startAt === 'string' && typeof p.endAt === 'string' && Number.isFinite(start) && Number.isFinite(end) && start < end,
        'INVALID_ARGUMENT', '结束时间应晚于开始时间')
      check(end > now, 'INVALID_ARGUMENT', '活动结束时间应在未来')
      check(start > now || (old && start === Date.parse(old.startAt)), 'INVALID_ARGUMENT', old ? '开始时间只能保留原时刻或调整到未来' : '活动开始时间应在未来')
      check(Number.isInteger(p.capacity) && p.capacity >= 2 && p.capacity <= 10, 'INVALID_ARGUMENT', '人数需为 2～10 人')
      check(!old || p.capacity >= old.memberIds.length, 'CONFLICT', '容量不能少于现有成员')
      Object.assign(value, { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), capacity: p.capacity })
    }
    return value
  }
  const idempotent = (method, p, me, run) => {
    const key = text(p.idempotencyKey, 1, 200, '操作唯一编号')
    const fingerprint = canonical(p)
    const receipt = store.receipt(me.id, method, key)
    if (receipt) {
      check(receipt.fingerprint === fingerprint, 'CONFLICT', '重复编号不能用于不同操作')
      return JSON.parse(receipt.response)
    }
    const response = run()
    store.saveReceipt(me.id, method, key, fingerprint, response)
    return response
  }

  function execute(method, p, me, now) {
    const [type, action] = method.split('.')
    const scope = (filters = {}) => [me.id, method, filters]
    if (['plan', 'help'].includes(type) && ['create', 'update', 'get', 'list', 'complete', 'close'].includes(action)) {
      const collection = `campus.${type}`
      if (action === 'list') {
        const filters = {}
        for (const key of ['keyword', 'category', 'ownerId', 'status']) if (p[key] !== undefined) filters[key] = text(p[key], 0, 200, key)
        const selected = rows(collection).filter(({ value }) => !value.deletedAt &&
          (value.visibility === 'public' || value.ownerId === me.id) &&
          (!filters.keyword || `${value.title} ${value.body}`.includes(filters.keyword)) &&
          (!filters.category || value.category === filters.category) && (!filters.ownerId || value.ownerId === filters.ownerId) &&
          (!filters.status || value.status === filters.status))
        return paginate(selected, p, scope(filters), summarize)
      }
      if (action === 'get') {
        const value = find(collection, p.id)
        visible(value, me.id)
        return summarize(value)
      }
      if (action === 'create' || action === 'update') {
        const old = action === 'update' ? find(collection, p.id) : null
        if (old) {
          owned(old, me.id)
          check((type === 'plan' ? ['open', 'full'] : ['open']).includes(old.status), 'CONFLICT', '该内容不能再编辑')
        }
        const value = {
          ...(old || {}), ...fields(type, p, me, old, now), id: old?.id || randomUUID(), type,
          ownerId: me.id, campusId: me.campusId || '', campusName: me.campusName || '',
          status: old?.status || 'open', createdAt: old?.createdAt || new Date(now).toISOString(), updatedAt: new Date(now).toISOString()
        }
        if (type === 'plan') value.memberIds = old?.memberIds || [me.id]
        if (old) store.update(collection, value)
        else store.insert(collection, value)
        if (type === 'plan') reconcile(now)
        return summarize(store.get(collection, value.id))
      }
      const value = find(collection, p.id)
      owned(value, me.id)
      check((type === 'plan' ? ['open', 'full'] : ['open']).includes(value.status), 'CONFLICT', '内容状态已变化')
      value.status = action === 'close' ? 'closed' : 'completed'
      value.updatedAt = new Date(now).toISOString()
      store.update(collection, value)
      if (type === 'plan') reconcile(now)
      return summarize(value)
    }
    if (method === 'plan.getCandidates') {
      const target = find('campus.plan', p.planId)
      owned(target, me.id)
      const allowed = new Map(candidates(target, plans(), now).filter((value) => {
        const owner = accounts.getUser(value.ownerId)
        return owner && !owner.disabled
      }).map((value) => [value.id, value]))
      return paginate(rows('campus.plan').filter((row) => allowed.has(row.value.id)), p, scope({ planId: target.id }), (value) => ({
        candidatePlanId: value.id, ownerId: value.ownerId, owner: accounts.publicUser(value.ownerId), plan: summarize(value),
        overlap: { startAt: new Date(Math.max(Date.parse(value.startAt), Date.parse(target.startAt))).toISOString(),
          endAt: new Date(Math.min(Date.parse(value.endAt), Date.parse(target.endAt))).toISOString() },
        reasons: ['同一校区', `都想${target.category}`, '同一天且时间有重叠']
      }))
    }
    if (method === 'invitation.list') return paginate(rows('campus.invitations').filter(({ value }) => value.senderId === me.id || value.recipientId === me.id), p, scope(),
      (value) => ({ ...value, sender: accounts.publicUser(value.senderId), recipient: accounts.publicUser(value.recipientId) }))
    if (method === 'invitation.create') return idempotent(method, p, me, () => {
      const target = find('campus.plan', p.targetPlanId), source = find('campus.plan', p.sourcePlanId)
      owned(target, me.id)
      const peer = accounts.getUser(source.ownerId)
      check(peer && !peer.disabled && candidates(target, plans(), now).some((value) => value.id === source.id), 'CONFLICT', '该计划当前不符合推荐条件')
      check(!rows('campus.invitations').some(({ value }) => value.targetPlanId === target.id && value.sourcePlanId === source.id && value.status === 'pending'),
        'CONFLICT', '已经发送过邀请')
      const value = { id: randomUUID(), senderId: me.id, recipientId: source.ownerId, sourcePlanId: source.id, targetPlanId: target.id,
        status: 'pending', createdAt: new Date(now).toISOString() }
      store.insert('campus.invitations', value)
      notification({ eventId: `invitation:${value.id}:created`, recipientId: source.ownerId, title: '收到一个搭子邀请', contentType: 'plan', contentId: target.id })
      return clone(value)
    })
    if (method === 'invitation.respond' || method === 'invitation.cancel') return idempotent(method, p, me, () => {
      const value = find('campus.invitations', p.invitationId)
      const action = method === 'invitation.cancel' ? 'cancel' : p.action
      check(['accept', 'reject', 'cancel'].includes(action), 'INVALID_ARGUMENT', '未知邀请操作')
      check((action === 'cancel' ? value.senderId : value.recipientId) === me.id, 'FORBIDDEN', '不能操作他人的邀请')
      check(value.status === 'pending', 'CONFLICT', '邀请已经处理或失效')
      const target = find('campus.plan', value.targetPlanId), source = find('campus.plan', value.sourcePlanId)
      if (action === 'accept') {
        check(candidates(target, plans(), now).some((candidate) => candidate.id === source.id), 'CONFLICT', '计划已满员、过期或来源状态已变化')
        check(!target.memberIds.includes(me.id), 'CONFLICT', '已经在计划中')
        target.memberIds.push(me.id)
        target.status = target.memberIds.length >= target.capacity ? 'full' : 'open'
        target.updatedAt = new Date(now).toISOString()
        source.status = 'closed'; source.joinedPlanId = target.id; source.updatedAt = new Date(now).toISOString()
        store.update('campus.plan', target); store.update('campus.plan', source)
        value.status = 'accepted'
      } else value.status = action === 'reject' ? 'rejected' : 'cancelled'
      value.updatedAt = new Date(now).toISOString()
      store.update('campus.invitations', value)
      notification({ eventId: `invitation:${value.id}:${value.status}`, recipientId: action === 'cancel' ? value.recipientId : value.senderId,
        title: action === 'accept' ? '对方已接受搭子邀请' : action === 'cancel' ? '搭子邀请已取消' : '对方暂未接受邀请',
        contentType: 'plan', contentId: target.id })
      reconcile(now)
      return { invitation: clone(value), targetPlan: summarize(store.get('campus.plan', target.id)) }
    })
    if (method === 'help.getCandidates') {
      const help = find('campus.help', p.helpId ?? p.id)
      owned(help, me.id)
      if (help.visibility !== 'public' || help.status !== 'open') return { items: [], nextCursor: null }
      const category = help.category.trim().toLocaleLowerCase()
      const selected = rows('campus.users').filter(({ value }) => value.id !== me.id && !value.disabled && value.campusId === help.campusId &&
        category && Array.isArray(value.skillTags) && value.skillTags.some((tag) => typeof tag === 'string' && tag.trim().toLocaleLowerCase() === category))
      return paginate(selected, p, scope({ helpId: help.id }), (value) => ({ userId: value.id, owner: accounts.publicUser(value.id),
        reasons: ['同一校区', `公开技能标签包含「${help.category}」`], rule: '同校区且公开技能标签与求助类别一致，仅供联系参考' }))
    }
    throw new PlanServiceError('NOT_IMPLEMENTED', '该本地服务接口尚未实现')
  }
  return {
    invoke(method, p = {}, context = {}) {
      check(PLAN_METHODS.has(method), 'NOT_IMPLEMENTED', '该本地服务接口尚未实现')
      check(p && typeof p === 'object' && !Array.isArray(p), 'INVALID_ARGUMENT', '请求参数格式不正确')
      return store.transaction(() => {
        const me = accounts.getUser(context.userId)
        check(me && !me.disabled, 'UNAUTHENTICATED', '请先登录')
        const now = Date.now()
        reconcile(now)
        return execute(method, p, me, now)
      })
    },
    reconcile() { return store.transaction(() => reconcile(Date.now())) }
  }
}
