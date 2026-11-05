import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { openCStore } from '../backend/c/store.js'
import { createCService } from '../backend/c/service.js'
import { createPlanService } from '../backend/campus/plans.js'
import { createRewardsService } from '../backend/campus/rewards.js'
import { createPrivacyService } from '../backend/campus/privacy.js'

const APPLICATIONS = 'campus.helpApplications'
const EVENTS = 'campus.rewardEvents'
const rejected = (run, code) => assert.throws(run, (error) => error.code === code)
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-help-cooperation-'))
  const filename = join(directory, 'test.sqlite')
  let store, plans, rewards, privacy, c, now = Date.parse('2026-10-27T02:00:00.000Z')
  let clockReads = 0, failNotify = false, failAward = false
  const reopen = () => {
    store?.close(); store = openCStore(filename)
    for (const id of ['alice', 'bob', 'carol', 'dora']) if (!store.get('campus.users', id))
      store.insert('campus.users', { id, nickname: id, campusId: 'campus', skillTags: ['摄影'], disabled: false })
    const accounts = {
      getUser: (id) => store.get('campus.users', id),
      publicUser: (id) => {
        const value = store.get('campus.users', id)
        return value ? { id, nickname: value.nickname } : null
      },
      verifyPassword: (principal, password) => {
        const user = store.get('campus.users', principal.userId)
        if (password !== 'test-password' || !user || user.disabled) throw Object.assign(new Error('invalid account'), { code: 'UNAUTHENTICATED' })
        return user
      }
    }
    const content = { summarize: (value) => ({ ...value, owner: accounts.publicUser(value.ownerId) }) }
    privacy = createPrivacyService({ store, accounts, uploadsDir: join(directory, 'uploads') })
    c = createCService({ store, getUser: accounts.getUser, getExternalContent: (type, id) => store.get(`campus.${type}`, id),
      assertCanContact: privacy.assertCanContact, now: () => new Date(now).toISOString(),
      canContactHelpApplicant: ({ help, ownerId, helperId }) => store.query(APPLICATIONS,
        "json_extract(data, '$.helpId') = ? AND json_extract(data, '$.ownerId') = ? AND json_extract(data, '$.helperId') = ?",
        [help.id, ownerId, helperId], 'seq DESC', -1).some(({ value }) => ['pending', 'accepted', 'completed'].includes(value.status)) })
    rewards = createRewardsService({ store, accounts, now: () => now })
    plans = createPlanService({ store, accounts, content, now: () => { clockReads++; return now },
      assertCanContact: privacy.assertCanContact,
      awardContribution: (event) => {
        const result = rewards.awardInTransaction(event)
        if (failAward) throw Object.assign(new Error('reward write failed'), { code: 'SERVICE_UNAVAILABLE' })
        return result
      },
      notify: (event) => {
        const result = c.notifyInTransaction(event)
        if (failNotify) throw Object.assign(new Error('notification write failed'), { code: 'SERVICE_UNAVAILABLE' })
        return result
      }
    })
  }
  reopen()
  t.after(() => {
    store.close()
    const target = realpathSync(directory), root = realpathSync(tmpdir())
    assert.equal(dirname(target), root)
    assert.ok(basename(target).startsWith('campus-help-cooperation-'))
    rmSync(target, { recursive: true, force: true })
  })
  const call = (method, params = {}, userId = 'alice') => plans.invoke(method, params, { userId })
  return {
    call, reopen, filename,
    chat: (method, params = {}, userId = 'alice') => c.invoke(method, params, { userId }),
    create: (title = '请帮忙拍毕业照', userId = 'alice', extra = {}) => call('help.create', {
      title, body: '图书馆门口，需要摄影协助', category: '摄影', location: '图书馆', images: [], ...extra
    }, userId),
    state: (userId = 'alice') => rewards.invoke('rewards.getState', {}, { userId }),
    block: (a, b) => privacy.invoke('user.block', { userId: b }, { userId: a }),
    deleteAccount: (userId) => privacy.invoke('auth.deleteAccount', { password: 'test-password', confirmation: '注销账号' }, { userId }),
    notifications: () => store.query('notifications', '1', [], 'seq DESC', -1).map(({ value }) => value),
    setNow: (value) => { now = value },
    get store() { return store },
    get clockReads() { return clockReads },
    set failNotify(value) { failNotify = value },
    set failAward(value) { failAward = value }
  }
}
const apply = (f, help, helperId = 'bob', key = 'apply') => f.call('help.apply', { helpId: help.id, idempotencyKey: key }, helperId)
const operation = (f, action, help, application, userId, key = action) => f.call(`help.${action}`, {
  helpId: help.id, applicationId: application.id, idempotencyKey: key
}, userId)
const selected = (f, help, helperId = 'bob') => {
  const { application } = apply(f, help, helperId, `apply:${help.id}`)
  return operation(f, 'selectHelper', help, application, help.ownerId, `select:${help.id}`).application
}
const finish = (f, help, helperId = 'bob') => {
  const application = selected(f, help, helperId)
  operation(f, 'confirmCompletion', help, application, help.ownerId, `owner:${help.id}`)
  return operation(f, 'confirmCompletion', help, application, helperId, `helper:${help.id}`)
}

