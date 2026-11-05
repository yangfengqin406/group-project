import { requireThat } from '../../utils/errors.js'

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined
const clone = (value) => JSON.parse(JSON.stringify(value))
const modes = ['flexible', 'online', 'offline']
const progressLabels = { waiting: '等待帮助', helping: '已有帮助者', awaiting_confirmation: '等待双方确认', resolved: '已解决', closed: '已结束', unavailable: '原求助暂不可访问' }

export function normalizeHelpBrief(params = {}, previous = {}) {
  const preferredTime = own(params, 'preferredTime') ? params.preferredTime : previous.preferredTime ?? ''
  const estimatedMinutes = own(params, 'estimatedMinutes') ? params.estimatedMinutes : previous.estimatedMinutes ?? null
  const meetingMode = own(params, 'meetingMode') ? params.meetingMode : previous.meetingMode ?? 'flexible'
  requireThat(typeof preferredTime === 'string' && preferredTime.trim().length <= 80, 'INVALID_ARGUMENT', '期望时间最多80个字')
  requireThat(estimatedMinutes === null || (Number.isInteger(estimatedMinutes) && estimatedMinutes >= 1 && estimatedMinutes <= 480),
    'INVALID_ARGUMENT', '预计用时需为1～480整数分钟，或留空')
  requireThat(modes.includes(meetingMode), 'INVALID_ARGUMENT', '请选择线上、线下或可商量')
  return { preferredTime: preferredTime.trim(), estimatedMinutes, meetingMode }
}

export function getHelpProgress(help, selectedApplication = null) {
  if (!help || help.deletedAt || ['closed', 'cancelled', 'expired'].includes(help.status)) return 'closed'
  if (help.status === 'completed') return 'resolved'
  const selected = selectedApplication && selectedApplication.id === help.selectedApplicationId && selectedApplication.helpId === help.id
    ? selectedApplication : null
  if (selected?.status === 'completed') return 'resolved'
  if (selected?.status === 'accepted') return selected.ownerConfirmedAt || selected.helperConfirmedAt ? 'awaiting_confirmation' : 'helping'
  // Older clients may have the public reference but no private application.
  return help.selectedApplicationId && !selectedApplication ? 'helping' : 'waiting'
}

export const getHelpProgressLabel = (progress) => progressLabels[progress] || progressLabels.waiting
export const helpProgressLabel = (helpOrProgress) => getHelpProgressLabel(typeof helpOrProgress === 'string'
  ? helpOrProgress : helpOrProgress?.helpProgress || getHelpProgress(helpOrProgress))
export function formatHelpBrief(help = {}) {
  const parts = []
  if (typeof help.preferredTime === 'string' && help.preferredTime.trim()) parts.push(help.preferredTime.trim())
  if (Number.isInteger(help.estimatedMinutes) && help.estimatedMinutes >= 1 && help.estimatedMinutes <= 480) parts.push(`约${help.estimatedMinutes}分钟`)
  if (help.meetingMode === 'online') parts.push('线上沟通')
  if (help.meetingMode === 'offline') parts.push('线下见面')
  return parts.join(' · ')
}

const latestStamp = (values) => values.filter((value) => typeof value === 'string').sort().at(-1) || ''
export function compareHelpMineEntries(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? -1 : 1
  return a.helpId === b.helpId ? 0 : a.helpId > b.helpId ? -1 : 1
}

// Applications must be supplied in insertion order (oldest first), so a later
// withdrawal/reapplication wins even when server timestamps are equal.
export function buildHelpMineItems({ userId, scope = 'todo', helps = [], applications = [] }) {
  requireThat(typeof userId === 'string' && userId, 'UNAUTHENTICATED', '请先登录')
  requireThat(['todo', 'posted', 'applied'].includes(scope), 'INVALID_ARGUMENT', '互助筛选范围无效')
  const helpMap = new Map(helps.map((help) => [help.id, help]))
  const entries = []
  if (scope !== 'applied') for (const help of helps) {
    if (help.ownerId !== userId || help.deletedAt) continue
    const related = applications.filter((application) => application.helpId === help.id)
    const selected = related.find((application) => application.id === help.selectedApplicationId) || null
    const pendingCount = related.filter((application) => application.status === 'pending').length
    const actionable = help.status === 'open' && help.visibility === 'public'
    const select = actionable && !help.selectedApplicationId && pendingCount > 0
    const confirm = actionable && selected?.status === 'accepted' && !selected.ownerConfirmedAt
    const entry = { helpId: help.id, help: clone(help), application: selected ? clone(selected) : null,
      role: 'owner', pendingCount, progress: getHelpProgress(help, selected), actionRequired: Boolean(select || confirm),
      actionLabel: select ? '选择帮助者' : confirm ? '确认已解决' : '', availability: 'available',
      updatedAt: latestStamp([help.updatedAt, help.createdAt, ...related.flatMap((application) => [application.updatedAt, application.createdAt])]) }
    if (scope !== 'todo' || entry.actionRequired) entries.push(entry)
  }
  if (scope !== 'posted') {
    const latest = new Map()
    for (const application of applications) if (application.helperId === userId && application.ownerId !== userId)
      latest.set(application.helpId, application)
    for (const [helpId, application] of latest) {
      const help = helpMap.get(helpId)
      const available = Boolean(help && !help.deletedAt && help.visibility === 'public')
      if (!available) {
        if (scope === 'todo') continue
        const { id, helperId, status, createdAt, updatedAt } = application
        entries.push({ helpId, help: null, application: { id, helpId, helperId, status, createdAt, updatedAt },
          role: 'helper', progress: 'unavailable', actionRequired: false, actionLabel: '', availability: 'unavailable',
          updatedAt: latestStamp([updatedAt, createdAt]) })
        continue
      }
      const selected = applications.find((value) => value.helpId === helpId && value.id === help.selectedApplicationId) || null
      const confirm = help.status === 'open' && help.selectedApplicationId === application.id &&
        application.status === 'accepted' && !application.helperConfirmedAt
      const entry = { helpId, help: clone(help), application: clone(application), role: 'helper',
        progress: application.status === 'cancelled' ? 'closed' : getHelpProgress(help, selected), actionRequired: Boolean(confirm),
        actionLabel: confirm ? '确认已解决' : '', availability: 'available',
        updatedAt: latestStamp([help.updatedAt, help.createdAt, application.updatedAt, application.createdAt]) }
      if (scope !== 'todo' || entry.actionRequired) entries.push(entry)
    }
  }
  return entries.sort(compareHelpMineEntries)
}
