import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'
import { formatHelpBrief, getHelpProgress, normalizeHelpBrief } from '../src/domain/help/brief.js'

const rejected = (run, code) => assert.throws(run, (error) => error.code === code)
const defaults = { preferredTime: '', estimatedMinutes: null, meetingMode: 'flexible' }
const payload = (changes = {}) => ({ title: '需要毕业照摄影协助', body: '在图书馆门口集合，拍几张照片', category: '摄影', location: '图书馆', images: [], ...changes })
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'help-continuity-'))
  const filename = join(directory, 'data.sqlite'), password = 'test-only-continuity-password'
  let store, service, now = Date.parse('2026-10-28T02:00:00.000Z'), operation = 0
  const reopen = () => {
    store?.close(); store = openCStore(filename)
    service = createCampusService({ store, uploadsDir: join(directory, 'uploads'), uploadOrigin: 'https://example.invalid', now: () => now })
  }
  reopen()
  const users = {}
  for (const name of ['alice', 'bob', 'carol']) users[name] = service.invoke('auth.register', {
    studentId: `continuity-${name}`, nickname: name, password
  }).user
  t.after(() => {
    store.close()
    const target = realpathSync(directory), root = realpathSync(tmpdir())
    assert.equal(dirname(target), root); assert.ok(basename(target).startsWith('help-continuity-'))
    rmSync(target, { recursive: true, force: true })
  })
  const call = (method, p = {}, who = 'alice') => service.invoke(method, p, { userId: users[who].id })
  return {
    users, call, reopen,
    create: (changes = {}, who = 'alice') => call('help.create', payload(changes), who),
    apply: (help, who = 'bob') => call('help.apply', { helpId: help.id, idempotencyKey: `apply:${++operation}` }, who).application,
    act: (method, help, application, who = 'alice') => call(`help.${method}`, {
      helpId: help.id, applicationId: application.id, idempotencyKey: `${method}:${++operation}`
    }, who),
    mine: (scope = 'todo', who = 'alice', more = {}) => call('help.listMine', { scope, ...more }, who),
    removeAccount: (who) => call('auth.deleteAccount', { password, confirmation: '注销账号' }, who),
    advance: (value = 1000) => { now += value },
    get store() { return store }, get service() { return service }
  }
}

test('求助说明兼容旧字段，校验类型范围，更新未提供字段保留且可显式清空', (t) => {
  const f = fixture(t)
  assert.deepEqual(normalizeHelpBrief(), defaults)
  const old = f.create()
  for (const key of Object.keys(defaults)) assert.equal(old[key], defaults[key])
  const detailed = f.create({ preferredTime: '  周六下午，时间可商量  ', estimatedMinutes: 35, meetingMode: 'online' })
  assert.equal(detailed.preferredTime, '周六下午，时间可商量')
  assert.equal(formatHelpBrief(detailed), '周六下午，时间可商量 · 约35分钟 · 线上沟通')
  const edited = f.call('help.update', { ...payload({ title: '改一改标题' }), id: detailed.id })
  assert.equal(edited.preferredTime, detailed.preferredTime); assert.equal(edited.estimatedMinutes, 35); assert.equal(edited.meetingMode, 'online')
  const cleared = f.call('help.update', { ...payload(), id: detailed.id, preferredTime: '', estimatedMinutes: null, meetingMode: 'flexible' })
  for (const key of Object.keys(defaults)) assert.equal(cleared[key], defaults[key])
  for (const changes of [{ preferredTime: 1 }, { preferredTime: null }, { preferredTime: '时'.repeat(81) },
    { estimatedMinutes: '' }, { estimatedMinutes: '30' }, { estimatedMinutes: 0 }, { estimatedMinutes: 1.5 }, { estimatedMinutes: 481 }, { meetingMode: 'anything' }])
    rejected(() => f.create(changes), 'INVALID_ARGUMENT')
  assert.equal(f.create({ preferredTime: '时'.repeat(80), estimatedMinutes: 480, meetingMode: 'offline' }).estimatedMinutes, 480)
  const application = f.apply(detailed)
  f.act('selectHelper', detailed, application)
  rejected(() => f.call('help.update', { ...payload(), id: detailed.id, estimatedMinutes: 60 }), 'CONFLICT')
})

