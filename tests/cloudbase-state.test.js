import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createHmac } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openCStore } from '../backend/c/store.js'
import { createCService } from '../backend/c/service.js'
import { exportSnapshot, hydrateStore, SNAPSHOT_LIMITS } from '../backend/cloudbase/state.js'
import { createCloudRepository } from '../backend/cloudbase/repository.js'

const clone = (value) => structuredClone(value)
function snapshot() {
  const store = openCStore(':memory:')
  try { return exportSnapshot(store) } finally { store.close() }
}
const initial = () => ({ schemaVersion: 1, snapshot: snapshot(), game: null, files: {}, cleanup: [] })

// Models the official Node SDK's direct .set(object), snapshots and conflicting
// commits. All data below is invented; no cloud credentials or network are used.
function fakeDatabase({ array = true } = {}) {
  let stored = null, revision = 0
  const calls = [], controls = { loseCommitAck: false, emptyCommitAck: false, failSet: false, commitCode: null, getCode: null }
  function result(value) {
    if (controls.getCode) return { code: controls.getCode }
    return { data: array ? (value ? [{ ...clone(value), _id: 'primary' }] : []) : value && { ...clone(value), _id: 'primary' } }
  }
  const db = {
    calls, controls,
    get stored() { return clone(stored) },
    put(value) { stored = clone(value); revision++ },
    collection(name) {
      assert.equal(name, 'campus_runtime')
      return { doc(id) { assert.equal(id, 'primary'); return { async get() { calls.push('read'); return result(stored) } } } }
    },
    async startTransaction() {
      calls.push('start')
      let seen, baseRevision, pending
      return {
        collection(name) {
          assert.equal(name, 'campus_runtime')
          return { doc(id) {
            assert.equal(id, 'primary')
            return {
              async get() {
                calls.push('get')
                if (baseRevision === undefined) { baseRevision = revision; seen = clone(stored) }
                return result(seen)
              },
              async set(value) {
                calls.push('set'); assert.ok(Object.hasOwn(value, 'snapshot')); assert.equal(value.data, undefined)
                if (controls.failSet) return { code: 'PERMISSION_DENIED' }
                if (baseRevision !== revision) throw Object.assign(new Error('write conflict'), { code: 'DATABASE_TRANSACTION_CONFLICT' })
                pending = clone(value)
                return { updated: seen ? 1 : 0, upserted: seen ? 0 : 1 }
              }
            }
          } }
        },
        async commit() {
          calls.push('commit')
          if (controls.commitCode) return { code: controls.commitCode }
          if (baseRevision !== revision) throw Object.assign(new Error('commit conflict'), { code: 'DATABASE_TRANSACTION_CONFLICT' })
          stored = pending; revision++
          if (controls.loseCommitAck) throw Object.assign(new Error('invented lost acknowledgement'), { code: 'NETWORK_ERROR' })
          if (controls.emptyCommitAck) return undefined
          return { requestId: 'fake-commit' }
        },
        async rollback() { calls.push('rollback'); return { requestId: 'fake-rollback' } }
      }
    }
  }
  return db
}

test('snapshot roundtrip preserves private credentials, rows, receipts, cursor secret and deleted sequence high-water mark', (t) => {
  const store = openCStore(':memory:')
  t.after(() => store.close())
  store.insert('campus.users', { id: 'invented-user', passwordSalt: 'fake-salt', passwordHash: 'fake-hash' })
  store.insert('campus.sessions', { id: 'invented-token-digest', userId: 'invented-user', expiresAt: 2000000000000 })
  store.insert('notifications', { id: 'event', uniqueKey: 'once', recipientId: 'invented-user' })
  store.insert('lost', { id: 'deleted' })
  store.database.prepare('DELETE FROM c_records WHERE id = ?').run('deleted')
  store.database.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'c_records'").run(999)
  store.saveReceipt('invented-user', 'message.send', 'same-key', '{"body":"test"}', { id: 'saved-result', items: [] })
  store.database.prepare('INSERT INTO c_settings VALUES (?, ?)').run('future_setting', 'kept')
  const saved = exportSnapshot(store), restored = hydrateStore(saved)
  t.after(() => restored.close())
  assert.deepEqual(exportSnapshot(restored), saved)
  assert.deepEqual(restored.get('campus.users', 'invented-user'), store.get('campus.users', 'invented-user'))
  assert.deepEqual(restored.receipt('invented-user', 'message.send', 'same-key'), store.receipt('invented-user', 'message.send', 'same-key'))
  assert.equal(restored.cursorSecret, store.cursorSecret)
  const sign = (secret) => createHmac('sha256', secret).update('persisted cursor').digest('hex')
  assert.equal(sign(restored.cursorSecret), sign(store.cursorSecret))
  restored.insert('lost', { id: 'after-rehydrate' })
  assert.equal(restored.query('lost')[0].seq, 1000)
  assert.throws(() => restored.insert('notifications', { id: 'duplicate', uniqueKey: 'once' }), /UNIQUE constraint/)
})

