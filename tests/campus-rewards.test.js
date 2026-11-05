import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'
import { createRewardsService } from '../backend/campus/rewards.js'
import { contributionPairKey } from '../src/domain/rewards/contribution.js'

const photo = readFileSync(new URL('../src/static/tabs/plaza.png', import.meta.url))
const DAY = 86400000
const start = Date.parse('2026-10-27T15:59:59.000Z')
const sale = changes => ({ title: '校园教材闲置', body: '在图书馆交接', marketType: 'sell', category: '教材',
  priceCents: 2000, condition: '九成新', imageIds: [], ...changes })
const help = changes => ({ title: '校园摄影求助', body: '希望帮忙拍一张证件照片', category: '摄影', images: [], ...changes })

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-rewards-')), filename = join(directory, 'test.sqlite')
  let store, service, rewards, time = start
  const reopen = () => {
    store?.close()
    store = openCStore(filename)
    service = createCampusService({ store, uploadsDir: join(directory, 'uploads'), uploadOrigin: 'https://files.example', now: () => time })
    rewards = createRewardsService({ store, accounts: service.accounts, now: () => time })
  }
  reopen()
  const users = ['alice', 'bob', 'carol', 'dora'].map(name => service.invoke('auth.register', {
    studentId: `rewards-${name}`, password: 'Test-only-campus-password-123', nickname: name
  }).user)
  t.after(() => {
    store.close()
    const target = realpathSync(directory)
    assert.equal(dirname(target), realpathSync(tmpdir()))
    assert.ok(basename(target).startsWith('campus-rewards-'))
    rmSync(target, { recursive: true, force: true })
  })
  return { users, reopen, setTime: value => { time = value },
    call: (method, params = {}, userId = users[0].id) => service.invoke(method, params, { userId }),
    award: event => store.transaction(() => rewards.awardInTransaction(event)),
    upload: userId => {
      const image = service.accounts.receiveUpload({ userId, usage: 'content', buffer: photo, mime: 'image/png' })
      service.invoke('upload.confirm', { imageId: image.imageId }, { userId })
      return image.url
    },
    filename, directory, get store() { return store }, get rewards() { return rewards }
  }
}

test('真实跨模块发布共享限额，幂等创建、七天同文及私有奖励不会泄漏到公开内容', t => {
  const f = fixture(t), [alice, bob] = f.users
  const p = sale({ idempotencyKey: 'first-sale' })
  const first = f.call('market.create', p)
  assert.equal(first.reward.delta, 5)
  assert.deepEqual(f.call('market.create', p), first)
  assert.throws(() => f.call('market.create', { ...p, title: '改变幂等参数' }), { code: 'CONFLICT' })
  const request = f.call('market.create', { title: '求购校园词典', body: '希望八成新', marketType: 'buy', budgetCents: 5000, keywords: '词典' })
  assert.equal(request.reward.delta, 5)
  assert.equal(f.call('help.create', help({ idempotencyKey: 'help-one' })).reward.delta, 5)
  assert.equal(f.call('plan.create', { title: '一起校园散步', body: '傍晚看落日', category: '散步', images: [], capacity: 2,
    startAt: new Date(start + DAY).toISOString(), endAt: new Date(start + DAY + 3600000).toISOString() }).reward.reason, 'daily_limit')
  const duplicate = f.call('help.create', help({ title: p.title, body: p.body }))
  assert.equal(duplicate.reward.reason, 'duplicate_text')
  assert.equal(f.call('market.get', { id: first.id }, bob.id).reward, undefined)
  assert.equal(f.store.get('campus.market', first.id).reward, undefined)
  const state = f.call('rewards.getState')
  assert.equal(state.pearls, 15)
  assert.deepEqual(state.daily.publish, { awarded: 3, limit: 3 })
  assert.equal(state.recent.some(entry => 'textKey' in entry), false)
  assert.equal(f.call('rewards.getState', {}, bob.id).pearls, 0)
  assert.throws(() => f.call('rewards.getState', { userId: bob.id }), { code: 'INVALID_ARGUMENT' })
  const hidden = f.call('market.create', sale({ title: '私有教材记录', visibility: 'private' }))
  assert.equal(hidden.reward.reason, 'not_public')
})