test('公开进度从当前协作推导，取消回等待，双方顺序确认后解决且不泄露私有状态', (t) => {
  const f = fixture(t), help = f.create(), application = f.apply(help)
  assert.equal(f.call('help.get', { id: help.id }, 'carol').helpProgress, 'waiting')
  f.act('selectHelper', help, application)
  assert.equal(f.call('help.get', { id: help.id }, 'carol').helpProgress, 'helping')
  f.act('confirmCompletion', help, application, 'bob')
  assert.equal(f.call('help.get', { id: help.id }, 'carol').helpProgress, 'awaiting_confirmation')
  f.act('confirmCompletion', help, application)
  assert.equal(f.call('help.get', { id: help.id }, 'carol').helpProgress, 'resolved')
  f.call('favorite.set', { contentType: 'help', contentId: help.id, selected: true }, 'carol')
  const summaries = [f.call('help.list', {}, 'carol').items[0], f.call('myContent.list', { contentType: 'help' }).items[0],
    f.call('user.listPublicContent', { userId: f.users.alice.id }, 'carol').items[0], f.call('favorite.list', {}, 'carol').items[0].content]
  for (const summary of summaries) {
    assert.equal(summary.helpProgress, 'resolved')
    for (const key of ['application', 'applications', 'pendingCount', 'ownerConfirmedAt', 'helperConfirmedAt', 'pearls', 'reward']) assert.equal(summary[key], undefined)
  }
  const other = f.create({ title: '尚未解决的另外一件事' }), selected = f.apply(other)
  f.act('selectHelper', other, selected); f.act('confirmCompletion', other, selected)
  f.act('cancelCooperation', other, selected, 'bob')
  assert.equal(f.call('help.get', { id: other.id }).helpProgress, 'waiting')
  f.call('help.complete', { id: other.id })
  assert.equal(f.call('help.get', { id: other.id }).helpProgress, 'resolved')
  assert.equal(getHelpProgress({ type: 'help', status: 'closed' }), 'closed')
})

test('我的互助仅本人，待办随选人及各自确认变化，已确认等待对方不重复列出', (t) => {
  const f = fixture(t), help = f.create()
  assert.deepEqual(f.mine().items, [])
  assert.equal(f.mine('posted').items[0].role, 'owner')
  const application = f.apply(help)
  let owner = f.mine().items[0]
  assert.equal(owner.helpId, help.id); assert.equal(owner.pendingCount, 1); assert.equal(owner.actionLabel, '选择帮助者')
  assert.equal(owner.application, null)
  assert.deepEqual(f.mine('todo', 'bob').items, [])
  const waiting = f.mine('applied', 'bob').items[0]
  assert.equal(waiting.application.id, application.id); assert.equal(waiting.role, 'helper'); assert.equal(waiting.pendingCount, undefined)
  assert.deepEqual(f.mine('applied', 'carol').items, []); assert.deepEqual(f.mine('posted', 'bob').items, [])
  f.act('selectHelper', help, application)
  assert.equal(f.mine().items[0].actionLabel, '确认已解决')
  assert.equal(f.mine('todo', 'bob').items[0].actionLabel, '确认已解决')
  f.act('confirmCompletion', help, application)
  assert.deepEqual(f.mine().items, [])
  assert.equal(f.mine('todo', 'bob').items.length, 1)
  assert.equal(f.mine('posted').items[0].progress, 'awaiting_confirmation')
  f.act('confirmCompletion', help, application, 'bob')
  assert.deepEqual(f.mine().items, []); assert.deepEqual(f.mine('todo', 'bob').items, [])
  assert.equal(f.mine('posted').items[0].progress, 'resolved')
  const second = f.create({ title: '另一项需要协助的事情' }), helperFirst = f.apply(second)
  f.act('selectHelper', second, helperFirst); f.act('confirmCompletion', second, helperFirst, 'bob')
  assert.equal(f.mine().items[0].helpId, second.id)
  assert.deepEqual(f.mine('todo', 'bob').items, [])
})

