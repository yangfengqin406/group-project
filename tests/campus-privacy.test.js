import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'

const password = 'privacy-test-password'
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-privacy-test-'))
  const filename = join(directory, 'campus.sqlite'), uploadsDir = join(directory, 'uploads')
  let store, service
  const reopen = () => {
    store?.close()
    store = openCStore(filename)
    service = createCampusService({ store, uploadsDir, uploadOrigin: 'https://example.com' })
  }
  reopen()
  t.after(() => {
    store.close()
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
    assert.match(directory.split(/[\\/]/).at(-1), /^campus-privacy-test-/)
    rmSync(directory, { recursive: true, force: true })
  })
  return {
    get store() { return store }, get service() { return service }, reopen,
    register(name) { return service.invoke('auth.register', { studentId: name, nickname: name, password }) },
    call(method, params, login) { return service.invoke(method, params, { userId: login.user.id, token: login.token }) }
  }
}

test('blocking is durable, bilateral for new contact, idempotent and private to its owner', (t) => {
  const f = fixture(t), a = f.register('alice'), b = f.register('bob'), c = f.register('carol')
  f.store.insert('campus.market', { id: 'item-b', type: 'market', title: '测试书籍', body: '', visibility: 'public', ownerId: b.user.id })
  const opening = { contentType: 'market', contentId: 'item-b', peerUserId: b.user.id }
  const conversation = f.call('conversation.open', opening, a)
  f.call('message.send', { conversationId: conversation.id, body: '已经发生的交流', idempotencyKey: 'before-block' }, a)
  assert.throws(() => f.call('user.block', { userId: b.user.id, ownerId: c.user.id }, a), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => f.call('user.block', { userId: a.user.id }, a), { code: 'INVALID_ARGUMENT' })
  assert.deepEqual(f.call('user.block', { userId: b.user.id }, a), { blocked: true })
  assert.deepEqual(f.call('user.block', { userId: b.user.id }, a), { blocked: true })
  f.reopen()
  assert.equal(f.call('user.listBlocked', {}, a).items.length, 1)
  assert.deepEqual(f.call('user.listBlocked', {}, b).items, [])
  assert.throws(() => f.call('user.listBlocked', { userId: a.user.id }, c), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => f.call('conversation.open', opening, a), { code: 'FORBIDDEN' })
  for (const login of [a, b])
    assert.throws(() => f.call('message.send', { conversationId: conversation.id, body: '新消息', idempotencyKey: 'blocked-send' }, login), { code: 'FORBIDDEN' })
  assert.equal(f.call('message.list', { conversationId: conversation.id }, b).items.length, 1)
  f.call('user.block', { userId: a.user.id }, b)
  f.call('user.unblock', { userId: b.user.id }, a)
  assert.throws(() => f.call('conversation.open', opening, a), { code: 'FORBIDDEN' })
  f.call('user.unblock', { userId: a.user.id }, b)
  assert.equal(f.call('conversation.open', opening, a).id, conversation.id)
})

test('account deletion requires current password, removes credentials and files, and preserves only anonymized shared history', (t) => {
  const f = fixture(t), a = f.register('alice'), b = f.register('bob')
  const second = f.service.invoke('auth.login', { type: 'h5', studentId: 'alice', password })
  f.store.insert('campus.market', { id: 'own-item', type: 'market', title: '个人信息', body: '个人正文', visibility: 'public', ownerId: a.user.id })
  f.store.insert('campus.pets', { id: a.user.id, appearance: { name: '私人画稿' } })
  f.store.insert('campus.leisure', { id: a.user.id, secret: 'private-progress' })
  const image = f.service.accounts.receiveUpload({ userId: a.user.id, usage: 'avatar', mime: 'image/png', origin: 'https://example.com',
    buffer: readFileSync(new URL('../src/static/tabs/home.png', import.meta.url)) })
  const filePath = f.service.accounts.getUpload(image.imageId).filePath
  const chat = f.call('conversation.open', { contentType: 'market', contentId: 'own-item', peerUserId: a.user.id }, b)
  f.call('message.send', { conversationId: chat.id, body: '需要清除的私信', idempotencyKey: 'personal-message' }, a)
  f.call('message.send', { conversationId: chat.id, body: '另一方的消息', idempotencyKey: 'other-message' }, b)
  assert.throws(() => f.call('auth.deleteAccount', { confirmation: '注销账号', password: 'incorrect-password' }, a), { code: 'UNAUTHENTICATED' })
  assert.throws(() => f.call('auth.deleteAccount', { confirmation: '注销账号', password, userId: b.user.id }, a), { code: 'INVALID_ARGUMENT' })
  assert.ok(f.service.accounts.authenticate(a.token))
  assert.deepEqual(f.call('auth.deleteAccount', { confirmation: '注销账号', password }, a), { deleted: true })
  f.reopen()
  assert.equal(f.service.accounts.authenticate(a.token), null)
  assert.equal(f.service.accounts.authenticate(second.token), null)
  assert.ok(f.service.accounts.authenticate(b.token))
  const tombstone = f.service.accounts.getUser(a.user.id)
  assert.equal(tombstone.nickname, '已注销用户')
  for (const key of ['studentId', 'passwordSalt', 'passwordHash', 'avatarUrl', 'bio', 'uniqueKey']) assert.equal(key in tombstone, false)
  assert.equal(f.store.get('campus.pets', a.user.id), null)
  assert.equal(f.store.get('campus.leisure', a.user.id), null)
  assert.equal(f.service.accounts.getUpload(image.imageId), null)
  assert.equal(existsSync(filePath), false)
  assert.ok(f.store.get('campus.market', 'own-item').deletedAt)
  const messages = f.call('message.list', { conversationId: chat.id }, b).items
  assert.equal(messages.find((m) => m.senderId === a.user.id).body, '该内容已随账号注销删除')
  assert.equal(messages.find((m) => m.senderId === b.user.id).body, '另一方的消息')
  assert.throws(() => f.call('message.send', { conversationId: chat.id, body: '无法再联系', idempotencyKey: 'after-deletion' }, b), { code: 'NOT_FOUND' })
})

test('deletion failure rolls back credentials, sessions, publication and file-cleanup jobs together', (t) => {
  const f = fixture(t), a = f.register('alice')
  f.store.insert('campus.market', { id: 'rollback-item', ownerId: a.user.id, title: '保留', visibility: 'public' })
  const originalUpdate = f.store.update
  f.store.update = (collection, value) => {
    if (collection === 'campus.users' && value.deletedAt) throw new Error('simulated-commit-failure')
    return originalUpdate(collection, value)
  }
  assert.throws(() => f.call('auth.deleteAccount', { confirmation: '注销账号', password }, a), /simulated-commit-failure/)
  f.store.update = originalUpdate
  assert.ok(f.service.accounts.authenticate(a.token))
  assert.equal(f.store.get('campus.market', 'rollback-item').deletedAt, undefined)
  assert.equal(f.store.get('campus.market', 'rollback-item').title, '保留')
  assert.equal(f.store.query('campus.file_cleanup').length, 0)
})
