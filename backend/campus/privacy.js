import { randomUUID } from 'node:crypto'
import { unlinkSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { AccountError } from './accounts.js'

const need = (ok, code, message) => { if (!ok) throw new AccountError(code, message) }
const BLOCKS = 'campus.blocks', CLEANUP = 'campus.file_cleanup'
export const PRIVACY_METHODS = new Set(['auth.deleteAccount', 'user.block', 'user.unblock', 'user.listBlocked'])

export function createPrivacyService({ store, accounts, uploadsDir }) {
  const filesRoot = resolve(uploadsDir)
  const rows = (collection, where = '1', args = []) => store.query(collection, where, args, 'seq DESC', 100000).map((row) => row.value)
  const remove = (collection, id) => store.database.prepare('DELETE FROM c_records WHERE collection = ? AND id = ?').run(collection, id)
  const current = (context) => {
    const me = accounts.getUser(context?.userId)
    need(me && !me.disabled, 'UNAUTHENTICATED', '请先登录有效账号')
    return me
  }
  const blocked = (a, b) => Boolean(store.get(BLOCKS, `${a}:${b}`) || store.get(BLOCKS, `${b}:${a}`))
  function assertCanContact(a, b) {
    need(accounts.getUser(b) && !accounts.getUser(b).disabled, 'NOT_FOUND', '对方账号已不可用')
    need(!blocked(a, b), 'FORBIDDEN', '双方存在屏蔽设置，暂时无法联系')
  }
  function cleanupFiles() {
    for (const job of rows(CLEANUP).slice(0, 100)) {
      const filePath = resolve(job.filePath)
      if (!filePath.startsWith(filesRoot + sep)) continue
      try { unlinkSync(filePath) }
      catch (error) { if (error.code !== 'ENOENT') continue }
      remove(CLEANUP, job.id)
    }
  }
  function deleteAccount(params, principal) {
    need(Object.keys(params).every((key) => ['password', 'confirmation'].includes(key)), 'INVALID_ARGUMENT', '注销只接受当前账号密码和确认文字')
    need(params.confirmation === '注销账号', 'INVALID_ARGUMENT', '请输入“注销账号”确认')
    const me = accounts.verifyPassword(principal, params.password)
    const now = new Date().toISOString()
    store.transaction(() => {
      const contentIds = new Set()
      for (const collection of ['campus.market', 'campus.plan', 'campus.help', 'lost']) {
        for (const item of rows(collection, "json_extract(data, '$.ownerId') = ?", [me.id])) {
          contentIds.add(item.id)
          store.update(collection, { id: item.id, type: item.type, ownerId: me.id, visibility: 'private',
            title: '发布者已注销', body: '', status: 'cancelled', imageIds: [], images: [], memberIds: [],
            createdAt: item.createdAt, deletedAt: now })
        }
      }
      for (const plan of rows('campus.plan')) {
        if (plan.deletedAt || !plan.memberIds?.includes(me.id)) continue
        const memberIds = plan.memberIds.filter((id) => id !== me.id)
        store.update('campus.plan', { ...plan, memberIds,
          status: plan.status === 'full' && memberIds.length < plan.capacity ? 'open' : plan.status })
      }
      for (const reservation of rows('campus.reservations')) {
        if ([reservation.buyerId, reservation.sellerId].includes(me.id) && ['pending', 'accepted'].includes(reservation.status))
          store.update('campus.reservations', { ...reservation, status: 'cancelled', cancelledAt: now })
      }
      for (const invitation of rows('campus.invitations')) {
        if ([invitation.senderId, invitation.recipientId].includes(me.id) && invitation.status === 'pending')
          store.update('campus.invitations', { ...invitation, status: 'cancelled', respondedAt: now })
      }
      for (const application of rows('campus.helpApplications')) {
        if (![application.ownerId, application.helperId].includes(me.id) || !['pending', 'accepted'].includes(application.status)) continue
        store.update('campus.helpApplications', { ...application, status: 'cancelled', cancelledAt: now,
          updatedAt: now, ownerConfirmedAt: null, helperConfirmedAt: null })
        const help = store.get('campus.help', application.helpId)
        if (help && !help.deletedAt && help.selectedApplicationId === application.id) {
          delete help.selectedApplicationId
          help.updatedAt = now
          store.update('campus.help', help)
        }
      }
      for (const collection of ['messages', 'comments']) {
        for (const item of rows(collection)) {
          if (item.senderId === me.id || item.authorId === me.id)
            store.update(collection, { ...item, body: '该内容已随账号注销删除', accountDeletedAt: now })
        }
      }
      for (const conversation of rows('conversations')) {
        if (contentIds.has(conversation.contentId))
          store.update('conversations', { ...conversation, contentTitle: '发布者已注销' })
      }
      for (const image of rows('campus.uploads', "json_extract(data, '$.ownerId') = ?", [me.id])) {
        const filePath = resolve(image.filePath)
        need(filePath.startsWith(filesRoot + sep), 'SERVICE_UNAVAILABLE', '文件清理路径异常，请联系维护者')
        store.insert(CLEANUP, { id: randomUUID(), filePath, createdAt: now })
        remove('campus.uploads', image.id)
      }
      for (const collection of ['campus.sessions', 'campus.favorites', BLOCKS, 'notifications', 'reports']) {
        for (const item of rows(collection)) {
          if ([item.userId, item.ownerId, item.recipientId, item.reporterId, item.blockedUserId].includes(me.id)) remove(collection, item.id)
        }
      }
      remove('campus.pets', me.id)
      remove('campus.leisure', me.id)
      for (const event of rows('campus.rewardEvents', "json_extract(data, '$.userId') = ?", [me.id])) remove('campus.rewardEvents', event.id)
      store.database.prepare('DELETE FROM c_receipts WHERE user_id = ? OR instr(response, ?) > 0').run(me.id, me.id)
      // Keep only an anonymous tombstone for counterparties' historical records.
      // It contains no login name, password, profile, avatar or gameplay data.
      store.update('campus.users', { id: me.id, nickname: '已注销用户', disabled: true, deletedAt: now })
    })
    // Filesystem deletion cannot join a SQLite transaction. Jobs are durable,
    // access is revoked atomically above, and remaining jobs retry on requests.
    cleanupFiles()
    return { deleted: true }
  }
  cleanupFiles()
  return {
    assertCanContact,
    invoke(method, params = {}, principal = {}) {
      cleanupFiles()
      if (method === 'auth.deleteAccount') return deleteAccount(params, principal)
      const me = current(principal)
      if (method === 'user.listBlocked') {
        need(!Object.keys(params).length, 'INVALID_ARGUMENT', '只能读取本人的屏蔽设置')
        return { items: rows(BLOCKS, "json_extract(data, '$.ownerId') = ?", [me.id]).map((row) => ({
          userId: row.blockedUserId, nickname: accounts.publicUser(row.blockedUserId)?.nickname || '已注销用户', createdAt: row.createdAt
        })) }
      }
      need(['user.block', 'user.unblock'].includes(method), 'NOT_IMPLEMENTED', '账号安全接口不存在')
      need(Object.keys(params).every((key) => key === 'userId') && typeof params.userId === 'string' && params.userId.length <= 200 && params.userId !== me.id,
        'INVALID_ARGUMENT', '请选择其他用户')
      const id = `${me.id}:${params.userId}`
      return store.transaction(() => {
        if (method === 'user.unblock') { remove(BLOCKS, id); return { blocked: false } }
        const target = accounts.getUser(params.userId)
        need(target && !target.disabled, 'NOT_FOUND', '用户不存在')
        if (!store.get(BLOCKS, id)) {
          need(rows(BLOCKS, "json_extract(data, '$.ownerId') = ?", [me.id]).length < 200, 'CONFLICT', '屏蔽名单已达上限，请先整理')
          store.insert(BLOCKS, { id, ownerId: me.id, blockedUserId: params.userId, createdAt: new Date().toISOString() })
        }
        return { blocked: true }
      })
    }
  }
}
