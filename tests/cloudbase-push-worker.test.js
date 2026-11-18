import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'
import { exportSnapshot, hydrateStore } from '../backend/cloudbase/state.js'
import { createCloudPushWorker } from '../backend/cloudbase/push-worker.js'

const password = 'worker-test-password', clientId = 'worker-device-001'
const conflict = () => Object.assign(new Error('test version conflict'), { code: 'CLOUD_STATE_CONFLICT' })
const uncertain = () => Object.assign(new Error('test acknowledgement lost'), { code: 'CLOUD_STATE_COMMIT_UNCERTAIN' })
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-cloud-worker-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  let state, time = Date.now(), sends = 0
  const store = openCStore(':memory:')
  const configured = { send: async () => {} }
  const service = createCampusService({ store, uploadsDir: join(directory, 'uploads'), pushProvider: configured, now: () => time })
  const call = (method, params, login) => service.invoke(method, params, login ? { token: login.token, userId: login.user.id } : {})
  const alice = call('auth.register', { studentId: 'alice', nickname: 'alice', password })
  const bob = call('auth.register', { studentId: 'bob', nickname: 'bob', password })
  store.insert('campus.market', { id: 'book', type: 'market', title: '书', ownerId: bob.user.id, visibility: 'public' })
  const chat = call('conversation.open', { contentType: 'market', contentId: 'book', peerUserId: bob.user.id }, alice)
  state = { version: 1, snapshot: exportSnapshot(store), game: null, files: {}, cleanup: [] }
  service.push.stop(); store.close()
  const hooks = {}, sent = [], counters = { reads: 0, writes: 0 }
  const repository = {
    async read() {
      counters.reads++
      await hooks.beforeRead?.()
      return structuredClone(state)
    },
    async compareAndSwap(version, next) {
      await hooks.beforeWrite?.(next)
      if (version !== state.version) throw conflict()
      state = structuredClone({ ...next, version: version + 1 })
      counters.writes++
      await hooks.afterWrite?.(next)
    }
  }
  function mutate(run) {
    const current = hydrateStore(state.snapshot)
    try {
      const result = run(current)
      state = { ...state, version: state.version + 1, snapshot: exportSnapshot(current) }
      return result
    } finally { current.close() }
  }
  function rpc(method, params, login) {
    return mutate(current => {
      const api = createCampusService({ store: current, uploadsDir: join(directory, 'uploads'), pushProvider: configured, now: () => time })
      try { return api.invoke(method, params, { token: login.token, userId: login.user.id }) }
      finally { api.push.stop() }
    })
  }
  const provider = { async send(message) { sent.push(message); sends++; await hooks.send?.(message, sends) } }
  const f = { alice, bob, chat, hooks, counters, repository, provider, sent, mutate, rpc,
    now: () => time, advance: ms => { time += ms }, state: () => structuredClone(state),
    jobs: () => state.snapshot.records.filter(row => row.collection === 'campus.pushJobs').map(row => JSON.parse(row.data)),
    worker: options => createCloudPushWorker({ repository, provider, now: () => time, ...options }),
    bind: (login = bob, cid = clientId) => rpc('push.bind', { clientId: cid, platform: 'android' }, login),
    send: (key = 'message-1') => rpc('message.send', { conversationId: chat.id, body: '不发送给推送平台的正文', idempotencyKey: key }, alice) }
  f.updateJob = patch => mutate(current => {
    const job = f.jobs()[0]
    current.update('campus.pushJobs', { ...job, ...patch })
  })
  return f
}

test('CloudBase worker delivers committed jobs with stable IDs and no private message text', async t => {
  const f = fixture(t); f.bind(); f.send()
  assert.equal(f.sent.length, 0)
  const job = f.jobs()[0], before = f.state()
  const result = await f.worker().run([job.id])
  assert.deepEqual(result, { processed: 1, retryNeeded: false, retryAfterMs: 0, remainingJobIds: [], readyJobIds: [] })
  assert.equal(f.jobs()[0].status, 'accepted'); assert.equal(f.jobs()[0].attempts, 1)
  assert.equal(f.jobs()[0].leaseOwner, undefined)
  assert.equal(f.sent[0].request_id, job.id.slice(0, 32))
  assert.equal(JSON.stringify(f.sent).includes('不发送给推送平台的正文'), false)
  assert.deepEqual(f.state().snapshot.records.filter(row => row.collection !== 'campus.pushJobs'),
    before.snapshot.records.filter(row => row.collection !== 'campus.pushJobs'))
  await f.worker().run([job.id]); assert.equal(f.sent.length, 1)
})