test('互助申请检查身份、幂等编号和真实申请，列表仅作者或申请本人可见', (t) => {
  const f = fixture(t), help = f.create()
  rejected(() => apply(f, help, 'alice'), 'INVALID_ARGUMENT')
  rejected(() => f.call('help.apply', { helpId: help.id }, 'bob'), 'INVALID_ARGUMENT')
  rejected(() => apply(f, help, 'unknown'), 'UNAUTHENTICATED')
  const request = { helpId: help.id, idempotencyKey: 'same-application' }
  const bob = f.call('help.apply', request, 'bob')
  assert.deepEqual(f.call('help.apply', request, 'bob'), bob)
  assert.equal(apply(f, help, 'bob', 'fresh-key').application.id, bob.application.id)
  rejected(() => f.call('help.apply', { ...request, helpId: 'changed' }, 'bob'), 'CONFLICT')
  const carol = apply(f, help, 'carol').application
  rejected(() => operation(f, 'selectHelper', help, bob.application, 'carol'), 'FORBIDDEN')
  rejected(() => operation(f, 'selectHelper', help, { id: 'invented' }, 'alice', 'invented'), 'NOT_FOUND')
  const first = f.call('help.listApplications', { helpId: help.id, pageSize: 1 })
  assert.equal(first.items[0].id, carol.id); assert.ok(first.nextCursor)
  const second = f.call('help.listApplications', { helpId: help.id, pageSize: 1, cursor: first.nextCursor })
  assert.equal(second.items[0].id, bob.application.id)
  rejected(() => f.call('help.listApplications', { helpId: help.id, pageSize: 1, cursor: first.nextCursor }, 'bob'), 'INVALID_ARGUMENT')
  assert.deepEqual(f.call('help.listApplications', { helpId: help.id }, 'bob').items.map((value) => value.id), [bob.application.id])
  assert.deepEqual(f.call('help.listApplications', { helpId: help.id }, 'dora').items, [])
  assert.equal(first.items[0].helper.nickname, 'carol')
  assert.equal(f.notifications().length, 2)
  assert.equal(f.store.query(APPLICATIONS).length, 2)
  const privateHelp = f.create('私有摄影求助', 'alice', { visibility: 'private' })
  rejected(() => apply(f, privateHelp, 'bob', 'private'), 'CONFLICT')
})

