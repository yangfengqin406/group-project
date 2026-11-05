import { contributionPairKey } from '../rewards/contribution.js'

export class HelpCooperationError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

const check = (ok, code, message) => { if (!ok) throw new HelpCooperationError(code, message) }
const clone = (value) => JSON.parse(JSON.stringify(value))

// Pure transitions. Adapters own authentication, contact permissions, storage,
// receipts, rewards and notifications, and commit them in one transaction.
export function transitionHelpCooperation({ action, help: sourceHelp, applications: sourceApplications = [],
  actorId, applicationId, now, createId }) {
  const help = clone(sourceHelp)
  const applications = clone(sourceApplications)
  const stamp = new Date(now).toISOString()
  const changedApplications = [], notifications = [], awardEvents = []
  let application
  const result = () => ({ help, application, changedApplications, notifications, awardEvents,
    completed: application?.status === 'completed' })
  const save = (value) => { value.updatedAt = stamp; changedApplications.push(value) }
  const note = (recipientId, event, title) => notifications.push({ recipientId,
    eventId: `help:${application.id}:${event}`, title, contentType: 'help', contentId: help.id })
  const awards = (onlyActor = false) => {
    const pairKey = contributionPairKey(application.ownerId, application.helperId)
    for (const [userId, kind] of [[application.ownerId, 'help_author'], [application.helperId, 'help_helper']]) {
      if (!onlyActor || userId === actorId) awardEvents.push({ userId, kind, sourceType: 'help',
        sourceId: application.id, title: help.title, pairKey, now })
    }
  }
  const open = () => check(help.status === 'open' && help.visibility === 'public', 'CONFLICT', '求助已结束或不再公开')

  check(help && help.type === 'help' && !help.deletedAt, 'NOT_FOUND', '求助已不存在')
  if (action === 'apply') {
    open()
    check(actorId !== help.ownerId, 'INVALID_ARGUMENT', '不能申请帮助自己')
    check(!help.selectedApplicationId, 'CONFLICT', '发布者已经选定帮助者')
    application = applications.find((value) => value.helpId === help.id && value.helperId === actorId && value.status === 'pending')
    if (application) return result()
    application = { id: createId(), helpId: help.id, ownerId: help.ownerId, helperId: actorId,
      status: 'pending', ownerConfirmedAt: null, helperConfirmedAt: null, createdAt: stamp, updatedAt: stamp }
    changedApplications.push(application)
    note(help.ownerId, 'applied', '收到一个帮忙申请')
    return result()
  }

  application = applications.find((value) => value.id === applicationId && value.helpId === help.id)
  check(application, 'NOT_FOUND', '帮助申请已不存在')
  check(application.ownerId === help.ownerId && application.helperId !== help.ownerId, 'CONFLICT', '帮助申请与求助不一致')
  if (action === 'selectHelper') {
    check(actorId === help.ownerId, 'FORBIDDEN', '只有发布者可以选择帮助者')
    open()
    if (application.status === 'accepted' && help.selectedApplicationId === application.id) return result()
    check(!help.selectedApplicationId && application.status === 'pending', 'CONFLICT', '申请已撤回或已经选定其他帮助者')
    application.status = 'accepted'
    application.ownerConfirmedAt = null; application.helperConfirmedAt = null
    application.acceptedAt = stamp
    help.selectedApplicationId = application.id; help.updatedAt = stamp
    save(application)
    note(application.helperId, 'selected', '你的帮忙申请已被选定')
    return result()
  }

  check(actorId === application.ownerId || actorId === application.helperId, 'FORBIDDEN', '无权操作他人的帮助申请')
  if (action === 'cancelCooperation') {
    check(application.status !== 'completed', 'CONFLICT', '已完成的协作不能取消')
    if (application.status === 'cancelled') return result()
    check(['pending', 'accepted'].includes(application.status), 'CONFLICT', '申请状态已变化')
    application.status = 'cancelled'; application.cancelledAt = stamp
    application.ownerConfirmedAt = null; application.helperConfirmedAt = null
    save(application)
    if (help.selectedApplicationId === application.id) { delete help.selectedApplicationId; help.updatedAt = stamp }
    note(actorId === application.ownerId ? application.helperId : application.ownerId, 'cancelled', '帮忙申请或协作已取消')
    return result()
  }

  check(action === 'confirmCompletion', 'INVALID_ARGUMENT', '未知互助操作')
  check(help.selectedApplicationId === application.id, 'CONFLICT', '该申请不是当前选定的协作')
  if (application.status === 'completed') {
    check(help.status === 'completed', 'CONFLICT', '求助状态已变化')
    awards(true)
    return result()
  }
  open()
  check(application.status === 'accepted', 'CONFLICT', '仅选定且未取消的协作可以确认完成')
  const field = actorId === application.ownerId ? 'ownerConfirmedAt' : 'helperConfirmedAt'
  if (application[field]) return result()
  application[field] = stamp
  save(application)
  if (application.ownerConfirmedAt && application.helperConfirmedAt) {
    application.status = 'completed'; application.completedAt = stamp
    help.status = 'completed'; help.updatedAt = stamp
    awards()
    note(application.ownerId, 'completed', '求助已由双方确认完成')
    note(application.helperId, 'completed', '求助已由双方确认完成')
    for (const other of applications) if (other.id !== application.id && other.helpId === help.id && other.status === 'pending') {
      other.status = 'cancelled'; other.cancelledAt = stamp
      other.ownerConfirmedAt = null; other.helperConfirmedAt = null
      save(other)
    }
  } else note(actorId === application.ownerId ? application.helperId : application.ownerId,
    `confirmed:${actorId}`, '对方已确认求助解决，等待你确认')
  return result()
}
