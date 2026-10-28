import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'
import { awardDemoContribution } from '../src/mock/rewards.js'

const alice = 'user_demo_a', bob = 'user_demo_b', carol = 'user_demo_c'
const today = Date.parse('2026-10-27T09:00:00+08:00')
const fail = (run, code) => assert.throws(run, error => error.code === code)
const payload = (title = '寻找摄影构图帮助', more = {}) => ({ title, body: '需要同学一起交流学习', category: '摄影', location: '校园', images: [], ...more })
function fixture() {
  const db = createSeed()
  return { db, run(method, params = {}, actor = alice, now = today) {
    db.currentUserId = actor
    return dispatch(db, method, params, { now })
  } }
}
function cooperate(f, help, helper = bob, key = help.id) {
  const application = f.run('help.apply', { helpId: help.id, idempotencyKey: `apply:${key}` }, helper).application
  f.run('help.selectHelper', { helpId: help.id, applicationId: application.id, idempotencyKey: `select:${key}` }, help.ownerId)
  return application
}
const completion = (f, help, app, actor, key, now = today) => f.run('help.confirmCompletion', {
  helpId: help.id, applicationId: app.id, idempotencyKey: key
}, actor, now)

test('演示公开发帖跨模块共享前三篇奖励；私有、重复同文、失败不阻止其他发布', () => {
  const f = fixture()
  const first = f.run('help.create', payload())
  assert.equal(first.reward.delta, 5)
  const duplicate = f.run('market.create', payload(first.title, { marketType: 'buy', budgetCents: 500, keywords: '相机' }))
  assert.equal(duplicate.reward.reason, 'duplicate_text')
  assert.equal(duplicate.reward.delta, 0)
  const privateItem = f.run('help.create', payload('仅本人记录的求助', { visibility: 'private' }))
  assert.equal(privateItem.visibility, 'private')
  assert.equal(privateItem.reward.reason, 'not_public')
  const lost = f.run('lostFound.create', payload('图书馆找寻校园卡', { lostKind: 'lost', category: 'card', images: ['demo://card'] }))
  assert.equal(lost.reward.delta, 5)
  const sell = f.run('market.create', payload('闲置台灯送给同学', { marketType: 'sell', priceCents: 1000, condition: '九成新' }))
  assert.equal(sell.reward.delta, 5)
  const extra = f.run('help.create', payload('帮忙讲解线性代数题'))
  assert.equal(extra.reward.reason, 'daily_limit')
  assert.equal(f.run('rewards.getState').pearls, 15)
  assert.deepEqual(f.run('rewards.getState').daily.publish, { awarded: 3, limit: 3 })
  const count = f.db.contents.help.length
  fail(() => f.run('help.create', payload('短', { title: '短' })), 'INVALID_ARGUMENT')
  assert.equal(f.db.contents.help.length, count)
  assert.equal(f.run('rewards.getState').pearls, 15)
  assert.equal(f.db.contents.help.find(item => item.id === first.id).reward, undefined)
  assert.equal(f.run('help.get', { id: first.id }).reward, undefined)
  assert.equal(f.run('rewards.getState', {}, bob).pearls, 0)
  fail(() => f.run('rewards.getState', { userId: alice }, bob), 'INVALID_ARGUMENT')
})

test('演示发帖操作回执防止网络重试重复内容和奖励，跨日回放仍返回原决定', () => {
  const f = fixture(), p = payload('希望有人一起修自行车', { idempotencyKey: 'post-one' })
  const first = f.run('help.create', p)
  const count = f.db.contents.help.length
  assert.deepEqual(f.run('help.create', p, alice, today + 86400000), first)
  assert.equal(f.db.contents.help.length, count)
  assert.equal(f.run('rewards.getState', {}, alice, today + 86400000).pearls, 5)
  fail(() => f.run('help.create', { ...p, title: '改成另一个发布' }), 'CONFLICT')
  assert.equal(f.db.contents.help.length, count)
  const changedKey = f.run('help.create', { ...p, idempotencyKey: 'post-another' })
  assert.equal(changedKey.reward.reason, 'duplicate_text')
  fail(() => f.run('help.create', { ...p, idempotencyKey: '' }), 'INVALID_ARGUMENT')
})