for (const first of ['alice', 'bob']) test(`双方确认任意顺序且第一次无奖（先${first}），重复确认不重发`, (t) => {
  const f = fixture(t), help = f.create(), application = selected(f, help)
  const before = f.clockReads
  const firstResult = operation(f, 'confirmCompletion', help, application, first, 'first')
  assert.equal(f.clockReads - before, 1)
  assert.equal(firstResult.application.status, 'accepted'); assert.equal(firstResult.reward, undefined)
  assert.equal(f.state('bob').pearls, 0)
  assert.equal(f.store.query(EVENTS).filter(({ value }) => value.kind !== 'publish').length, 0)
  const second = first === 'alice' ? 'bob' : 'alice'
  const result = operation(f, 'confirmCompletion', help, application, second, 'second')
  assert.equal(result.help.status, 'completed'); assert.equal(result.application.status, 'completed')
  assert.equal(result.reward.delta, second === 'alice' ? 5 : 15)
  assert.equal(f.state().pearls, 10); assert.equal(f.state('bob').pearls, 15)
  assert.equal(f.state().daily.helpCompletion.awarded, 1)
  const noteCount = f.notifications().length
  assert.deepEqual(operation(f, 'confirmCompletion', help, application, second, 'second'), result)
  const oldActorReward = operation(f, 'confirmCompletion', help, application, first, 'after-completed').reward
  assert.equal(oldActorReward.delta, first === 'alice' ? 5 : 15)
  assert.equal(f.notifications().length, noteCount)
  assert.equal(f.store.query(EVENTS).filter(({ value }) => value.kind !== 'publish').length, 2)
  const publicHelp = f.call('help.get', { id: help.id }, 'carol')
  assert.equal(publicHelp.selectedApplicationId, application.id)
  for (const privateKey of ['reward', 'applications', 'ownerConfirmedAt', 'helperConfirmedAt', 'pearls'])
    assert.equal(publicHelp[privateKey], undefined)
  rejected(() => operation(f, 'cancelCooperation', help, application, 'alice'), 'CONFLICT')
})

test('选定后不能编辑或单方完成，取消清空确认且旧申请不能确认新协作', (t) => {
  const f = fixture(t), help = f.create(), bob = apply(f, help).application, carol = apply(f, help, 'carol').application
  operation(f, 'selectHelper', help, bob, 'alice')
  rejected(() => f.call('help.update', { ...help, body: '换一个题目' }), 'CONFLICT')
  rejected(() => f.call('help.update', { ...help, visibility: 'private' }), 'CONFLICT')
  rejected(() => f.call('help.complete', { id: help.id }), 'CONFLICT')
  rejected(() => operation(f, 'selectHelper', help, carol, 'alice', 'second-helper'), 'CONFLICT')
  rejected(() => operation(f, 'confirmCompletion', help, bob, 'carol'), 'FORBIDDEN')
  operation(f, 'confirmCompletion', help, bob, 'alice')
  f.block('alice', 'bob')
  const cancelled = operation(f, 'cancelCooperation', help, bob, 'bob')
  assert.equal(cancelled.application.status, 'cancelled')
  assert.equal(cancelled.application.ownerConfirmedAt, null)
  assert.equal(cancelled.help.selectedApplicationId, undefined)
  assert.equal(operation(f, 'cancelCooperation', help, bob, 'alice', 'cancel-again').application.status, 'cancelled')
  rejected(() => operation(f, 'confirmCompletion', help, bob, 'alice', 'late'), 'CONFLICT')
  operation(f, 'selectHelper', help, carol, 'alice', 'choose-carol')
  rejected(() => operation(f, 'confirmCompletion', help, bob, 'bob', 'late-bob'), 'CONFLICT')
  operation(f, 'confirmCompletion', help, carol, 'carol', 'carol-confirms')
  const result = operation(f, 'confirmCompletion', help, carol, 'alice', 'alice-confirms-carol')
  assert.equal(result.help.status, 'completed')
  assert.equal(f.state('bob').pearls, 0); assert.equal(f.state('carol').pearls, 15)
})

