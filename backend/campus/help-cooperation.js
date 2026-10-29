import { randomUUID } from 'node:crypto'
import { HelpCooperationError, transitionHelpCooperation } from '../../src/domain/help/cooperation.js'

export const HELP_APPLICATIONS_COLLECTION = 'campus.helpApplications'
export const HELP_COOPERATION_METHODS = new Set(['help.apply', 'help.listApplications', 'help.selectHelper',
  'help.confirmCompletion', 'help.cancelCooperation'])
const check = (ok, code, message) => { if (!ok) throw new HelpCooperationError(code, message) }
const identifier = (value) => {
  check(typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 200, 'INVALID_ARGUMENT', '编号格式不正确')
  return value.trim()
}

export function createHelpCooperation({ store, accounts, summarize, find, paginate, idempotent, notification,
  awardContribution = () => undefined, assertCanContact = () => {} }) {
  store.database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS campus_help_live_application
    ON c_records(json_extract(data, '$.helpId'), json_extract(data, '$.helperId'))
    WHERE collection = 'campus.helpApplications' AND json_extract(data, '$.status') IN ('pending', 'accepted');
    CREATE UNIQUE INDEX IF NOT EXISTS campus_help_selected_application
    ON c_records(json_extract(data, '$.helpId'))
    WHERE collection = 'campus.helpApplications' AND json_extract(data, '$.status') = 'accepted'`)
  const rows = (helpId) => store.query(HELP_APPLICATIONS_COLLECTION, "json_extract(data, '$.helpId') = ?", [helpId], 'seq DESC', 1000000)
  const summary = (value) => ({ ...value, owner: accounts.publicUser(value.ownerId), helper: accounts.publicUser(value.helperId) })
  const activeUser = (userId) => check(accounts.getUser(userId) && !accounts.getUser(userId).disabled, 'NOT_FOUND', '对方账号已不可用')
  return {
    execute(method, p, me, now) {
      const action = method.split('.')[1]
      if (action === 'listApplications') {
        const help = find('campus.help', identifier(p.helpId)), all = rows(help.id)
        const selected = all.filter(({ value }) => help.ownerId === me.id || value.helperId === me.id)
        check(help.visibility === 'public' || help.ownerId === me.id || selected.length, 'FORBIDDEN', '无权查看求助申请')
        return paginate(selected, p, [me.id, method, { helpId: help.id }], summary)
      }
      return idempotent(method, p, me, () => {
        const help = find('campus.help', identifier(p.helpId)), all = rows(help.id)
        const applicationId = action === 'apply' ? undefined : identifier(p.applicationId)
        if (action === 'apply') { activeUser(help.ownerId); assertCanContact(me.id, help.ownerId) }
        if (action === 'selectHelper') {
          check(help.ownerId === me.id, 'FORBIDDEN', '只有发布者可以选择帮助者')
          const application = all.find(({ value }) => value.id === applicationId)?.value
          check(application, 'NOT_FOUND', '帮助申请已不存在')
          activeUser(application.helperId); assertCanContact(me.id, application.helperId)
        }
        if (action === 'confirmCompletion') {
          const application = all.find(({ value }) => value.id === applicationId)?.value
          check(application, 'NOT_FOUND', '帮助申请已不存在')
          check([application.ownerId, application.helperId].includes(me.id), 'FORBIDDEN', '无权操作他人的帮助申请')
          activeUser(application.ownerId); activeUser(application.helperId)
        }
        const next = transitionHelpCooperation({ action, help, applications: all.map(({ value }) => value),
          actorId: me.id, applicationId, now, createId: randomUUID })
        for (const application of next.changedApplications) {
          if (all.some(({ value }) => value.id === application.id)) store.update(HELP_APPLICATIONS_COLLECTION, application)
          else store.insert(HELP_APPLICATIONS_COLLECTION, application)
        }
        store.update('campus.help', next.help)
        let reward
        for (const event of next.awardEvents) {
          const awarded = awardContribution(event)
          check(!awarded?.then, 'SERVICE_UNAVAILABLE', '奖励必须在业务同步事务中提交')
          if (event.userId === me.id) reward = awarded
        }
        for (const event of next.notifications) notification(event)
        return { application: summary(next.application), help: summarize(next.help), ...(reward ? { reward } : {}) }
      })
    }
  }
}