test('演示双方确认互助后分别奖励且私有申请不可被第三人读取，旧完成不能绕过', () => {
  const f = fixture(), help = f.run('help.create', payload())
  fail(() => f.run('help.apply', { helpId: help.id, idempotencyKey: 'self' }), 'INVALID_ARGUMENT')
  const app = cooperate(f, help)
  fail(() => f.run('help.complete', { id: help.id }), 'CONFLICT')
  fail(() => f.run('help.update', { ...payload(), id: help.id }), 'CONFLICT')
  fail(() => completion(f, help, app, carol, 'stranger'), 'FORBIDDEN')
  assert.equal(f.run('help.listApplications', { helpId: help.id }, carol).items.length, 0)
  const first = completion(f, help, app, alice, 'author-confirm')
  assert.equal(first.application.status, 'accepted')
  assert.equal(first.reward, undefined)
  assert.equal(f.run('rewards.getState', {}, bob).pearls, 0)
  const done = completion(f, help, app, bob, 'helper-confirm')
  assert.equal(done.application.status, 'completed')
  assert.equal(done.reward.delta, 15)
  assert.equal(f.run('rewards.getState').pearls, 10)
  assert.equal(f.run('rewards.getState', {}, bob).pearls, 15)
  const noticeCount = f.db.notifications.length
  const repeated = completion(f, help, app, alice, 'confirm-fresh-key', today + 86400000)
  assert.equal(repeated.reward.delta, 5)
  assert.equal(f.run('rewards.getState').pearls, 10)
  assert.equal(f.db.notifications.length, noticeCount)
  assert.equal(f.run('help.listApplications', { helpId: help.id }, bob).items[0].ownerConfirmedAt, first.application.ownerConfirmedAt)
})

test('演示取消协作可以重新选人，旧确认不沿用且取消、单方自行解决不发完成奖', () => {
  const f = fixture(), help = f.run('help.create', payload())
  const app = cooperate(f, help)
  completion(f, help, app, alice, 'author-before-cancel')
  const cancelled = f.run('help.cancelCooperation', { helpId: help.id, applicationId: app.id, idempotencyKey: 'cancel' }, bob)
  assert.equal(cancelled.application.status, 'cancelled')
  assert.equal(cancelled.application.ownerConfirmedAt, null)
  assert.equal(cancelled.help.selectedApplicationId, undefined)
  fail(() => completion(f, help, app, bob, 'stale-confirm'), 'CONFLICT')
  const replacement = cooperate(f, help, carol, 'replacement')
  assert.equal(replacement.ownerConfirmedAt, null)
  completion(f, help, replacement, carol, 'replacement-helper-confirm')
  assert.equal(f.run('rewards.getState', {}, carol).pearls, 0)
  completion(f, help, replacement, alice, 'replacement-author-confirm')
  assert.equal(f.run('rewards.getState', {}, carol).pearls, 15)
  assert.equal(f.run('rewards.getState', {}, bob).pearls, 0)
  const selfSolved = f.run('help.create', payload('我已经自行解决的新求助'))
  const before = f.run('rewards.getState').pearls
  assert.equal(f.run('help.complete', { id: selfSolved.id }).status, 'completed')
  assert.equal(f.run('rewards.getState').pearls, before)
})

test('演示同一双方每日只奖一次，跨角色完成共享两次额度且另一方不被连带阻止', () => {
  const f = fixture()
  const first = f.run('help.create', payload('第一项摄影需求'))
  const app1 = cooperate(f, first, bob)
  completion(f, first, app1, alice, 'first-a'); completion(f, first, app1, bob, 'first-b')
  const second = f.run('help.create', payload('第二项摄影需求'))
  const app2 = cooperate(f, second, bob)
  completion(f, second, app2, alice, 'second-a')
  assert.equal(completion(f, second, app2, bob, 'second-b').reward.reason, 'pair_limit')
  const third = f.run('help.create', payload('第三项设计需求'), carol)
  const app3 = cooperate(f, third, alice)
  completion(f, third, app3, carol, 'third-c'); completion(f, third, app3, alice, 'third-a')
  assert.equal(f.run('rewards.getState').daily.helpCompletion.awarded, 2)
  f.db.users.push({ id: 'dora', nickname: '小冬', campusId: 'demo-campus' })
  const fourth = f.run('help.create', payload('第四项英语需求'), 'dora')
  const app4 = cooperate(f, fourth, alice)
  completion(f, fourth, app4, 'dora', 'fourth-d')
  const limited = completion(f, fourth, app4, alice, 'fourth-a')
  assert.equal(limited.help.status, 'completed')
  assert.equal(limited.reward.reason, 'daily_limit')
  assert.equal(f.run('rewards.getState', {}, 'dora').daily.helpCompletion.awarded, 1)
})

test('演示奖励或通知失败时发帖、确认、双方余额和回执一起回滚', () => {
  const f = fixture()
  f.run('rewards.getState')
  f.db.wardrobes[alice].pearls = Number.MAX_SAFE_INTEGER
  const beforePublish = JSON.stringify(f.db)
  fail(() => f.run('help.create', payload('不能落入半成功的帖子', { idempotencyKey: 'overflow' })), 'CONFLICT')
  assert.equal(JSON.stringify(f.db), beforePublish)
  f.db.wardrobes[alice].pearls = 0
  const help = f.run('help.create', payload()), app = cooperate(f, help)
  completion(f, help, app, alice, 'first-confirm')
  f.run('rewards.getState', {}, bob)
  f.db.wardrobes[bob].pearls = Number.MAX_SAFE_INTEGER
  const beforeConfirm = JSON.stringify(f.db)
  fail(() => completion(f, help, app, bob, 'overflow-confirm'), 'CONFLICT')
  assert.equal(JSON.stringify(f.db), beforeConfirm)
  assert.equal(f.run('help.get', { id: help.id }).status, 'open')
  assert.equal(f.run('rewards.getState').pearls, 5)
  f.db.notifications = null
  f.db.currentUserId = carol
  const beforeNotice = JSON.stringify(f.db)
  assert.throws(() => f.run('help.apply', { helpId: help.id, idempotencyKey: 'notice-fails' }, carol))
  assert.equal(JSON.stringify(f.db), beforeNotice)
})