test('屏蔽禁止申请和选择但允许撤回，未选人的自行解决不发完成奖', (t) => {
  const f = fixture(t), help = f.create(), bob = apply(f, help).application
  f.block('bob', 'alice')
  rejected(() => operation(f, 'selectHelper', help, bob, 'alice'), 'FORBIDDEN')
  rejected(() => apply(f, f.create('另一条摄影需求'), 'bob', 'blocked'), 'FORBIDDEN')
  assert.equal(operation(f, 'cancelCooperation', help, bob, 'bob').application.status, 'cancelled')
  const extra = apply(f, help, 'carol').application
  assert.equal(f.call('help.complete', { id: help.id }).status, 'completed')
  assert.equal(f.store.get(APPLICATIONS, extra.id).status, 'cancelled')
  assert.equal(f.store.query(EVENTS).filter(({ value }) => value.kind !== 'publish').length, 0)
})

test('申请或最终确认通知失败回滚状态、双方余额、奖励账和幂等回执', (t) => {
  const f = fixture(t), help = f.create()
  f.failNotify = true
  rejected(() => apply(f, help), 'SERVICE_UNAVAILABLE')
  assert.equal(f.store.query(APPLICATIONS).length, 0); assert.equal(f.notifications().length, 0)
  assert.equal(f.store.receipt('bob', 'help.apply', 'apply'), undefined)
  f.failNotify = false
  const application = selected(f, help)
  operation(f, 'confirmCompletion', help, application, 'alice', 'owner')
  const previousNotifications = f.notifications().length
  f.failNotify = true
  rejected(() => operation(f, 'confirmCompletion', help, application, 'bob', 'helper'), 'SERVICE_UNAVAILABLE')
  assert.equal(f.store.get('campus.help', help.id).status, 'open')
  assert.equal(f.store.get(APPLICATIONS, application.id).helperConfirmedAt, null)
  assert.equal(f.state().pearls, 5); assert.equal(f.state('bob').pearls, 0)
  assert.equal(f.notifications().length, previousNotifications)
  assert.equal(f.store.query(EVENTS).filter(({ value }) => value.kind !== 'publish').length, 0)
  assert.equal(f.store.receipt('bob', 'help.confirmCompletion', 'helper'), undefined)
  f.failNotify = false
  assert.equal(operation(f, 'confirmCompletion', help, application, 'bob', 'helper').reward.delta, 15)
  assert.equal(f.state().pearls, 10); assert.equal(f.state('bob').pearls, 15)
})

test('发布奖励与内容原子提交、可选幂等保持兼容，私有发布和编辑不发奖', (t) => {
  const f = fixture(t)
  f.failAward = true
  rejected(() => f.create('发布事务回滚', 'alice', { idempotencyKey: 'publish-fails' }), 'SERVICE_UNAVAILABLE')
  assert.equal(f.store.query('campus.help').length, 0)
  assert.equal(f.store.query(EVENTS).length, 0); assert.equal(f.state().pearls, 0)
  assert.equal(f.store.receipt('alice', 'help.create', 'publish-fails'), undefined)
  f.failAward = false
  const help = f.create('幂等公开求助', 'alice', { idempotencyKey: 'publish-fails' })
  assert.equal(help.reward.delta, 5)
  assert.deepEqual(f.create('幂等公开求助', 'alice', { idempotencyKey: 'publish-fails' }), help)
  assert.equal(f.store.get('campus.help', help.id).reward, undefined)
  rejected(() => f.create('不同参数', 'alice', { idempotencyKey: 'publish-fails' }), 'CONFLICT')
  assert.equal(f.create('旧客户端不带编号').reward.delta, 5)
  const privateHelp = f.create('私有求助', 'alice', { visibility: 'private' })
  assert.equal(privateHelp.reward.delta, 0); assert.equal(privateHelp.reward.reason, 'not_public')
  f.call('help.update', { ...help, title: '编辑公开求助' })
  assert.equal(f.state().pearls, 10)
})

