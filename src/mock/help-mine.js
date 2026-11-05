import { buildHelpMineItems, compareHelpMineEntries } from '../domain/help/brief.js'
import { requireThat } from '../utils/errors.js'

// Opaque cursor receipts belong only to the demonstration store. They are not
// transferable between accounts/scopes or a substitute for real server auth.
export function listDemoHelpMine(db, userId, params, { summarize, publicUser, now }) {
  requireThat(Object.keys(params).every(key => ['scope', 'cursor', 'pageSize'].includes(key)),
    'INVALID_ARGUMENT', '只能读取当前账号的互助记录')
  const scope = params.scope === undefined ? 'todo' : params.scope
  const pageSize = params.pageSize === undefined ? 20 : params.pageSize
  requireThat(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50, 'INVALID_ARGUMENT', '分页数量须为1～50')
  const helps = (db.contents.help || []).filter(help => db.users.some(user => user.id === help.ownerId && !user.disabled))
  const entries = buildHelpMineItems({ userId, scope, helps, applications: db.helpApplications || [] })
  let boundary = null
  if (params.cursor !== undefined && params.cursor !== null && params.cursor !== '') {
    requireThat(typeof params.cursor === 'string' && params.cursor.length <= 200, 'INVALID_ARGUMENT', '分页游标无效')
    const receipt = Object.prototype.hasOwnProperty.call(db.helpMineCursors || {}, params.cursor)
      ? db.helpMineCursors[params.cursor] : null
    requireThat(receipt && receipt.userId === userId && receipt.scope === scope && receipt.expiresAt >= now,
      'INVALID_ARGUMENT', '分页条件已改变或游标失效，请刷新')
    boundary = receipt.boundary
  }
  const remaining = boundary ? entries.filter(entry => compareHelpMineEntries(entry, boundary) > 0) : entries
  const selected = remaining.slice(0, pageSize)
  let nextCursor = null
  if (remaining.length > pageSize) {
    db.helpMineCursors ||= {}
    for (const [token, receipt] of Object.entries(db.helpMineCursors))
      if (receipt.expiresAt < now) delete db.helpMineCursors[token]
    const stored = Object.keys(db.helpMineCursors)
    for (const token of stored.slice(0, Math.max(0, stored.length - 199))) delete db.helpMineCursors[token]
    db.helpMineCursorSequence = (db.helpMineCursorSequence || 0) + 1
    nextCursor = `help_mine_${db.helpMineCursorSequence}_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const last = selected.at(-1)
    db.helpMineCursors[nextCursor] = { userId, scope, boundary: { updatedAt: last.updatedAt, helpId: last.helpId }, expiresAt: now + 86400000 }
  }
  return { items: selected.map(entry => {
    if (entry.availability !== 'available') return entry
    return { ...entry, help: summarize(entry.help), application: entry.application ? {
      ...entry.application, owner: publicUser(entry.application.ownerId), helper: publicUser(entry.application.helperId)
    } : null }
  }), nextCursor }
}