test('我的申请同帖按最新申请去重，撤回重申请同一时间也不回填旧确认', (t) => {
  const f = fixture(t), help = f.create(), first = f.apply(help)
  f.act('selectHelper', help, first); f.act('confirmCompletion', help, first, 'bob')
  f.act('cancelCooperation', help, first)
  assert.equal(f.mine('applied', 'bob').items[0].progress, 'closed')
  assert.deepEqual(f.mine('todo', 'bob').items, [])
  const second = f.apply(help)
  const items = f.mine('applied', 'bob').items
  assert.equal(items.length, 1); assert.equal(items[0].application.id, second.id)
  assert.equal(items[0].application.helperConfirmedAt, null)
  assert.equal(f.mine().items[0].pendingCount, 1)
  f.act('selectHelper', help, second)
  assert.equal(f.mine('todo', 'bob').items[0].application.id, second.id)
})

test('私有、删除与作者注销只返回不可访问占位及本人申请状态，不附他人资料', (t) => {
  const f = fixture(t), help = f.create({ title: '不能泄露的标题', body: '不能泄露的正文', preferredTime: '不能泄露的时间' }), application = f.apply(help)
  f.call('help.update', { ...payload({ title: help.title, body: help.body }), id: help.id, visibility: 'private' })
  const hidden = f.mine('applied', 'bob').items[0]
  assert.equal(hidden.help, null); assert.equal(hidden.availability, 'unavailable'); assert.equal(hidden.progress, 'unavailable')
  assert.equal(hidden.actionRequired, false); assert.equal(hidden.application.id, application.id)
  for (const key of ['owner', 'helper', 'ownerId', 'ownerConfirmedAt', 'helperConfirmedAt']) assert.equal(hidden.application[key], undefined)
  for (const secret of [help.title, help.body, help.preferredTime, f.users.alice.id, 'nickname', 'images']) assert.equal(JSON.stringify(hidden).includes(secret), false)
  assert.equal(f.mine('posted').items[0].help.title, help.title)
  assert.deepEqual(f.mine('todo', 'bob').items, []); assert.deepEqual(f.mine().items, [])
  const vanished = f.create({ title: '将被删除的求助' })
  const ownApplication = f.apply(vanished)
  f.store.database.prepare('DELETE FROM c_records WHERE collection = ? AND id = ?').run('campus.help', vanished.id)
  const missing = f.mine('applied', 'bob').items.find((item) => item.helpId === vanished.id)
  assert.equal(missing.help, null); assert.equal(missing.application.id, ownApplication.id)
  f.removeAccount('alice')
  const deleted = f.mine('applied', 'bob').items.find((item) => item.helpId === help.id)
  assert.equal(deleted.help, null); assert.equal(deleted.application.status, 'cancelled')
  assert.equal(deleted.application.owner, undefined)
})