test('演示分页绑定当前身份及求助，不泄露申请；新申请不重复旧页', () => {
  const f = fixture(), help = f.run('help.create', payload())
  f.run('help.apply', { helpId: help.id, idempotencyKey: 'bob' }, bob)
  f.run('help.apply', { helpId: help.id, idempotencyKey: 'carol' }, carol)
  const first = f.run('help.listApplications', { helpId: help.id, pageSize: 1 })
  assert.ok(first.nextCursor)
  f.db.users.push({ id: 'dora', nickname: '小冬' })
  f.run('help.apply', { helpId: help.id, idempotencyKey: 'dora' }, 'dora')
  const next = f.run('help.listApplications', { helpId: help.id, cursor: first.nextCursor, pageSize: 1 })
  assert.notEqual(next.items[0].id, first.items[0].id)
  assert.equal(next.items[0].helperId, bob)
  fail(() => f.run('help.listApplications', { helpId: help.id, cursor: first.nextCursor }, bob), 'INVALID_ARGUMENT')
})

test('演示七天同文和北京时间跨日使用共享规则，零奖励事件不会隔天补发', () => {
  const f = fixture(), first = f.run('help.create', payload())
  const again = f.run('help.create', payload(), alice, today + 86400000)
  assert.equal(again.reward.delta, 0)
  const originalEvent = { userId: alice, kind: 'publish', sourceType: 'help', sourceId: again.id, title: again.title, body: again.body }
  assert.equal(awardDemoContribution(f.db, originalEvent, today + 9 * 86400000).delta, 0)
  const newPost = f.run('help.create', payload(), alice, today + 9 * 86400000)
  assert.equal(newPost.reward.delta, 5)
  assert.equal(first.reward.delta, 5)
  const beforeMidnight = Date.parse('2026-10-27T15:59:59Z')
  assert.equal(f.run('rewards.getState', {}, alice, beforeMidnight).dayKey, '2026-10-27')
  assert.equal(f.run('rewards.getState', {}, alice, beforeMidnight + 1000).dayKey, '2026-10-28')
})

test('演示求助作者只可联系本帖有效申请人，双方打开复用同一双人会话', () => {
  const f = fixture(), help = f.run('help.create', payload())
  const contact = (peerUserId, actor = alice, contentId = help.id, contentType = 'help') =>
    f.run('conversation.open', { contentType, contentId, peerUserId }, actor)
  fail(() => contact(bob), 'INVALID_ARGUMENT')
  fail(() => contact(alice), 'INVALID_ARGUMENT')
  const application = f.run('help.apply', { helpId: help.id, idempotencyKey: 'apply' }, bob).application
  const opened = contact(bob)
  assert.deepEqual(opened.participantIds, [alice, bob])
  assert.equal(contact(alice, bob).id, opened.id)
  assert.equal(f.db.conversations.length, 1)
  fail(() => contact(carol), 'INVALID_ARGUMENT')
  const another = f.run('help.create', payload('另一项互助请求'))
  fail(() => contact(bob, alice, another.id), 'INVALID_ARGUMENT')
  const sell = f.run('market.create', payload('闲置画架', { marketType: 'sell', condition: '九成新', priceCents: 1000 }))
  fail(() => contact(bob, alice, sell.id, 'market'), 'INVALID_ARGUMENT')
  assert.equal(contact(alice, bob, sell.id, 'market').contentId, sell.id)
  f.db.contents.help.find(item => item.id === help.id).visibility = 'private'
  fail(() => contact(bob), 'FORBIDDEN')
  fail(() => contact(alice, bob), 'FORBIDDEN')
  f.db.contents.help.find(item => item.id === help.id).visibility = 'public'
  f.run('help.cancelCooperation', { helpId: help.id, applicationId: application.id, idempotencyKey: 'withdraw' }, bob)
  fail(() => contact(bob), 'INVALID_ARGUMENT')
  assert.equal(f.run('conversation.get', { id: opened.id }).id, opened.id)
})

test('演示接受和完成的帮助申请允许作者联系，失效账号不建立新会话', () => {
  const f = fixture(), help = f.run('help.create', payload()), app = cooperate(f, help)
  const params = { contentType: 'help', contentId: help.id, peerUserId: bob }
  const acceptedChat = f.run('conversation.open', params)
  completion(f, help, app, alice, 'owner-done'); completion(f, help, app, bob, 'helper-done')
  assert.equal(f.run('conversation.open', params).id, acceptedChat.id)
  f.db.users.find(value => value.id === bob).disabled = true
  fail(() => f.run('conversation.open', params), 'NOT_FOUND')
  fail(() => f.run('conversation.open', { ...params, peerUserId: alice }, bob), 'UNAUTHENTICATED')
})
