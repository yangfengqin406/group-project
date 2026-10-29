import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'

const workspace = fileURLToPath(new URL('../', import.meta.url))
const sale = { title: '待核实的教材信息', body: '校门口交接', category: '教材', marketType: 'sell',
  priceCents: 3000, condition: '九成新', handoverCampus: '校门口', imageIds: [], visibility: 'public' }

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-admin-test-'))
  const store = openCStore(join(directory, 'campus.sqlite'))
  const service = createCampusService({ store, uploadsDir: join(directory, 'uploads'), uploadOrigin: 'http://127.0.0.1:8788' })
  const register = (studentId, nickname) => service.invoke('auth.register', { studentId, nickname, password: 'admin-test-password-123' })
  const owner = register('seller001', '发布同学'), reporter = register('reporter001', '反馈同学'), moderator = register('moderator001', '审核同学')
  const call = (method, params, who = moderator) => service.invoke(method, params, { userId: who.user.id, token: who.token })
  const item = call('market.create', sale, owner)
  const report = (reason = '内容信息需要核实') => call('report.create', { contentType: 'market', contentId: item.id, reason }, reporter)
  const forbiddenOutput = [owner, reporter, moderator].flatMap((account) => {
    const raw = service.accounts.getUser(account.user.id)
    return [account.token, raw.passwordHash, raw.passwordSalt]
  })
  function cli(...args) {
    // Use the same Node 22 executable as the test runner, never an npm shim or
    // a shell command assembled from report text.
    const result = spawnSync(process.execPath, ['scripts/campus-admin.mjs', ...args], {
      cwd: workspace, env: { ...process.env, CAMPUS_DATA_DIR: directory },
      encoding: 'utf8', windowsHide: true, timeout: 15000
    })
    assert.ifError(result.error)
    assert.equal(result.signal, null)
    const output = result.stdout + result.stderr
    for (const secret of forbiddenOutput) assert.equal(output.includes(secret), false, 'CLI must not print account secrets')
    assert.doesNotMatch(output, /passwordHash|passwordSalt|campus_session=|"token"\s*:/)
    return result
  }
  t.after(() => {
    store.close()
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
    assert.match(directory.split(/[\\/]/).at(-1), /^campus-admin-test-/)
    rmSync(directory, { recursive: true, force: true })
  })
  return { store, service, owner, reporter, moderator, call, report, cli }
}

test('本机CLI：普通账号不能处理举报或通过资料升级权限，grant仅添加可信admin角色且可重复执行', (t) => {
  const f = fixture(t), report = f.report()
  const request = { reportId: report.id, action: 'resolve', resolution: '已核实并处理' }
  assert.throws(() => f.call('report.adminResolve', request), (error) => error.code === 'FORBIDDEN')
  f.call('user.updateProfile', { roles: ['admin'], nickname: '审核同学' })
  assert.deepEqual(f.service.accounts.getUser(f.moderator.user.id).roles, [])
  assert.equal(f.cli('reports', 'moderator001').status, 1)
  assert.equal(f.cli('resolve', 'moderator001', report.id, 'resolve', '已核实并处理').status, 1)
  assert.equal(f.store.get('reports', report.id).status, 'pending')
  const before = f.service.accounts.getUser(f.moderator.user.id)
  assert.equal(f.cli('grant', 'MODERATOR001').status, 0)
  assert.equal(f.cli('grant', 'moderator001').status, 0)
  const after = f.service.accounts.getUser(f.moderator.user.id)
  assert.deepEqual(after.roles, ['admin'])
  assert.deepEqual({ ...after, roles: [] }, before)
  assert.equal(f.call('user.getProfile', {}).roles, undefined)
  assert.equal(f.call('report.adminResolve', request).status, 'resolved')
})