test('过滤和去重后分页，游标绑定账号与范围且签名防篡改，新记录不重复已读项', (t) => {
  const f = fixture(t), expected = []
  for (let i = 0; i < 3; i++) {
    f.advance(); const help = f.create({ title: `需要协助的事项${i}` }); f.apply(help); expected.push(help.id)
  }
  f.advance(); f.create({ title: '没有申请，不属于待办' })
  const first = f.mine('todo', 'alice', { pageSize: 1 })
  assert.equal(first.items.length, 1); assert.ok(first.nextCursor)
  f.advance(); const fresh = f.create({ title: '分页期间新增的求助' }); f.apply(fresh)
  const second = f.mine('todo', 'alice', { pageSize: 2, cursor: first.nextCursor })
  assert.deepEqual(new Set([...first.items, ...second.items].map((item) => item.helpId)), new Set(expected))
  assert.equal(second.nextCursor, null)
  rejected(() => f.mine('posted', 'alice', { cursor: first.nextCursor }), 'INVALID_ARGUMENT')
  rejected(() => f.mine('todo', 'bob', { cursor: first.nextCursor }), 'INVALID_ARGUMENT')
  rejected(() => f.mine('todo', 'alice', { cursor: first.nextCursor + 'x' }), 'INVALID_ARGUMENT')
  for (const extra of [{ ownerId: f.users.alice.id }, { helperId: f.users.bob.id }, { userId: f.users.carol.id }])
    rejected(() => f.mine('todo', 'bob', extra), 'INVALID_ARGUMENT')
  for (const pageSize of [0, 51, 1.2, '20']) rejected(() => f.mine('posted', 'alice', { pageSize }), 'INVALID_ARGUMENT')
  for (const scope of ['', null, 'all']) rejected(() => f.mine(scope), 'INVALID_ARGUMENT')
  rejected(() => f.service.invoke('help.listMine', {}), 'UNAUTHENTICATED')
})

test('旧帖子读取不补发奖励，说明与私有分页在重启后保留且不影响其他内容', (t) => {
  const f = fixture(t)
  f.store.insert('campus.help', { id: 'legacy-help', type: 'help', ownerId: f.users.alice.id, title: '旧的历史求助',
    body: '', category: '摄影', location: '', images: [], visibility: 'public', status: 'open', createdAt: '2026-10-01T00:00:00.000Z' })
  const before = f.store.query('campus.rewardEvents', '1', [], 'seq DESC', -1).length
  const legacy = f.call('help.get', { id: 'legacy-help' })
  for (const key of Object.keys(defaults)) assert.equal(legacy[key], defaults[key])
  assert.equal(legacy.helpProgress, 'waiting')
  const help = f.create({ estimatedMinutes: 20, meetingMode: 'offline' }), application = f.apply(help)
  f.act('selectHelper', help, application)
  f.reopen()
  assert.equal(f.call('help.get', { id: help.id }).estimatedMinutes, 20)
  assert.equal(f.mine('todo', 'bob').items[0].application.id, application.id)
  f.call('help.get', { id: 'legacy-help' }); f.mine('posted')
  assert.equal(f.store.query('campus.rewardEvents', '1', [], 'seq DESC', -1).length, before + 1)
  f.store.insert('campus.market', { id: 'ordinary-market', type: 'market', ownerId: f.users.alice.id, title: '二手教材',
    body: '', status: 'active', visibility: 'public', createdAt: '2026-10-01T00:00:00.000Z' })
  assert.equal(f.call('market.get', { id: 'ordinary-market' }).helpProgress, undefined)
})

test('原帖作者失效或不存在时申请仅保留本人占位，不泄露原帖或他人资料', t => {
  for (const missing of [false, true]) {
    const f = fixture(t), help = f.create({ title: '不会公开的旧摄影需求', body: '旧内容里的说明' })
    const application = f.apply(help)
    if (missing) f.store.database.prepare('DELETE FROM c_records WHERE collection = ? AND id = ?').run('campus.users', f.users.alice.id)
    else f.store.update('campus.users', { ...f.store.get('campus.users', f.users.alice.id), disabled: true })
    const item = f.mine('applied', 'bob').items[0]
    assert.equal(item.help, null); assert.equal(item.availability, 'unavailable'); assert.equal(item.application.id, application.id)
    for (const key of ['ownerId', 'owner', 'helper', 'ownerConfirmedAt', 'helperConfirmedAt']) assert.equal(item.application[key], undefined)
    assert.equal(JSON.stringify(item).includes('不会公开的旧摄影需求'), false)
    assert.equal(f.mine('todo', 'bob').items.length, 0)
  }
})