test('失物发布可选幂等，旧客户端仍可发布，跨日重放不重复建帖或补奖', t => {
  const f = fixture(t), [alice] = f.users, url = f.upload(alice.id)
  const p = { title: '拾到校园水杯', body: '操场边拾到，请核对特征', category: 'misc', lostKind: 'found', images: [url], idempotencyKey: 'lost-once' }
  const first = f.call('lostFound.create', p)
  assert.equal(first.reward.delta, 5)
  assert.deepEqual(f.call('lostFound.create', p), first)
  f.setTime(start + DAY)
  f.reopen()
  assert.deepEqual(f.call('lostFound.create', p), first)
  assert.equal(f.store.query('lost', '1', [], 'seq ASC', -1).length, 1)
  assert.equal(f.call('rewards.getState').pearls, 5)
  assert.equal(f.call('rewards.getState').daily.publish.awarded, 0)
  assert.equal(f.call('lostFound.create', { ...p, idempotencyKey: undefined }).reward.reason, 'duplicate_text')
})

test('双角色额度与双方每日一次独立计算，零奖事件跨日仍保持零且重启保留钱包', t => {
  const f = fixture(t), [alice, bob, carol, dora] = f.users
  const make = (sourceId, userId, peerId, kind) => ({ userId, sourceId, sourceType: 'help', kind, pairKey: contributionPairKey(userId, peerId) })
  const first = make('work-a', alice.id, bob.id, 'help_helper')
  assert.equal(f.award(first).delta, 15)
  assert.equal(f.award(first).delta, 15)
  assert.equal(f.award(make('work-b', alice.id, carol.id, 'help_author')).delta, 5)
  const zero = make('work-c', alice.id, dora.id, 'help_helper')
  assert.equal(f.award(zero).reason, 'daily_limit')
  assert.equal(f.award(make('work-c', dora.id, alice.id, 'help_author')).delta, 5)
  assert.equal(f.award(make('other-work', dora.id, alice.id, 'help_helper')).reason, 'pair_limit')
  assert.equal(f.call('wardrobe.getState').pearls, 20)
  assert.deepEqual(f.call('rewards.getState').daily.helpCompletion, { awarded: 2, limit: 2 })
  f.setTime(start + DAY)
  f.reopen()
  assert.equal(f.award(zero).delta, 0)
  assert.equal(f.call('wardrobe.getState').pearls, 20)
  assert.equal(f.award(make('new-day', alice.id, bob.id, 'help_helper')).delta, 15)
})

test('业务、奖励事件、钱包与发布回执在同一事务失败全部回滚，重试仍能正常发奖', t => {
  const f = fixture(t)
  f.store.database.exec(`CREATE TEMP TRIGGER reject_reward_wallet BEFORE INSERT ON c_records
    WHEN NEW.collection = 'campus.leisure' BEGIN SELECT RAISE(ABORT, 'test wallet failure'); END`)
  const p = sale({ idempotencyKey: 'rollback-sale' })
  assert.throws(() => f.call('market.create', p), /test wallet failure/)
  assert.equal(f.store.query('campus.market', '1', [], 'seq ASC', -1).length, 0)
  assert.equal(f.store.query('campus.rewardEvents', '1', [], 'seq ASC', -1).length, 0)
  assert.equal(f.store.receipt(f.users[0].id, 'market.create', p.idempotencyKey), undefined)
  f.store.database.exec('DROP TRIGGER reject_reward_wallet')
  assert.equal(f.call('market.create', p).reward.delta, 5)
  assert.equal(f.call('wardrobe.getState').pearls, 5)
})