test('existing signed list cursor remains usable after rehydrating on another request', (t) => {
  const store = openCStore(':memory:')
  t.after(() => store.close())
  const user = { id: 'invented-user', nickname: '测试同学' }
  for (let index = 0; index < 4; index++) store.insert('lost', {
    id: `lost-${index}`, ownerId: user.id, visibility: 'public', status: 'active', title: '虚构失物', type: 'lost_found'
  })
  const before = createCService({ store, getUser: () => user })
  const first = before.invoke('lostFound.list', { pageSize: 2 }, { userId: user.id })
  assert.ok(first.nextCursor)
  const restored = hydrateStore(exportSnapshot(store))
  t.after(() => restored.close())
  const after = createCService({ store: restored, getUser: () => user })
  assert.deepEqual(after.invoke('lostFound.list', { pageSize: 2, cursor: first.nextCursor }, { userId: user.id }),
    before.invoke('lostFound.list', { pageSize: 2, cursor: first.nextCursor }, { userId: user.id }))
})

test('snapshot export accepts a read-only source and never changes the SQLite file', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'campus-cloud-snapshot-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'invented.sqlite'), source = openCStore(path)
  source.insert('campus.users', { id: 'fake-user', passwordHash: 'fake-hash' })
  const expected = exportSnapshot(source)
  source.close()
  const before = readFileSync(path), database = new DatabaseSync(path, { readOnly: true })
  try { assert.deepEqual(exportSnapshot({ database }), expected) } finally { database.close() }
  assert.deepEqual(readFileSync(path), before)
})

test('snapshot rejects bad schema, invalid JSON, duplicate keys, lost secret and oversized payloads without executing SQL', () => {
  const good = snapshot()
  const row = { seq: 1, collection: 'lost', id: "'); DROP TABLE c_records; --", data: '' }
  row.data = JSON.stringify({ id: row.id })
  const source = { ...good, records: [row], sequence: 1 }
  const restored = hydrateStore(source)
  try { assert.deepEqual(restored.get('lost', row.id), { id: row.id }) } finally { restored.close() }
  for (const change of [
    { schemaVersion: 2 }, { sql: 'DROP TABLE c_records' }, { sequence: 0 },
    { records: [{ ...row, data: 'not json' }] }, { records: [{ ...row, data: '{"id":"other"}' }] },
    { records: [row, { ...row }] }, { records: [{ ...row, seq: 1.5 }] }, { settings: [] },
    { settings: [{ name: 'cursor_secret', value: '' }] },
    { records: [{ ...row, data: JSON.stringify({ id: row.id, body: 'x'.repeat(SNAPSHOT_LIMITS.maxRowBytes) }) }] },
    { receipts: Array(SNAPSHOT_LIMITS.maxReceipts + 1).fill({}) }
  ]) assert.throws(() => hydrateStore({ ...source, ...change }), { code: 'CLOUD_SNAPSHOT_INVALID' })
  assert.throws(() => hydrateStore(source, { maxBytes: 50 }), /byte limit/)
  assert.throws(() => hydrateStore({ ...good, records: [
    { seq: 1, collection: 'notifications', id: 'one', data: '{"id":"one","uniqueKey":"same"}' },
    { seq: 2, collection: 'notifications', id: 'two', data: '{"id":"two","uniqueKey":"same"}' }
  ], sequence: 2 }), { code: 'CLOUD_SNAPSHOT_INVALID' })
})

test('snapshot retains a legitimate pet-sized JSON row above 256 KiB', (t) => {
  const store = openCStore(':memory:')
  t.after(() => store.close())
  store.insert('campus.pets', { id: 'fake-user', appearance: { customImage: 'x'.repeat(900000) } })
  const saved = exportSnapshot(store), restored = hydrateStore(saved)
  t.after(() => restored.close())
  assert.deepEqual(exportSnapshot(restored), saved)
})

test('repository initializes once, supports object/array SDK reads and rejects destructive reinitialization', async () => {
  for (const array of [true, false]) {
    const db = fakeDatabase({ array }), repository = createCloudRepository({ db }), state = initial()
    assert.equal(await repository.read(), null)
    const saved = await repository.initialize(state)
    assert.equal(saved.version, 1)
    assert.deepEqual(await repository.read(), saved)
    await assert.rejects(repository.initialize(initial()), { code: 'CLOUD_STATE_CONFLICT' })
    assert.deepEqual(db.stored, saved)
    assert.equal(db.calls.filter((call) => call === 'commit').length, 1)
    assert.ok(db.calls.includes('rollback'))
  }
})

test('repository compares the version in the transaction, preserves all fields, and does not overwrite a newer state', async () => {
  const db = fakeDatabase(), repository = createCloudRepository({ db })
  const first = await repository.initialize(initial())
  const updated = await repository.compareAndSwap(first.version, {
    ...first, files: { 'fake-image': { fileID: 'cloud://fake', ownerId: 'fake-user' } },
    cleanup: ['fake-old-file'], game: { schemaVersion: 1, rooms: [] }, importedAt: 'invented-evidence'
  })
  assert.equal(updated.version, 2)
  assert.deepEqual(await repository.read(), updated)
  await assert.rejects(repository.compareAndSwap(1, first), { code: 'CLOUD_STATE_CONFLICT' })
  assert.deepEqual(db.stored, updated)
  assert.equal(db.calls.filter((call) => call === 'set').length, 2)
})