test('重启保留协作、双方奖励和回执，跨日重试不补领或重复发通知', (t) => {
  const f = fixture(t), help = f.create(), completed = finish(f, help)
  const notes = f.notifications().length
  f.reopen()
  assert.deepEqual(operation(f, 'confirmCompletion', help, completed.application, 'bob', `helper:${help.id}`), completed)
  f.setNow(Date.parse('2026-10-28T02:00:00.000Z'))
  const retried = operation(f, 'confirmCompletion', help, completed.application, 'bob', 'next-day')
  assert.deepEqual(retried.reward, completed.reward)
  assert.equal(f.state('bob').pearls, 15)
  assert.equal(f.state('bob').daily.helpCompletion.awarded, 0)
  assert.equal(f.notifications().length, notes)
})

test('完成奖励跨角色共享每天两次，一方满额仍完成，同行当天限额不补领', (t) => {
  const f = fixture(t)
  finish(f, f.create('甲求助一'), 'bob')
  finish(f, f.create('乙求助二', 'bob'), 'carol')
  const third = finish(f, f.create('丙求助三', 'dora'), 'bob')
  assert.equal(third.reward.delta, 0); assert.equal(third.reward.reason, 'daily_limit')
  assert.equal(third.help.status, 'completed')
  assert.equal(f.state('dora').recent.filter((value) => value.kind === 'help_author').at(0).delta, 5)
  assert.equal(f.state('bob').daily.helpCompletion.awarded, 2)
  const repeatedPair = finish(f, f.create('甲再次求助'), 'bob')
  assert.equal(repeatedPair.reward.reason, 'pair_limit')
  f.setNow(Date.parse('2026-10-28T02:00:00.000Z'))
  assert.equal(operation(f, 'confirmCompletion', repeatedPair.help, repeatedPair.application, 'bob', 'zero-next-day').reward.delta, 0)
})

test('注销撤销未完成协作并清理本人奖励，保留对方历史和可继续求助', (t) => {
  const f = fixture(t), completedHelp = f.create('已经解决的摄影求助'), completed = finish(f, completedHelp)
  const nextHelp = f.create('下次摄影求助'), nextApplication = selected(f, nextHelp)
  operation(f, 'confirmCompletion', nextHelp, nextApplication, 'alice')
  const aliceHistory = f.store.query(EVENTS, "json_extract(data, '$.userId') = ?", ['alice']).length
  f.deleteAccount('bob')
  assert.equal(f.store.get(APPLICATIONS, nextApplication.id).status, 'cancelled')
  assert.equal(f.store.get(APPLICATIONS, nextApplication.id).ownerConfirmedAt, null)
  assert.equal(f.store.get('campus.help', nextHelp.id).selectedApplicationId, undefined)
  assert.equal(f.store.get('campus.help', nextHelp.id).status, 'open')
  assert.equal(f.store.get(APPLICATIONS, completed.application.id).status, 'completed')
  assert.equal(f.store.query(EVENTS, "json_extract(data, '$.userId') = ?", ['bob']).length, 0)
  assert.equal(f.store.query(EVENTS, "json_extract(data, '$.userId') = ?", ['alice']).length, aliceHistory)
  assert.equal(f.store.get('campus.leisure', 'bob'), null)
  assert.equal(f.call('help.listApplications', { helpId: completedHelp.id }).items[0].helper.nickname, '已注销用户')
  rejected(() => operation(f, 'confirmCompletion', nextHelp, nextApplication, 'bob', 'deleted'), 'UNAUTHENTICATED')
  assert.equal(selected(f, nextHelp, 'carol').status, 'accepted')
})