test('CloudBase competing worker cannot send a job held by an unexpired durable lease', async t => {
  const f = fixture(t); f.bind(); f.send()
  const started = deferred(), release = deferred()
  f.hooks.send = async () => { started.resolve(); await release.promise }
  const first = f.worker({ ownerId: 'first' }).run()
  await started.promise
  const second = await f.worker({ ownerId: 'second' }).run()
  assert.equal(second.processed, 0); assert.equal(second.retryNeeded, true)
  assert.equal(second.retryAfterMs, 90_000); assert.equal(f.sent.length, 1)
  assert.deepEqual(second.readyJobIds, [])
  release.resolve(); await first
  assert.equal(f.jobs()[0].status, 'accepted')
})

test('CloudBase worker recovers an expired lease without changing the provider request ID', async t => {
  const f = fixture(t); f.bind(); f.send()
  const id = f.jobs()[0].id
  f.updateJob({ leaseOwner: 'interrupted-worker', leaseUntil: f.now() + 90_000, attempts: 1 })
  assert.equal((await f.worker().run()).processed, 0)
  f.advance(90_001)
  await f.worker().run()
  assert.equal(f.jobs()[0].status, 'accepted'); assert.equal(f.jobs()[0].attempts, 2)
  assert.equal(f.sent[0].request_id, id.slice(0, 32))
})

test('CloudBase uncertain claim must be read back before the provider can be called', async t => {
  const f = fixture(t); f.bind(); f.send()
  let interrupted = false
  f.hooks.afterWrite = () => { if (!interrupted) { interrupted = true; throw uncertain() } }
  await f.worker().run()
  assert.equal(f.sent.length, 1); assert.equal(f.jobs()[0].status, 'accepted')
})

test('CloudBase unobserved uncertain claim never sends a notification', async t => {
  const f = fixture(t); f.bind(); f.send()
  let interrupted = false
  f.hooks.beforeWrite = () => { if (!interrupted) { interrupted = true; throw uncertain() } }
  await assert.rejects(f.worker().run(), { code: 'PUSH_STATE_COMMIT_UNCERTAIN' })
  assert.equal(f.sent.length, 0); assert.equal(f.jobs()[0].attempts, 0)
  await f.worker().run()
  assert.equal(f.sent.length, 1)
})

for (const scenario of ['read', 'logout', 'switch', 'block', 'delete', 'private', 'disable']) {
  test(`CloudBase worker rechecks committed ${scenario} after claiming and before sending`, async t => {
    const f = fixture(t); f.bind(); const message = f.send()
    let changed = false
    f.hooks.beforeRead = () => {
      if (changed || !f.jobs()[0]?.leaseOwner) return
      changed = true
      if (scenario === 'read') f.rpc('conversation.markRead', { conversationId: f.chat.id, throughMessageId: message.id }, f.bob)
      if (scenario === 'logout') f.rpc('auth.logout', {}, f.bob)
      if (scenario === 'switch') f.bind(f.alice)
      if (scenario === 'block') f.rpc('user.block', { userId: f.alice.user.id }, f.bob)
      if (scenario === 'delete') f.rpc('auth.deleteAccount', { password, confirmation: '注销账号' }, f.bob)
      if (scenario === 'private') f.mutate(store => store.update('campus.market', { ...store.get('campus.market', 'book'), visibility: 'private' }))
      if (scenario === 'disable') f.rpc('push.unbind', { clientId }, f.bob)
    }
    await f.worker().run()
    assert.equal(changed, true); assert.equal(f.sent.length, 0)
    if (scenario === 'delete') assert.equal(f.jobs().length, 0)
    else assert.equal(f.jobs()[0].status, 'discarded')
  })
}

test('CloudBase outcome conflict merges into current state without losing a concurrent read', async t => {
  const f = fixture(t); f.bind(); const message = f.send()
  let changed = false
  f.hooks.beforeWrite = next => {
    const job = JSON.parse(next.snapshot.records.find(row => row.collection === 'campus.pushJobs').data)
    if (changed || job.status !== 'accepted') return
    changed = true
    f.rpc('conversation.markRead', { conversationId: f.chat.id, throughMessageId: message.id }, f.bob)
    f.mutate(store => store.insert('campus.testRecord', { id: 'concurrent', saved: true }))
  }
  await f.worker().run()
  assert.equal(changed, true); assert.equal(f.sent.length, 1)
  assert.equal(f.jobs()[0].status, 'accepted')
  const current = f.state().snapshot.records
  assert.equal(current.filter(row => row.collection === 'conversationReads').length, 1)
  assert.equal(current.filter(row => row.collection === 'campus.testRecord').length, 1)
})

test('CloudBase provider failure keeps the message committed and returns bounded retry timing', async t => {
  const f = fixture(t); f.bind(); f.send()
  f.hooks.send = (_, attempt) => { if (attempt === 1) throw new Error('provider unavailable') }
  const first = await f.worker().run()
  assert.equal(first.retryNeeded, true); assert.equal(first.retryAfterMs, 5000)
  assert.deepEqual(first.readyJobIds, [])
  assert.equal(f.jobs()[0].attempts, 1)
  const early = await f.worker().run()
  assert.equal(early.processed, 0); assert.equal(f.sent.length, 1)
  assert.equal(f.rpc('message.list', { conversationId: f.chat.id }, f.bob).items.length, 1)
  f.advance(5000); await f.worker().run()
  assert.equal(f.jobs()[0].status, 'accepted')
  assert.equal(f.sent[0].request_id, f.sent[1].request_id)
})

