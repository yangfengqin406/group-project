import { ServiceError, requireThat } from '../utils/errors.js'
import { findCandidates } from './matching.js'
import { reconcilePlanState } from './plan-state.js'
import { getPet, savePet } from './pet.js'
import { listDemoBulletins } from './bulletin.js'
import { dispatchFishing } from './fishing.js'
import { dispatchWardrobe } from './wardrobe.js'
import { dispatchDive } from './dive.js'
import { awardDemoContribution, getDemoContributionState } from './rewards.js'
import { transitionHelpCooperation } from '../domain/help/cooperation.js'
import { normalizeHelpBrief, getHelpProgress } from '../domain/help/brief.js'
import { listDemoHelpMine } from './help-mine.js'
const types = {
  plan: 'plan',
  help: 'help',
  market: 'market',
  lostFound: 'lost_found'
}
const clone = (value) => JSON.parse(JSON.stringify(value))
const makeId = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
const publishMethods = new Set(['plan.create', 'help.create', 'market.create', 'lostFound.create'])
const cooperationWrites = new Set(['help.apply', 'help.selectHelper', 'help.confirmCompletion', 'help.cancelCooperation'])

export function dispatch(db, method, p = {}, options = {}) {
  requireThat(p && typeof p === 'object' && !Array.isArray(p), 'INVALID_ARGUMENT', '参数须为对象')
  const atomic = publishMethods.has(method) || cooperationWrites.has(method)
  const previous = atomic ? clone(db) : null
  const now = options.now ?? Date.now()
  try {
    if (publishMethods.has(method) && p.idempotencyKey !== undefined) {
      const currentUser = db.users.find(user => user.id === db.currentUserId && !user.disabled)
      requireThat(currentUser, 'UNAUTHENTICATED', '请先登录')
      requireThat(typeof p.idempotencyKey === 'string' && p.idempotencyKey.trim().length > 0 &&
        p.idempotencyKey.trim().length <= 200, 'INVALID_ARGUMENT', '操作唯一编号无效')
      db.idempotency ||= {}
      const key = `${currentUser.id}:${method}:${p.idempotencyKey.trim()}`
      const fingerprint = canonical(p)
      if (db.idempotency[key]) {
        requireThat(db.idempotency[key].fingerprint === fingerprint, 'CONFLICT', '重复编号不能用于不同操作')
        return clone(db.idempotency[key].data)
      }
      const result = dispatchInternal(db, method, p, now)
      db.idempotency[key] = { fingerprint, data: clone(result) }
      return result
    }
    return dispatchInternal(db, method, p, now)
  } catch (error) {
    if (previous) {
      for (const key of Object.keys(db)) delete db[key]
      Object.assign(db, previous)
    }
    if (error.code && !(error instanceof ServiceError)) throw new ServiceError(error.code, error.message)
    throw error
  }
}