test('独立SQLite连接竞争选人和双向同时确认，最多选一人且只结算一笔双方奖励', async (t) => {
  const f = fixture(t), help = f.create(), bob = apply(f, help).application, carol = apply(f, help, 'carol').application
  const workerCode = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { openCStore } = await import(workerData.storeUrl);
      const { createCService } = await import(workerData.cUrl);
      const { createPlanService } = await import(workerData.plansUrl);
      const { createRewardsService } = await import(workerData.rewardsUrl);
      const store = openCStore(workerData.filename);
      const accounts = { getUser: id => store.get('campus.users',id), publicUser: id => ({id,nickname:id}) };
      const content = { summarize: value => ({...value,owner:accounts.publicUser(value.ownerId)}) };
      const c = createCService({store,getUser:accounts.getUser,getExternalContent:(type,id)=>store.get('campus.'+type,id)});
      const rewards = createRewardsService({store,accounts,now:()=>workerData.now});
      const service = createPlanService({store,accounts,content,now:()=>workerData.now,notify:c.notifyInTransaction,awardContribution:rewards.awardInTransaction});
      parentPort.once('message', () => {
        let result;
        try { result={code:'OK',value:service.invoke(workerData.method,workerData.params,{userId:workerData.userId})}; }
        catch(error) { result={code:error.code||error.message}; }
        store.close();parentPort.postMessage(result);
      });
      parentPort.postMessage({ready:true});
    })().catch(error => {parentPort.postMessage({fatal:error.stack});process.exitCode=1;});
  `
  const race = async (requests) => {
    const workers = requests.map((request) => new Worker(workerCode, { eval: true, workerData: {
      ...request, filename: f.filename, now: Date.parse('2026-10-27T02:00:00.000Z'),
      storeUrl: new URL('../backend/c/store.js', import.meta.url).href,
      cUrl: new URL('../backend/c/service.js', import.meta.url).href,
      plansUrl: new URL('../backend/campus/plans.js', import.meta.url).href,
      rewardsUrl: new URL('../backend/campus/rewards.js', import.meta.url).href
    } }))
    t.after(() => Promise.all(workers.map((worker) => worker.terminate())))
    await Promise.all(workers.map((worker) => new Promise((resolve, reject) => {
      worker.once('error', reject)
      worker.once('message', (value) => value.ready ? resolve() : reject(new Error(value.fatal || JSON.stringify(value))))
    })))
    const results = workers.map((worker) => new Promise((resolve, reject) => {
      worker.once('message', resolve); worker.once('error', reject)
    }))
    workers.forEach((worker) => worker.postMessage('go'))
    return Promise.all(results)
  }
  const choices = await race([bob, carol].map((application) => ({ method: 'help.selectHelper', userId: 'alice',
    params: { helpId: help.id, applicationId: application.id, idempotencyKey: `race:${application.id}` } })))
  assert.deepEqual(choices.map((value) => value.code).sort(), ['CONFLICT', 'OK'])
  const application = f.store.query(APPLICATIONS).map(({ value }) => value).find((value) => value.status === 'accepted')
  assert.equal(f.store.query(APPLICATIONS).filter(({ value }) => value.status === 'accepted').length, 1)
  const confirmations = await race(['alice', application.helperId].map((userId) => ({ method: 'help.confirmCompletion', userId,
    params: { helpId: help.id, applicationId: application.id, idempotencyKey: `confirm-race:${userId}` } })))
  assert.ok(confirmations.every((value) => value.code === 'OK'))
  assert.equal(f.store.get('campus.help', help.id).status, 'completed')
  assert.equal(f.store.query(EVENTS).filter(({ value }) => value.kind !== 'publish').length, 2)
  assert.equal(f.state('alice').pearls, 10)
  assert.equal(f.state(application.helperId).pearls, 15)
})

test('求助作者仅可联系本帖有效申请者，双方方向恢复同一会话并保留其他内容权限', (t) => {
  const f = fixture(t), help = f.create(), application = apply(f, help).application
  const params = { contentType: 'help', contentId: help.id, peerUserId: 'bob' }
  const opened = f.chat('conversation.open', params)
  assert.deepEqual(opened.participantIds, ['alice', 'bob'])
  assert.equal(opened.peer.id, 'bob')
  const reverse = f.chat('conversation.open', { ...params, peerUserId: 'alice' }, 'bob')
  assert.equal(reverse.id, opened.id)
  assert.equal(f.chat('message.send', { conversationId: opened.id, body: '谢谢你愿意帮忙', idempotencyKey: 'owner-contact' }).senderId, 'alice')
  rejected(() => f.chat('message.list', { conversationId: opened.id }, 'carol'), 'FORBIDDEN')
  rejected(() => f.chat('conversation.open', { ...params, peerUserId: 'dora' }), 'FORBIDDEN')
  rejected(() => f.chat('conversation.open', { ...params, peerUserId: 'alice' }), 'INVALID_ARGUMENT')
  rejected(() => f.chat('conversation.open', params, 'carol'), 'INVALID_ARGUMENT')
  const anotherHelp = f.create('另外一条求助')
  apply(f, anotherHelp, 'dora', 'other-help-application')
  rejected(() => f.chat('conversation.open', { ...params, peerUserId: 'dora' }), 'FORBIDDEN')
  const pending = apply(f, help, 'carol').application
  operation(f, 'cancelCooperation', help, pending, 'carol', 'withdraw-contact')
  rejected(() => f.chat('conversation.open', { ...params, peerUserId: 'carol' }), 'FORBIDDEN')
  operation(f, 'selectHelper', help, application, 'alice')
  assert.equal(f.chat('conversation.open', params).id, opened.id)
  operation(f, 'confirmCompletion', help, application, 'alice')
  operation(f, 'confirmCompletion', help, application, 'bob')
  assert.equal(f.chat('conversation.open', params).id, opened.id)
  f.store.insert('campus.market', { id: 'ordinary-market', type: 'market', ownerId: 'alice', title: '普通二手商品', visibility: 'public' })
  rejected(() => f.chat('conversation.open', { contentType: 'market', contentId: 'ordinary-market', peerUserId: 'bob' }), 'INVALID_ARGUMENT')
})

test('申请人会话权限hook默认拒绝且须同步，屏蔽、注销和私有状态仍阻止建立联系', (t) => {
  const f = fixture(t), help = f.create()
  apply(f, help)
  const params = { contentType: 'help', contentId: help.id, peerUserId: 'bob' }
  const bareOptions = { store: f.store, getUser: (id) => f.store.get('campus.users', id),
    getExternalContent: (type, id) => f.store.get(`campus.${type}`, id) }
  const standalone = createCService(bareOptions)
  rejected(() => standalone.invoke('conversation.open', params, { userId: 'alice' }), 'FORBIDDEN')
  const asynchronous = createCService({ ...bareOptions, canContactHelpApplicant: async () => true })
  rejected(() => asynchronous.invoke('conversation.open', params, { userId: 'alice' }), 'SERVICE_UNAVAILABLE')
  f.block('bob', 'alice')
  rejected(() => f.chat('conversation.open', params), 'FORBIDDEN')
  const other = f.create('等待协助的摄影需求', 'carol')
  apply(f, other, 'dora', 'to-be-deleted')
  f.deleteAccount('dora')
  rejected(() => f.chat('conversation.open', { contentType: 'help', contentId: other.id, peerUserId: 'dora' }, 'carol'), 'FORBIDDEN')
  const activeApplication = apply(f, other, 'bob', 'bob-to-carol').application
  f.store.update('campus.users', { ...f.store.get('campus.users', 'bob'), disabled: true })
  rejected(() => f.chat('conversation.open', { contentType: 'help', contentId: other.id, peerUserId: activeApplication.helperId }, 'carol'), 'NOT_FOUND')
  f.store.update('campus.help', { ...f.store.get('campus.help', other.id), visibility: 'private' })
  rejected(() => f.chat('conversation.open', { contentType: 'help', contentId: other.id, peerUserId: 'bob' }, 'carol'), 'FORBIDDEN')
  assert.equal(f.store.query('conversations').length, 0)
})