test('concurrent requests based on the same revision commit at most one winner, with no automatic business replay', async () => {
  const db = fakeDatabase(), a = createCloudRepository({ db }), b = createCloudRepository({ db })
  const first = await a.initialize(initial())
  const replies = await Promise.allSettled([
    a.compareAndSwap(1, { ...first, winner: 'A' }), b.compareAndSwap(1, { ...first, winner: 'B' })
  ])
  assert.equal(replies.filter(({ status }) => status === 'fulfilled').length, 1)
  assert.equal(replies.find(({ status }) => status === 'rejected').reason.code, 'CLOUD_STATE_CONFLICT')
  assert.equal(db.stored.version, 2)
  assert.equal(db.calls.filter((call) => call === 'start').length, 3)
})

test('lost commit acknowledgement is uncertain even when state committed, never a false success or replay', async () => {
  const db = fakeDatabase(), repository = createCloudRepository({ db })
  const first = await repository.initialize(initial())
  db.controls.loseCommitAck = true
  await assert.rejects(repository.compareAndSwap(1, { ...first, marker: 'already saved' }), (error) =>
    error.code === 'CLOUD_STATE_COMMIT_UNCERTAIN' && error.cause.code === 'NETWORK_ERROR')
  assert.equal(db.stored.marker, 'already saved')
  assert.equal(db.stored.version, 2)
  assert.equal(db.calls.filter((call) => call === 'start').length, 2)
  assert.equal(db.calls.filter((call) => call === 'rollback').length, 0)
  assert.equal((await repository.read()).marker, 'already saved')
})

test('SDK errors returned as objects are failures and cannot turn into empty-store initialization', async () => {
  const db = fakeDatabase(), repository = createCloudRepository({ db })
  db.controls.getCode = 'PERMISSION_DENIED'
  await assert.rejects(repository.read(), { code: 'PERMISSION_DENIED' })
  await assert.rejects(repository.initialize(initial()), { code: 'PERMISSION_DENIED' })
  assert.equal(db.stored, null)
  db.controls.getCode = null; db.controls.failSet = true
  await assert.rejects(repository.initialize(initial()), { code: 'PERMISSION_DENIED' })
  assert.equal(db.stored, null)
  db.controls.failSet = false; db.controls.commitCode = 'DATABASE_TRANSACTION_CONFLICT'
  await assert.rejects(repository.initialize(initial()), { code: 'CLOUD_STATE_CONFLICT' })
  assert.equal(db.stored, null)
  db.controls.commitCode = 'NETWORK_ERROR'
  await assert.rejects(repository.initialize(initial()), { code: 'CLOUD_STATE_COMMIT_UNCERTAIN' })
})

test('an empty commit response cannot be reported as a successful write', async () => {
  const db = fakeDatabase(), repository = createCloudRepository({ db })
  db.controls.emptyCommitAck = true
  await assert.rejects(repository.initialize(initial()), { code: 'CLOUD_STATE_COMMIT_UNCERTAIN' })
  assert.equal(db.stored.version, 1)
  assert.equal(db.calls.filter((call) => call === 'start').length, 1)
})

test('malformed SDK document responses cannot be interpreted as an empty database', async () => {
  for (const response of [{}, { data: undefined }, { data: [undefined] }, { data: [null] }, { data: [0] }, { data: [{}, {}] }]) {
    const db = fakeDatabase()
    db.collection = () => ({ doc: () => ({ async get() { return response } }) })
    await assert.rejects(createCloudRepository({ db }).read(), { code: 'CLOUD_STATE_INVALID' })
  }
})

test('invalid or oversized state is rejected before a remote transaction and malformed documents never become empty state', async () => {
  const db = fakeDatabase(), repository = createCloudRepository({ db, maxBytes: 1000 }), state = initial()
  await assert.rejects(repository.initialize({ ...state, files: Array(5) }), { code: 'CLOUD_STATE_INVALID' })
  await assert.rejects(repository.initialize({ ...state, extra: undefined }), { code: 'CLOUD_STATE_INVALID' })
  await assert.rejects(repository.initialize({ ...state, extra: 'x'.repeat(1001) }), { code: 'CLOUD_STATE_INVALID' })
  await assert.rejects(repository.initialize({ ...state, cleanup: Array(2001).fill('fake') }), { code: 'CLOUD_STATE_INVALID' })
  assert.equal(db.calls.length, 0)
  db.put({ version: '1', snapshot: state.snapshot })
  await assert.rejects(repository.read(), { code: 'CLOUD_STATE_INVALID' })
  await assert.rejects(repository.initialize(state), { code: 'CLOUD_STATE_INVALID' })
  assert.equal(db.stored.version, '1')
})