test('贡献珍珠直接兑换任何衣柜目录，原通关顺序、身份及客户端发奖边界保留', t => {
  const f = fixture(t), [alice, bob, carol] = f.users
  f.award({ userId: alice.id, sourceId: 'a', kind: 'help_helper', sourceType: 'help', pairKey: contributionPairKey(alice.id, bob.id) })
  f.award({ userId: alice.id, sourceId: 'b', kind: 'help_helper', sourceType: 'help', pairKey: contributionPairKey(alice.id, carol.id) })
  for (let day = 1; day <= 2; day++) {
    f.setTime(start + day * DAY)
    for (let i = 0; i < 3; i++) f.call('market.create', sale({ title: `第${day}天第${i}份校园教材` }))
  }
  const state = f.call('wardrobe.getState')
  assert.equal(state.pearls, 60)
  assert.ok(state.catalog.every(item => item.unlockLevel === 0))
  const redeemed = f.call('wardrobe.redeem', { itemId: 'acorn-bob' })
  assert.equal(redeemed.pearls, 0)
  assert.deepEqual(redeemed.clearedLevels, [])
  assert.equal(f.call('wardrobe.redeem', { itemId: 'acorn-bob' }).pearls, 0)
  assert.throws(() => f.call('dive.start', { levelId: 2 }), { code: 'FORBIDDEN' })
  assert.throws(() => f.rewards.invoke('rewards.award', { delta: 999 }, { userId: alice.id }), { code: 'NOT_IMPLEMENTED' })
  assert.throws(() => f.rewards.invoke('rewards.getState', {}, {}), { code: 'UNAUTHENTICATED' })
})

test('两个独立SQLite连接竞争跨模块最后一次发布奖，只发一次且不丢余额', async t => {
  const f = fixture(t), [alice] = f.users
  f.call('market.create', sale({ title: '校园教材第一本' }))
  f.call('help.create', help({ title: '校园摄影第一次求助' }))
  const code = `const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { openCStore } = await import(workerData.storeUrl);
      const { createCampusService } = await import(workerData.serviceUrl);
      const store = openCStore(workerData.filename);
      const service = createCampusService({ store, uploadsDir: workerData.uploadsDir,
        uploadOrigin: 'https://files.example', now: () => workerData.now });
      parentPort.once('message', () => {
        try { const result = service.invoke(workerData.method, workerData.params, { userId: workerData.userId });
          store.close(); parentPort.postMessage({ result }); }
        catch (error) { store.close(); parentPort.postMessage({ error: error.message }); }
      });
      parentPort.postMessage({ ready: true });
    })().catch(error => { throw error; });`
  const jobs = [
    ['market.create', sale({ title: '竞争最后额度的教材' })],
    ['help.create', help({ title: '竞争最后额度的摄影求助' })]
  ].map(([method, params]) => {
    let resolveReady, resolveResult, rejectReady, rejectResult
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
    const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject })
    const worker = new Worker(code, { eval: true, workerData: { filename: f.filename,
      uploadsDir: join(f.directory, 'uploads'), now: start, userId: alice.id, method, params,
      storeUrl: new URL('../backend/c/store.js', import.meta.url).href,
      serviceUrl: new URL('../backend/campus/service.js', import.meta.url).href } })
    worker.on('error', error => { rejectReady(error); rejectResult(error) })
    worker.on('message', message => {
      if (message.ready) resolveReady()
      else if (message.error) rejectResult(new Error(message.error))
      else resolveResult(message.result)
    })
    t.after(() => worker.terminate())
    return { worker, ready, result }
  })
  await Promise.all(jobs.map(job => job.ready))
  for (const job of jobs) job.worker.postMessage('go')
  const results = await Promise.all(jobs.map(job => job.result))
  assert.deepEqual(results.map(item => item.reward.delta).sort(), [0, 5])
  const state = f.call('rewards.getState')
  assert.equal(state.pearls, 15)
  assert.equal(state.daily.publish.awarded, 3)
  assert.equal(state.recent.length, 4)
})