test('本机CLI：真实待处理列表、resolve/dismiss持久化，并仅向举报人发送处理通知', (t) => {
  const f = fixture(t), a = f.report('价格与描述不一致'), b = f.report('疑似重复发布')
  assert.equal(f.cli('grant', 'moderator001').status, 0)
  const listed = f.cli('reports', 'moderator001')
  assert.equal(listed.status, 0)
  const pending = JSON.parse(listed.stdout)
  assert.deepEqual(new Set(pending.map((r) => r.id)), new Set([a.id, b.id]))
  assert.deepEqual(Object.keys(pending[0]).sort(), ['id', 'contentType', 'contentId', 'reason', 'createdAt'].sort())
  const resolved = f.cli('resolve', 'moderator001', a.id, 'resolve', '已核实', '并联系双方')
  assert.equal(resolved.status, 0)
  assert.deepEqual(JSON.parse(resolved.stdout), { id: a.id, status: 'resolved', resolution: '已核实 并联系双方' })
  const record = f.store.get('reports', a.id)
  assert.equal(record.resolvedBy, f.moderator.user.id)
  assert.ok(Number.isFinite(Date.parse(record.resolvedAt)))
  assert.equal(JSON.parse(f.cli('reports', 'moderator001').stdout).length, 1)
  const dismissed = f.cli('resolve', 'moderator001', b.id, 'dismiss', '核实为正常内容')
  assert.equal(dismissed.status, 0)
  assert.equal(JSON.parse(dismissed.stdout).status, 'dismissed')
  assert.deepEqual(JSON.parse(f.cli('reports', 'moderator001').stdout), [])
  const notifications = f.call('notification.list', {}, f.reporter).items
  assert.equal(notifications.length, 2)
  assert.ok(notifications.every((n) => n.recipientId === f.reporter.user.id && n.contentType === 'market' && n.contentId === a.contentId))
  assert.deepEqual(f.call('notification.list', {}, f.owner).items, [])
  assert.deepEqual(f.call('notification.list', {}, f.moderator).items, [])
})

test('本机CLI：重复相同结论幂等，冲突结论及无效参数不改处理结果或重复通知', (t) => {
  const f = fixture(t), report = f.report()
  assert.equal(f.cli('grant', 'moderator001').status, 0)
  const args = ['resolve', 'moderator001', report.id, 'resolve', '已经核实完成']
  const initial = f.cli(...args)
  assert.equal(initial.status, 0)
  const saved = f.store.get('reports', report.id)
  const repeated = f.cli(...args)
  assert.equal(repeated.status, 0)
  assert.equal(repeated.stdout, initial.stdout)
  assert.deepEqual(f.store.get('reports', report.id), saved)
  assert.equal(f.cli('resolve', 'moderator001', report.id, 'dismiss', '已经核实完成').status, 1)
  assert.equal(f.cli('resolve', 'moderator001', report.id, 'resolve', '另一套处理说明').status, 1)
  assert.equal(f.cli('resolve', 'moderator001', report.id, 'delete', '无效操作').status, 1)
  assert.equal(f.cli('resolve', 'moderator001', 'missing-report', 'resolve', '无此举报').status, 1)
  assert.deepEqual(f.store.get('reports', report.id), saved)
  assert.equal(f.call('notification.list', {}, f.reporter).items.length, 1)
})

test('本机CLI：缺少参数、不存在账号或已停用账号均明确失败，不输出账户凭据', (t) => {
  const f = fixture(t)
  assert.equal(f.cli().status, 1)
  assert.equal(f.cli('not-an-action', 'moderator001').status, 1)
  assert.equal(f.cli('grant', 'unregistered001').status, 1)
  const raw = f.service.accounts.getUser(f.moderator.user.id)
  f.store.update('campus.users', { ...raw, disabled: true })
  const disabled = f.cli('grant', 'moderator001')
  assert.equal(disabled.status, 1)
  assert.match(disabled.stderr, /有效的账号/)
  assert.deepEqual(f.service.accounts.getUser(f.moderator.user.id).roles, [])
})
