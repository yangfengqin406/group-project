import { ServiceError, requireThat } from '../utils/errors.js'
import { findCandidates } from './matching.js'
import { reconcilePlanState } from './plan-state.js'
import { getPet, savePet } from './pet.js'
import { listDemoBulletins } from './bulletin.js'
import { dispatchFishing } from './fishing.js'
import { dispatchWardrobe } from './wardrobe.js'
import { dispatchDive } from './dive.js'
const types = {
  plan: 'plan',
  help: 'help',
  market: 'market',
  lostFound: 'lost_found'
}
const clone = (value) => JSON.parse(JSON.stringify(value))
const makeId = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
export function dispatch(db, method, p = {}) {
  db.comments ||= []
  const me = () => {
    const user = db.users.find((u) => u.id === db.currentUserId)
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
    images: resolveImages(item),
    owner: user(item.ownerId)
  })
  const all = () => Object.values(db.contents).flat()
  const note = (recipientId, title, type, id) =>
    db.notifications.unshift({
      id: makeId('note'),
      recipientId,
      title,
      contentType: type,
      contentId: id,
      read: false,
      createdAt: new Date().toISOString()
    })
  const idem = (run) => {
    requireThat(
      typeof p.idempotencyKey === 'string' && p.idempotencyKey.length > 0,
      'INVALID_ARGUMENT',
      '缺少操作唯一编号'
    )
    const key = `${me().id}:${method}:${p.idempotencyKey}`
    const fingerprint = JSON.stringify(p)
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
          'imageIds'
        )
      if (type === 'lost_found') allowed.push('lostKind')
      const fields = {}
      for (const key of allowed)
        if (p[key] !== undefined) fields[key] = clone(p[key])
      const item = {
        ...(old || {}),
        ...fields,
        id: old?.id || makeId(type),
        type,
        ownerId: me().id,
        campusId: me().campusId,
        campusName: me().campusName,
        visibility: old?.visibility || 'public',
        createdAt: old?.createdAt || new Date().toISOString(),
        status:
          old?.status || (['plan', 'help'].includes(type) ? 'open' : 'active')
      }
      if (type === 'plan') item.memberIds = old?.memberIds || [me().id]
      if (old) Object.assign(old, item)
      else db.contents[type].unshift(item)
      if (type === 'plan') reconcilePlanState(db)
      return summarize(old || item)
    }
    const item = content(type, p.id)
    owned(item)
    if (type === 'plan')
      requireThat(
        ['open', 'full'].includes(item.status),
        'CONFLICT',
        '计划状态已变化'
      )
    if (type === 'market')
      requireThat(item.status === 'active', 'CONFLICT', '商品状态已变化')
    item.status =
      action === 'markReturned'
        ? 'returned'
        : action === 'close'
          ? 'closed'
          : 'completed'
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
    requireThat(
      item.ownerId === p.peerUserId && item.ownerId !== me().id,
      'INVALID_ARGUMENT',
      '请选择内容发布者联系'
    )
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
      participantIds: [me().id, p.peerUserId],
      contentType: p.contentType,
      contentId: p.contentId,
      contentTitle: item.title,
      createdAt: new Date().toISOString()
    }
    db.conversations.unshift(conversation)
    return clone(conversation)
  }
  if (method === 'conversation.list')
    return list(
      db.conversations
        .filter((c) => c.participantIds.includes(me().id))
        .map((conversation) => ({
          ...conversation,
          peer: user(conversation.participantIds.find((id) => id !== me().id)),
          lastMessage:
            db.messages
              .filter((message) => message.conversationId === conversation.id)
              .slice(-1)[0] || null
        }))
    )
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
          note(id, '收到一条联系消息', c.contentType, c.contentId)
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