test('CloudBase worker limits delivery to eight attempts and discards expired jobs', async t => {
  const f = fixture(t); f.bind(); f.send()
  f.hooks.send = () => { throw new Error('provider unavailable') }
  for (let attempt = 1; attempt <= 8; attempt++) {
    const result = await f.worker().run()
    assert.equal(f.jobs()[0].attempts, attempt)
    if (attempt < 8) f.advance(result.retryAfterMs)
  }
  assert.equal(f.jobs()[0].status, 'failed'); assert.equal(f.sent.length, 8)
  assert.equal((await f.worker().run()).retryNeeded, false)
  f.send('expired-message')
  f.advance(3_600_001)
  await f.worker().run()
  assert.equal(f.jobs()[1].status, 'discarded'); assert.equal(f.sent.length, 8)
})

test('CloudBase worker batches at five and reports every remaining targeted job', async t => {
  const f = fixture(t)
  for (let device = 0; device < 7; device++) f.bind(f.bob, `worker-device-${device.toString().padStart(3, '0')}`)
  f.send()
  const result = await f.worker().run()
  assert.equal(result.processed, 5); assert.equal(f.sent.length, 5)
  assert.equal(result.retryNeeded, true); assert.equal(result.retryAfterMs, 0)
  assert.equal(result.remainingJobIds.length, 2)
  const next = await f.worker().run(result.remainingJobIds)
  assert.equal(next.processed, 2); assert.equal(next.retryNeeded, false)
  f.send('targeted-message')
  const targeted = f.jobs().find(job => job.status === 'pending').id
  assert.equal((await f.worker().run([targeted])).retryNeeded, false)
  assert.equal(f.jobs().filter(job => job.status === 'pending').length, 6)
})

test('CloudBase accepted outcome with a lost acknowledgement is observed without a duplicate send', async t => {
  const f = fixture(t); f.bind(); f.send()
  let interrupted = false
  f.hooks.afterWrite = next => {
    const job = JSON.parse(next.snapshot.records.find(row => row.collection === 'campus.pushJobs').data)
    if (!interrupted && job.status === 'accepted') { interrupted = true; throw uncertain() }
  }
  await f.worker().run()
  await f.worker().run()
  assert.equal(f.sent.length, 1); assert.equal(f.jobs()[0].status, 'accepted')
})

test('CloudBase replay after an uncertain outcome keeps the same provider deduplication ID', async t => {
  const f = fixture(t); f.bind(); f.send()
  const displayed = new Set()
  f.hooks.send = message => displayed.add(message.request_id)
  let interrupted = false
  f.hooks.beforeWrite = next => {
    const job = JSON.parse(next.snapshot.records.find(row => row.collection === 'campus.pushJobs').data)
    if (!interrupted && job.status === 'accepted') { interrupted = true; throw uncertain() }
  }
  await assert.rejects(f.worker().run(), { code: 'PUSH_STATE_COMMIT_UNCERTAIN' })
  assert.equal(f.jobs()[0].status, 'pending'); assert.equal(f.jobs()[0].attempts, 1)
  f.advance(90_001)
  await f.worker().run()
  assert.equal(f.sent.length, 2); assert.equal(displayed.size, 1)
  assert.equal(f.jobs()[0].status, 'accepted')
})

test('CloudBase worker never overwrites a replacement lease or resurrects deleted jobs', async t => {
  const f = fixture(t); f.bind(); f.send()
  f.hooks.send = () => f.updateJob({ leaseOwner: 'replacement', leaseUntil: f.now() + 90_000 })
  const result = await f.worker().run()
  assert.equal(result.retryNeeded, true)
  assert.equal(f.jobs()[0].leaseOwner, 'replacement'); assert.equal(f.jobs()[0].status, 'pending')
  f.advance(90_001)
  f.hooks.send = () => f.rpc('auth.deleteAccount', { password, confirmation: '注销账号' }, f.bob)
  assert.equal((await f.worker().run()).retryNeeded, false)
  assert.equal(f.jobs().length, 0)
})

test('CloudBase invalid event job IDs are rejected before reading state or calling a provider', async t => {
  const f = fixture(t), worker = f.worker()
  await assert.rejects(worker.run(['not-a-job']), { code: 'INVALID_PUSH_JOB_IDS' })
  await assert.rejects(worker.run(Array(101).fill('a'.repeat(64))), { code: 'INVALID_PUSH_JOB_IDS' })
  assert.equal(f.counters.reads, 0); assert.equal(f.sent.length, 0)
  assert.deepEqual(await worker.run([]), { processed: 0, retryNeeded: false, retryAfterMs: 0, remainingJobIds: [], readyJobIds: [] })
})