function dispatchInternal(db, method, p, now) {
  if (['auth.deleteAccount', 'user.block', 'user.unblock', 'user.listBlocked'].includes(method))
    throw new ServiceError('NOT_SUPPORTED', '演示版不执行真实账号注销或屏蔽，请在真实服务中操作')
  db.comments ||= []
  const me = () => {
    const user = db.users.find((u) => u.id === db.currentUserId && !u.disabled)
    requireThat(user, 'UNAUTHENTICATED', '请先登录')
    return user
  }
  const content = (type, id) => {
    const item = db.contents[type]?.find((c) => c.id === id)
    requireThat(item, 'NOT_FOUND', '内容已不存在')
    return item
  }
  const owned = (item) =>
    requireThat(item.ownerId === me().id, 'FORBIDDEN', '只有发布者可以修改')
  const canView = (item) =>
    item && (item.visibility === 'public' || item.ownerId === me().id)
  const visible = (item) =>
    requireThat(canView(item), 'FORBIDDEN', '无权查看内容')
  const user = (id) => {
    const u = db.users.find((x) => x.id === id)
    requireThat(u, 'NOT_FOUND', '找不到同学资料')
    const result = clone(u)
    if (result.avatarImageId) {
      const img = (db.uploads || []).find(
        (x) => x.imageId === result.avatarImageId
      )
      result.avatarUrl = img?.url || ''
    }
    return result
  }
  const list = (items, params = p) => {
    const size = Math.min(50, Math.max(1, Number(params.pageSize) || 20))
    const start = Math.max(0, Number(params.cursor) || 0)
    return {
      items: clone(items.slice(start, start + size)),
      nextCursor: start + size < items.length ? String(start + size) : null
    }
  }
  const resolveImages = (item) => {
    if (!Array.isArray(item.imageIds)) return item.images || []
    const uploads = db.uploads || []
    return item.imageIds
      .map((id) => uploads.find((u) => u.imageId === id)?.url)
      .filter(Boolean)
  }
  const summarize = (item) => ({
    ...clone(item),
    ...(item.type === 'help' ? { ...normalizeHelpBrief({}, item), helpProgress: getHelpProgress(item,
      (db.helpApplications || []).find(application => application.helpId === item.id && application.id === item.selectedApplicationId)) } : {}),
    images: resolveImages(item),
    owner: user(item.ownerId)
  })
  const all = () => Object.values(db.contents).flat()
  const note = (recipientId, title, type, id, conversationId) =>
    db.notifications.unshift({
      id: makeId('note'),
      recipientId,
      title,
      contentType: type,
      contentId: id,
      ...(conversationId ? { conversationId } : {}),
      read: false,
      createdAt: new Date().toISOString()
    })
  const idem = (run) => {
    requireThat(
      typeof p.idempotencyKey === 'string' && p.idempotencyKey.trim().length > 0 && p.idempotencyKey.trim().length <= 200,
      'INVALID_ARGUMENT',
      '缺少操作唯一编号'
    )
    db.idempotency ||= {}
    const key = `${me().id}:${method}:${p.idempotencyKey.trim()}`
    const fingerprint = canonical(p)
    if (db.idempotency[key]) {
      requireThat(
        db.idempotency[key].fingerprint === fingerprint,
        'CONFLICT',
        '重复编号不能用于不同操作'
      )
      return clone(db.idempotency[key].data)
    }
    const data = run()
    db.idempotency[key] = { fingerprint, data: clone(data) }
    return data
  }
  if (method === 'auth.login') {
    if (p.type === 'wechat')
      throw new ServiceError('NOT_IMPLEMENTED', '微信登录待群里确认后接入')
    requireThat(p.type === 'h5', 'INVALID_ARGUMENT', '暂仅支持 h5 学号密码登录')
    requireThat(
      typeof p.studentId === 'string' && p.studentId.trim(),
      'INVALID_ARGUMENT',
      '请输入学号'
    )
    requireThat(
      typeof p.password === 'string' && p.password,
      'INVALID_ARGUMENT',
      '请输入密码'
    )
    const loggedIn = db.users[0]
    db.currentUserId = loggedIn.id
    return {
      token: `mock_${loggedIn.id}_${Date.now()}`,
      user: clone(loggedIn)
    }
  }
  me()
  reconcilePlanState(db)
  if (method === 'rewards.getState') return getDemoContributionState(db, me().id, p, now)
  if (method === 'help.listMine') return listDemoHelpMine(db, me().id, p, { summarize, publicUser: user, now })
  if (method === 'help.listApplications' || cooperationWrites.has(method)) {
    const currentUser = me()
    requireThat(typeof p.helpId === 'string' && p.helpId.length > 0 && p.helpId.length <= 200,
      'INVALID_ARGUMENT', '求助编号无效')
    const help = content('help', p.helpId)
    requireThat(!help.deletedAt, 'NOT_FOUND', '求助已不存在')
    const applications = (db.helpApplications || []).filter(application => application.helpId === help.id)
    const applicationSummary = application => ({ ...clone(application), owner: user(application.ownerId), helper: user(application.helperId) })
    if (method === 'help.listApplications') {
      const own = applications.filter(application => currentUser.id === help.ownerId || application.helperId === currentUser.id)
      requireThat(help.visibility === 'public' || currentUser.id === help.ownerId || own.length > 0,
        'FORBIDDEN', '无权查看求助申请')
      const size = p.pageSize === undefined ? 20 : p.pageSize
      requireThat(Number.isInteger(size) && size >= 1 && size <= 50, 'INVALID_ARGUMENT', '分页数量须为1～50')
      const binding = canonical([currentUser.id, method, help.id])
      let before = null
      if (p.cursor !== undefined && p.cursor !== null && p.cursor !== '') {
        let cursor
        try { cursor = JSON.parse(p.cursor) } catch { /* Invalid cursor is checked below. */ }
        requireThat(cursor && cursor.binding === binding && typeof cursor.before === 'string',
          'INVALID_ARGUMENT', '分页条件已改变，请刷新')
        before = cursor.before
      }
      const ordered = own.slice().reverse()
      const offset = before === null ? 0 : ordered.findIndex(value => value.id === before) + 1
      requireThat(before === null || offset > 0, 'INVALID_ARGUMENT', '分页游标无效')
      const selected = ordered.slice(offset, offset + size)
      return { items: selected.map(applicationSummary),
        nextCursor: offset + size < ordered.length ? JSON.stringify({ binding, before: selected.at(-1).id }) : null }
    }
    return idem(() => {
      const action = method.split('.')[1]
      if (action !== 'apply') requireThat(typeof p.applicationId === 'string' && p.applicationId.length > 0 &&
        p.applicationId.length <= 200, 'INVALID_ARGUMENT', '申请编号无效')
      const application = applications.find(value => value.id === p.applicationId)
      const active = userId => requireThat(db.users.some(value => value.id === userId && !value.disabled), 'NOT_FOUND', '对方账号已不可用')
      if (action === 'apply') active(help.ownerId)
      if (action === 'selectHelper') {
        requireThat(currentUser.id === help.ownerId, 'FORBIDDEN', '只有发布者可以选择帮助者')
        requireThat(application, 'NOT_FOUND', '帮助申请已不存在')
        active(application.helperId)
      }
      if (action === 'confirmCompletion') {
        requireThat(application, 'NOT_FOUND', '帮助申请已不存在')
        requireThat([application.ownerId, application.helperId].includes(currentUser.id), 'FORBIDDEN', '无权操作他人的帮助申请')
        active(application.ownerId); active(application.helperId)
      }
      const next = transitionHelpCooperation({ action, help, applications, actorId: currentUser.id,
        applicationId: p.applicationId, now, createId: () => makeId('help_application') })
      db.helpApplications ||= []
      for (const changed of next.changedApplications) {
        const index = db.helpApplications.findIndex(value => value.id === changed.id)
        if (index >= 0) db.helpApplications[index] = changed
        else db.helpApplications.push(changed)
      }
      Object.assign(help, next.help)
      if (!next.help.selectedApplicationId) delete help.selectedApplicationId
      let reward
      for (const event of next.awardEvents) {
        const decision = awardDemoContribution(db, event, now)
        if (event.userId === currentUser.id) reward = decision
      }
      for (const event of next.notifications) {
        if (!db.notifications.some(value => value.eventId === event.eventId && value.recipientId === event.recipientId)) {
          note(event.recipientId, event.title, event.contentType, event.contentId)
          db.notifications[0].eventId = event.eventId
        }
      }
      return { application: applicationSummary(next.application), help: summarize(help), ...(reward ? { reward } : {}) }
    })
  }
  if (method.startsWith('wardrobe.'))
    return dispatchWardrobe(db, me().id, method.slice(9), p)
  if (method.startsWith('dive.'))
    return dispatchDive(db, me().id, method.slice(5), p)
  if (method.startsWith('fishing.'))
    return dispatchFishing(db, me().id, method.slice(8), p)
  if (method === 'bulletin.list') return list(listDemoBulletins())
  if (method === 'pet.get') return getPet(db, me().id, p)
  if (method === 'pet.save') return savePet(db, me().id, p)
  if (method === 'upload.create') {
    requireThat(
      ['content', 'avatar'].includes(p.usage),
      'INVALID_ARGUMENT',
      '请指定图片用途（content / avatar）'
    )
    requireThat(p.data, 'INVALID_ARGUMENT', '请选择图片')
    db.uploads = db.uploads || []
    const image = {
      imageId: makeId('img'),
      ownerId: me().id,
      usage: p.usage,
      url: p.data,
      status: 'pending',
      createdAt: new Date().toISOString()
    }
    db.uploads.unshift(image)
    return { imageId: image.imageId, url: image.url }
  }
  if (method === 'upload.confirm') {
    const img = (db.uploads || []).find((u) => u.imageId === p.imageId)
    requireThat(img, 'NOT_FOUND', '图片不存在')
    requireThat(img.ownerId === me().id, 'FORBIDDEN', '无权操作此图片')
    img.status = 'confirmed'
    if (p.contentType) img.contentType = p.contentType
    if (p.contentId) img.contentId = p.contentId
    return { imageId: img.imageId, status: 'confirmed' }
  }
  if (method === 'user.getProfile') return user(p.userId || me().id)
  if (method === 'user.updateProfile') {
    const u = me()
    if (p.nickname !== undefined)
      requireThat(
        typeof p.nickname === 'string' &&
          p.nickname.trim().length >= 1 &&
          p.nickname.length <= 12,
        'INVALID_ARGUMENT',
        '昵称需为 1～12 个字'
      )
    if (p.bio !== undefined)
      requireThat(
        typeof p.bio === 'string' && p.bio.length <= 200,
        'INVALID_ARGUMENT',
        '简介最多 200 个字'
      )
    if (p.skillTags !== undefined)
      requireThat(
        Array.isArray(p.skillTags) && p.skillTags.length <= 10,
        'INVALID_ARGUMENT',
        '技能标签最多 10 个'
      )
    if (p.avatarImageId !== undefined && p.avatarImageId) {
      const img = (db.uploads || []).find((x) => x.imageId === p.avatarImageId)
      requireThat(
        img && img.ownerId === u.id,
        'FORBIDDEN',
        '头像图片不属于当前账号'
      )
    }
    for (const key of ['nickname', 'bio', 'skillTags', 'avatarImageId'])
      if (p[key] !== undefined) u[key] = p[key]
    return user(u.id)
  }
  if (method === 'user.listPublicContent') {
    user(p.userId)
    return list(
      all()
        .filter((c) => c.ownerId === p.userId && c.visibility === 'public')
        .map(summarize)
    )
  }
  if (method === 'myContent.list')
    return list(
      all()
        .filter(
          (c) =>
            c.ownerId === me().id &&
            (!p.contentType || c.type === p.contentType) &&
            (!p.status || c.status === p.status)
        )
        .map(summarize)
    )
  const [module, action] = method.split('.')
  if (
    types[module] &&
    [
      'list',
      'get',
      'create',
      'update',
      'close',
      'complete',
      'markReturned'
    ].includes(action)
  ) {
    const type = types[module]
    if (action === 'list')
      return list(
        db.contents[type]
          .filter(
            (c) =>
              (c.visibility === 'public' || c.ownerId === me().id) &&
              (!p.keyword || `${c.title} ${c.body}`.includes(p.keyword)) &&
              (!p.category || c.category === p.category) &&
              (type !== 'market' || !p.campusId || c.campusId === p.campusId) &&
              (type !== 'market' ||
                !p.marketType ||
                c.marketType === p.marketType) &&
              (type !== 'lost_found' ||
                !p.lostKind ||
                c.lostKind === p.lostKind) &&
              (!p.ownerId || c.ownerId === p.ownerId) &&
              (!p.status || c.status === p.status)
          )
          .map(summarize)
      )
    if (action === 'get') {
      const item = content(type, p.id)
      visible(item)
      return summarize(item)
    }
    if (action === 'create' || action === 'update') {
      requireThat(
        typeof p.title === 'string' &&
          p.title.trim().length >= 2 &&
          p.title.length <= 60,
        'INVALID_ARGUMENT',
        '标题需为 2～60 个字'
      )
      requireThat(
        typeof p.body === 'string' && p.body.length <= 2000,
        'INVALID_ARGUMENT',
        '说明最多 2000 个字'
      )
      let old
      if (action === 'update') {
        old = content(type, p.id)
        owned(old)
        if (type === 'help') requireThat(!old.selectedApplicationId, 'CONFLICT', '已选定帮助者，协作期间不能编辑求助')
        requireThat(
          (type === 'plan' ? ['open', 'full'] : ['open', 'active']).includes(
            old.status
          ),
          'CONFLICT',
          '该内容不能再编辑'
        )
      }
      if (type === 'plan') {
        const startAt = Date.parse(p.startAt)
        const endAt = Date.parse(p.endAt)
        const now = Date.now()
        requireThat(
          Number.isFinite(startAt) && Number.isFinite(endAt) && startAt < endAt,
          'INVALID_ARGUMENT',
          '结束时间应晚于开始时间'
        )
        requireThat(
          endAt > now,
          'INVALID_ARGUMENT',
          '活动结束时间应在未来'
        )
        requireThat(
          startAt > now || (old && startAt === Date.parse(old.startAt)),
          'INVALID_ARGUMENT',
          old ? '开始时间只能保留原时刻或调整到未来' : '活动开始时间应在未来'
        )
        requireThat(
          Number.isInteger(p.capacity) && p.capacity >= 2 && p.capacity <= 10,
          'INVALID_ARGUMENT',
          '人数需为 2～10 人'
        )
        if (old)
          requireThat(
            p.capacity >= old.memberIds.length,
            'CONFLICT',
            '容量不能少于现有成员'
          )
      }
      if (type === 'market') {
        requireThat(
          ['sell', 'buy'].includes(p.marketType),
          'INVALID_ARGUMENT',
          '请选择发布类型（闲置 / 求购）'
        )
        if (p.marketType === 'sell') {
          requireThat(
            Number.isInteger(p.priceCents) && p.priceCents >= 0,
            'INVALID_ARGUMENT',
            '价格应为非负整数分'
          )
          requireThat(
            typeof p.condition === 'string' && p.condition.trim(),
            'INVALID_ARGUMENT',
            '请填写成色'
          )
        } else {
          requireThat(
            Number.isInteger(p.budgetCents) && p.budgetCents >= 0,
            'INVALID_ARGUMENT',
            '预算应为非负整数分'
          )
          requireThat(
            typeof p.keywords === 'string' && p.keywords.trim(),
            'INVALID_ARGUMENT',
            '请填写关键词'
          )
        }
        if (p.appraisal !== undefined) {
          const estimate = p.appraisal
          requireThat(
            p.marketType === 'sell' &&
              estimate &&
              Number.isSafeInteger(estimate.minCents) &&
              estimate.minCents >= 0 &&
              Number.isSafeInteger(estimate.maxCents) &&
              estimate.maxCents >= estimate.minCents &&
              typeof estimate.basis?.category === 'string' &&
              typeof estimate.basis?.condition === 'string' &&
              estimate.basis?.rule === '类别+成色示例估价' &&
              estimate.note === '参考估价，仅供参考，最终价格由发布者决定',
            'INVALID_ARGUMENT',
            '估价仅适用于闲置，需完整保留参考区间、依据与参考声明'
          )
        }
        if (p.imageIds !== undefined) {
          requireThat(
            Array.isArray(p.imageIds) && p.imageIds.length <= 3,
            'INVALID_ARGUMENT',
            '图片最多 3 张'
          )
          const uploads = db.uploads || []
          for (const imageId of p.imageIds) {
            const img = uploads.find((u) => u.imageId === imageId)
            requireThat(
              img && img.ownerId === me().id,
              'FORBIDDEN',
              '存在不属于当前账号的图片'
            )
          }
        }
      }
      if (type === 'lost_found') {
        requireThat(
          ['lost', 'found'].includes(p.lostKind),
          'INVALID_ARGUMENT',
          '请选择丢失或拾获'
        )
        requireThat(
          ['card', 'key', 'misc'].includes(p.category),
          'INVALID_ARGUMENT',
          '请选择卡片、钥匙或杂物'
        )
        requireThat(
          Array.isArray(p.images) &&
            p.images.length >= 1 &&
            p.images.length <= 3,
          'INVALID_ARGUMENT',
          '请上传 1～3 张物品照片'
        )
      }
      const allowed = ['title', 'body', 'category', 'location']
      if (type !== 'market') allowed.push('images')
      if (type === 'plan') allowed.push('startAt', 'endAt', 'capacity')
      if (type === 'market')
        allowed.push(
          'priceCents',
          'marketType',
          'condition',
          'handoverCampus',
          'keywords',
          'budgetCents',
          'imageIds',
          'appraisal'
        )
      if (type === 'lost_found') allowed.push('lostKind')
      const fields = {}
      for (const key of allowed)
        if (p[key] !== undefined) fields[key] = clone(p[key])
      if (type === 'help') Object.assign(fields, normalizeHelpBrief(p, old || {}))
      const item = {
        ...(old || {}),
        ...fields,
        id: old?.id || makeId(type),
        type,
        ownerId: me().id,
        campusId: me().campusId,
        campusName: me().campusName,
        visibility: p.visibility ?? old?.visibility ?? 'public',
        createdAt: old?.createdAt || new Date(now).toISOString(),
        ...(type === 'help' ? { updatedAt: new Date(now).toISOString() } : {}),
        status:
          old?.status || (['plan', 'help'].includes(type) ? 'open' : 'active')
      }
      requireThat(['public', 'private'].includes(item.visibility), 'INVALID_ARGUMENT', '公开范围不正确')
      if (type === 'plan') item.memberIds = old?.memberIds || [me().id]
      if (old) Object.assign(old, item)
      else db.contents[type].unshift(item)
      if (type === 'market' && p.marketType === 'buy')
        delete (old || item).appraisal
      if (type === 'plan') reconcilePlanState(db)
      const result = summarize(old || item)
      if (!old) result.reward = awardDemoContribution(db, { userId: me().id, kind: 'publish', sourceType: type,
        sourceId: item.id, title: item.title, body: item.body, visibility: item.visibility }, now)
      return result
    }
    const item = content(type, p.id)
    owned(item)
    if (type === 'help') {
      requireThat(item.status === 'open', 'CONFLICT', '求助状态已变化')
      requireThat(!item.selectedApplicationId, 'CONFLICT', '已有帮助者，请由双方确认完成')
    }
    if (type === 'plan')
      requireThat(
        ['open', 'full'].includes(item.status),
        'CONFLICT',
        '计划状态已变化'
      )
    if (type === 'market')
      requireThat(item.status === 'active', 'CONFLICT', '商品状态已变化')
    if (type === 'lost_found' && action === 'markReturned') {
      if (item.status === 'returned') return summarize(item)
      requireThat(item.status === 'active', 'CONFLICT', '失物已结束，不能再次修改')
      item.returnedAt = new Date().toISOString()
      const recipients = new Set()
      for (const c of db.conversations.filter((c) => c.contentType === type && c.contentId === item.id)) {
        for (const id of c.participantIds) if (id !== me().id && !recipients.has(id)) {
          recipients.add(id)
          note(id, '联系过的失物已完成归还', type, item.id, c.id)
        }
      }
    }
    item.status =
      action === 'markReturned'
        ? 'returned'
        : action === 'close'
          ? 'closed'
          : 'completed'
    if (type === 'help') item.updatedAt = new Date(now).toISOString()
    if (type === 'plan') reconcilePlanState(db)
    return summarize(item)
  }
  if (method === 'market.reserve') {
    const item = content('market', p.id)
    visible(item)
    requireThat(
      item.ownerId !== me().id,
      'INVALID_ARGUMENT',
      '不能预约自己的商品'
    )
    requireThat(item.status === 'active', 'CONFLICT', '该商品当前不可预约')
    db.reservations = db.reservations || []
    requireThat(
      !db.reservations.some(
        (r) => r.contentId === item.id && r.status === 'pending'
      ),
      'CONFLICT',
      '该商品已有进行中的预约'
    )
    const r = {
      id: makeId('res'),
      contentId: item.id,
      buyerId: me().id,
      sellerId: item.ownerId,
      status: 'pending',
      createdAt: new Date().toISOString()
    }
    db.reservations.unshift(r)
    return clone(r)
  }
  if (method === 'market.getCandidates') {
    db.reservations = db.reservations || []
    const item = content('market', p.id)
    owned(item)
    return list(
      db.reservations
        .filter((r) => r.contentId === item.id && r.status === 'pending')
        .map(clone)
    )
  }
  if (method === 'market.matchCandidates') {
    const buy = content('market', p.buyId)
    owned(buy)
    requireThat(
      buy.marketType === 'buy',
      'INVALID_ARGUMENT',
      '只有求购可以匹配闲置'
    )
    const budget = Number(buy.budgetCents) || 0
    const keyword = (buy.keywords || '').trim()
    const matched = (db.contents.market || [])
      .filter(
        (c) =>
          c.id !== buy.id &&
          canView(c) &&
          c.marketType === 'sell' &&
          c.status === 'active' &&
          c.ownerId !== me().id &&
          c.category === buy.category &&
          c.campusId === buy.campusId &&
          Number(c.priceCents) <= budget
      )
      .map((c) => {
        const reasons = ['同类别', '同校区', '价格在预算内']
        if (
          keyword &&
          `${c.title} ${c.body}`.includes(keyword)
        )
          reasons.push('包含求购关键词')
        return { ...summarize(c), reasons }
      })
    return list(matched)
  }
  if (method === 'appraisal.estimate') {
    requireThat(
      typeof p.imageId === 'string' && p.imageId.trim(),
      'INVALID_ARGUMENT',
      '请先上传物品照片'
    )
    const img = (db.uploads || []).find((u) => u.imageId === p.imageId)
    requireThat(
      img && img.ownerId === me().id,
      'FORBIDDEN',
      '照片不属于当前账号'
    )
    const category = typeof p.category === 'string' ? p.category.trim() : ''
    const condition = typeof p.condition === 'string' ? p.condition.trim() : ''
    const base = {
      教材: [2000, 8000],
      生活用品: [1000, 6000],
      数码: [10000, 100000],
      服饰: [500, 4000],
      default: [1500, 10000]
    }
    const key = Object.keys(base).find((k) => category.includes(k)) || 'default'
    let [lo, hi] = base[key]
    const factor = /全新/.test(condition)
      ? 1.2
      : /九成/.test(condition)
        ? 1
        : /八成/.test(condition)
          ? 0.8
          : /七成/.test(condition)
            ? 0.7
            : /六成/.test(condition)
              ? 0.6
              : 1
    lo = Math.round((lo * factor) / 100) * 100
    hi = Math.round((hi * factor) / 100) * 100
    return {
      minCents: lo,
      maxCents: hi,
      basis: {
        category: category || '未指定',
        condition: condition || '未指定',
        rule: '类别+成色示例估价'
      },
      note: '参考估价，仅供参考，最终价格由发布者决定'
    }
  }
  if (method === 'plan.getCandidates') {
    const plan = content('plan', p.planId)
    owned(plan)
    return list(
      findCandidates(plan, db.contents.plan).map((c) => ({
        ...c,
        owner: user(c.ownerId),
        plan: summarize(content('plan', c.candidatePlanId))
      }))
    )
  }
  if (method === 'invitation.list')
    return list(
      db.invitations
        .filter((i) => i.senderId === me().id || i.recipientId === me().id)
        .map((i) => ({
          ...i,
          sender: user(i.senderId),
          recipient: user(i.recipientId)
        }))
    )
  if (method === 'invitation.create')
    return idem(() => {
      const target = content('plan', p.targetPlanId),
        source = content('plan', p.sourcePlanId)
      owned(target)
      requireThat(
        findCandidates(target, db.contents.plan).some(
          (c) => c.candidatePlanId === source.id
        ),
        'CONFLICT',
        '该计划当前不符合推荐条件'
      )
      requireThat(
        !db.invitations.some(
          (i) =>
            i.targetPlanId === target.id &&
            i.sourcePlanId === source.id &&
            i.status === 'pending'
        ),
        'CONFLICT',
        '已经发送过邀请'
      )
      const invite = {
        id: makeId('invite'),
        senderId: me().id,
        recipientId: source.ownerId,
        sourcePlanId: source.id,
        targetPlanId: target.id,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
      db.invitations.unshift(invite)
      note(invite.recipientId, '收到一个搭子邀请', 'plan', target.id)
      return clone(invite)
    })
  if (method === 'invitation.respond' || method === 'invitation.cancel')
    return idem(() => {
      const invite = db.invitations.find((i) => i.id === p.invitationId)
      requireThat(invite, 'NOT_FOUND', '邀请不存在')
      const action = method === 'invitation.cancel' ? 'cancel' : p.action
      requireThat(
        ['accept', 'reject', 'cancel'].includes(action),
        'INVALID_ARGUMENT',
        '未知邀请操作'
      )
      requireThat(
        (action === 'cancel' ? invite.senderId : invite.recipientId) ===
          me().id,
        'FORBIDDEN',
        '不能操作他人的邀请'
      )
      requireThat(invite.status === 'pending', 'CONFLICT', '邀请已经处理')
      if (action === 'accept') {
        const target = content('plan', invite.targetPlanId),
          source = content('plan', invite.sourcePlanId)
        requireThat(
          findCandidates(target, db.contents.plan).some(
            (c) => c.candidatePlanId === source.id
          ),
          'CONFLICT',
          '计划已满员、过期或来源状态已变化'
        )
        requireThat(
          !target.memberIds.includes(me().id),
          'CONFLICT',
          '已经在计划中'
        )
        target.memberIds.push(me().id)
        target.status =
          target.memberIds.length >= target.capacity ? 'full' : 'open'
        source.status = 'closed'
        source.joinedPlanId = target.id
        invite.status = 'accepted'
        note(invite.senderId, '对方已接受搭子邀请', 'plan', target.id)
      } else {
        invite.status = action === 'reject' ? 'rejected' : 'cancelled'
        note(
          action === 'cancel' ? invite.recipientId : invite.senderId,
          action === 'cancel' ? '搭子邀请已取消' : '对方暂未接受邀请',
          'plan',
          invite.targetPlanId
        )
      }
      reconcilePlanState(db)
      return {
        invitation: clone(invite),
        targetPlan: summarize(content('plan', invite.targetPlanId))
      }
    })
  if (method === 'conversation.open') {
    const item = content(p.contentType, p.contentId)
    visible(item)
    requireThat(item.visibility === 'public', 'FORBIDDEN', '原内容已转为私有，不能建立联系')
    const authorContactingApplicant = p.contentType === 'help' && item.ownerId === me().id &&
      (db.helpApplications || []).some(application => application.helpId === item.id &&
        application.ownerId === item.ownerId && application.helperId === p.peerUserId &&
        ['pending', 'accepted', 'completed'].includes(application.status))
    requireThat(
      p.peerUserId !== me().id && ((item.ownerId === p.peerUserId && item.ownerId !== me().id) || authorContactingApplicant),
      'INVALID_ARGUMENT',
      '请选择内容发布者或本帖的帮助申请者联系'
    )
    requireThat(db.users.some(value => value.id === p.peerUserId && !value.disabled), 'NOT_FOUND', '对方账号已不可用')
    const existing = db.conversations.find(
      (c) =>
        c.contentType === p.contentType &&
        c.contentId === p.contentId &&
        c.participantIds.includes(me().id) &&
        c.participantIds.includes(p.peerUserId)
    )
    if (existing) return clone(existing)
    const conversation = {
      id: makeId('conversation'),
      participantIds: [me().id, p.peerUserId].sort(),
      contentType: p.contentType,
      contentId: p.contentId,
      contentTitle: item.title,
      createdAt: new Date().toISOString()
    }
    db.conversations.unshift(conversation)
    return clone(conversation)
  }
  if (method === 'conversation.get') {
    const c = db.conversations.find((c) => c.id === p.id)
    requireThat(c, 'NOT_FOUND', '会话不存在')
    requireThat(c.participantIds.includes(me().id), 'FORBIDDEN', '无权访问这段会话')
    return {
      ...clone(c),
      peer: user(c.participantIds.find((id) => id !== me().id)),
      lastMessage: clone(db.messages.filter((m) => m.conversationId === c.id).reduce(
        (latest, m) => !latest || Date.parse(m.createdAt) >= Date.parse(latest.createdAt) ? m : latest, null
      ))
    }
  }
  if (method === 'conversation.list') {
    const userId = me().id
    const source = p.contentType === undefined ? '' : p.contentType
    requireThat(
      source === '' || ['plan', 'help', 'market', 'lost_found'].includes(source),
      'INVALID_ARGUMENT',
      '请选择支持的会话来源'
    )
    const timestamp = (value) => Date.parse(value) || 0
    const latestMessages = new Map()
    for (const message of db.messages) {
      const previous = latestMessages.get(message.conversationId)
      if (!previous || timestamp(message.createdAt) >= timestamp(previous.createdAt))
        latestMessages.set(message.conversationId, message)
    }
    const ordered = db.conversations
      .filter((c) => c.participantIds.includes(userId) && (!source || c.contentType === source))
      .map((conversation, index) => {
        const lastMessage = latestMessages.get(conversation.id) || null
        return {
          conversation, lastMessage, index,
          activeAt: timestamp(lastMessage?.createdAt || conversation.createdAt)
        }
      })
      .sort((a, b) => b.activeAt - a.activeAt || a.index - b.index)
      .map(({ conversation, lastMessage }) => ({
        ...conversation,
        peer: user(conversation.participantIds.find((id) => id !== userId)),
        lastMessage
      }))
    return list(ordered)
  }
  if (method === 'message.list' || method === 'message.send') {
    const c = db.conversations.find((c) => c.id === p.conversationId)
    requireThat(c, 'NOT_FOUND', '会话不存在')
    requireThat(
      c.participantIds.includes(me().id),
      'FORBIDDEN',
      '无权访问这段会话'
    )
    if (method === 'message.list')
      return list(
        db.messages
          .filter((m) => m.conversationId === c.id)
          .reverse()
          .map((m) => ({ ...m, sender: user(m.senderId) }))
      )
    return idem(() => {
      const original = content(c.contentType, c.contentId)
      requireThat(original.visibility === 'public', 'FORBIDDEN', '原内容已转为私有，不能继续留言')
      requireThat(
        typeof p.body === 'string' &&
          p.body.trim().length > 0 &&
          p.body.length <= 1000,
        'INVALID_ARGUMENT',
        '留言需为 1～1000 个字'
      )
      const message = {
        id: makeId('message'),
        conversationId: c.id,
        senderId: me().id,
        body: p.body.trim(),
        createdAt: new Date().toISOString()
      }
      db.messages.push(message)
      for (const id of c.participantIds)
        if (id !== me().id)
          note(id, '收到一条联系消息', c.contentType, c.contentId, c.id)
      return clone(message)
    })
  }
  if (method === 'comment.list') {
    const item = content(p.contentType, p.contentId)
    visible(item)
    return list(
      db.comments
        .filter(
          (comment) =>
            comment.contentType === p.contentType &&
            comment.contentId === p.contentId
        )
        .slice()
        .reverse()
        .map((comment) => ({ ...comment, author: user(comment.authorId) }))
    )
  }
  if (method === 'comment.create') {
    const item = content(p.contentType, p.contentId)
    visible(item)
    requireThat(
      p.contentType === 'lost_found',
      'INVALID_ARGUMENT',
      '当前仅失物招领开放评论'
    )
    requireThat(
      typeof p.body === 'string' &&
        p.body.trim().length > 0 &&
        p.body.trim().length <= 500,
      'INVALID_ARGUMENT',
      '评论需为 1～500 个字'
    )
    const comment = {
      id: makeId('comment'),
      contentType: p.contentType,
      contentId: p.contentId,
      authorId: me().id,
      body: p.body.trim(),
      createdAt: new Date().toISOString()
    }
    db.comments.push(comment)
    if (item.ownerId !== me().id)
      note(item.ownerId, '失物招领收到一条新评论', item.type, item.id)
    return { ...clone(comment), author: user(comment.authorId) }
  }
  if (method === 'notification.list')
    return list(db.notifications.filter((n) => n.recipientId === me().id))
  if (method === 'notification.markRead') {
    const n = db.notifications.find((n) => n.id === p.notificationId)
    requireThat(n, 'NOT_FOUND', '通知不存在')
    requireThat(n.recipientId === me().id, 'FORBIDDEN', '不能读取他人通知')
    n.read = true
    return clone(n)
  }
  if (method === 'favorite.list')
    return list(
      db.favorites
        .filter((f) => f.userId === me().id)
        .flatMap((f) => {
          const item = db.contents[f.contentType]?.find(
            (c) => c.id === f.contentId
          )
          return canView(item) ? [{ ...f, content: summarize(item) }] : []
        })
    )
  if (method === 'favorite.set') {
    const item = content(p.contentType, p.contentId)
    visible(item)
    const index = db.favorites.findIndex(
      (f) =>
        f.userId === me().id &&
        f.contentType === p.contentType &&
        f.contentId === p.contentId
    )
    if (p.selected && index < 0)
      db.favorites.push({
        userId: me().id,
        contentType: p.contentType,
        contentId: p.contentId
      })
    if (!p.selected && index >= 0) db.favorites.splice(index, 1)
    return { selected: !!p.selected }
  }
  if (method === 'report.create') {
    content(p.contentType, p.contentId)
    requireThat(
      typeof p.reason === 'string' && p.reason.trim().length >= 2,
      'INVALID_ARGUMENT',
      '请填写举报原因'
    )
    const r = {
      id: makeId('report'),
      reporterId: me().id,
      contentType: p.contentType,
      contentId: p.contentId,
      reason: p.reason,
      status: 'pending'
    }
    db.reports.push(r)
    return clone(r)
  }
  throw new ServiceError(
    'NOT_IMPLEMENTED',
    `接口 ${method} 已预留，演示版本尚未实现`
  )
}
