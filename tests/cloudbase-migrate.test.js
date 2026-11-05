import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openCStore } from '../backend/c/store.js'
import { exportSnapshot } from '../backend/cloudbase/state.js'
import { prepareCloudMigration } from '../scripts/cloudbase-migrate.mjs'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAALSURBVBhXY2AAAgAABQABqtXIUQAAAABJRU5ErkJggg==', 'base64')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const clone = (value) => structuredClone(value)
const oldOrigin = 'http://192.168.1.8:8788', publicOrigin = 'https://new.example.test'
const oldUrl = (id) => `${oldOrigin}/api/files/${id}`
const newUrl = (id) => `${publicOrigin}/api/files/${id}`

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-cloud-migrate-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const databaseFile = join(directory, 'frozen.sqlite'), uploadsRoot = join(directory, 'uploads')
  mkdirSync(uploadsRoot)
  const source = openCStore(databaseFile)
  source.insert('campus.users', { id: 'private-user', nickname: '虚构用户', passwordHash: 'invented-password-hash',
    passwordSalt: 'invented-password-salt', uniqueKey: 'invented-account', avatarImageId: 'private-avatar', avatarUrl: oldUrl('private-avatar') })
  source.insert('campus.users', { id: 'other-user', nickname: '另一用户', passwordHash: 'other-invented-hash' })
  source.insert('campus.sessions', { id: 'old-session', uniqueKey: 'invented-old-token-digest', userId: 'private-user',
    expiresAt: '2030-01-01T00:00:00.000Z', revokedAt: null })
  for (const [id, usage, status] of [['private-avatar', 'avatar', 'confirmed'], ['pending-content', 'content', 'pending']]) {
    const filename = `${id}.png`
    source.insert('campus.uploads', { id, imageId: id, ownerId: 'private-user', usage, status, url: oldUrl(id),
      mime: 'image/png', size: png.length, filename, filePath: `Z:\\old-private-computer\\uploads\\${filename}`,
      createdAt: '2026-11-01T01:02:03.000Z' })
    writeFileSync(join(uploadsRoot, filename), png)
  }
  source.insert('campus.market', { id: 'private-post', ownerId: 'private-user', visibility: 'private',
    imageIds: ['pending-content'], images: [oldUrl('pending-content')], title: '虚构私有资料',
    body: `正文包含 ${oldUrl('pending-content')} 必须原样`, unrelated: `${oldOrigin}/api/files/unowned-image`,
    lookalike: `${oldUrl('pending-content')}?not-an-exact-match=1` })
  source.insert('messages', { id: 'old-message', conversationId: 'private-conversation', senderId: 'private-user',
    body: '虚构私信不能出现在摘要', nested: { image: oldUrl('pending-content'), originText: oldOrigin } })
  source.saveReceipt('private-user', 'market.create', 'saved-key', `original-fingerprint:${oldUrl('pending-content')}`,
    { id: 'private-post', images: [oldUrl('pending-content')], body: '原回执正文' })
  source.database.prepare('INSERT INTO c_settings VALUES (?, ?)').run('future_setting', `kept:${oldOrigin}`)
  source.database.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'c_records'").run(999)
  source.close()
  const calls = [], objects = new Map(), controls = { target: null, failUpload: 0, initializeError: null,
    loseAck: false, emptyAck: false, afterUpload: null, failRemove: false }
  let persisted = null, initialized = null, uploadCount = 0
  const repository = {
    async read() { calls.push('read'); return clone(controls.target) },
    async initialize(state) {
      calls.push('initialize'); initialized = clone(state)
      if (controls.initializeError) throw controls.initializeError
      if (controls.target !== null) throw Object.assign(new Error('target raced'), { code: 'CLOUD_STATE_CONFLICT' })
      persisted = { ...clone(state), version: 1 }
      if (controls.loseAck) throw Object.assign(new Error('network contains invented-private-data'), { code: 'CLOUD_STATE_COMMIT_UNCERTAIN' })
      if (controls.emptyAck) return undefined
      return clone(persisted)
    }
  }
  const files = {
    async upload(cloudPath, bytes) {
      calls.push('upload'); uploadCount++
      if (controls.failUpload === uploadCount) throw new Error('upload contains invented-private-data')
      const fileID = `cloud://invented-private/${cloudPath}`
      objects.set(fileID, Buffer.from(bytes))
      await controls.afterUpload?.(uploadCount)
      return fileID
    },
    async remove(fileID) {
      calls.push('remove')
      if (controls.failRemove) throw new Error('delete contains invented-private-data')
      objects.delete(fileID)
    }
  }
  const options = { databaseFile, uploadsRoot, publicOrigin, repository, files }
  const snapshot = () => {
    const database = new DatabaseSync(databaseFile, { readOnly: true })
    try { return exportSnapshot({ database }) } finally { database.close() }
  }
  const changeUpload = (id, change) => {
    const database = new DatabaseSync(databaseFile)
    try {
      const row = database.prepare('SELECT data FROM c_records WHERE collection = ? AND id = ?').get('campus.uploads', id)
      const value = JSON.parse(row.data)
      change(value)
      database.prepare('UPDATE c_records SET data = ? WHERE collection = ? AND id = ?').run(JSON.stringify(value), 'campus.uploads', id)
    } finally { database.close() }
  }
  return { ...options, options, directory, controls, calls, objects, snapshot, changeUpload,
    get persisted() { return persisted }, get initialized() { return initialized } }
}

test('PG native storage locators preserve the imported file references', async (t) => {
  const f = fixture(t)
  const files = { async upload(path, bytes) { const id=`pg://campus-private/${path}`; f.objects.set(id,bytes); return id }, async remove(id) { f.objects.delete(id) } }
  await prepareCloudMigration({ ...f.options, files, confirmEmpty:true })
  assert.equal(Object.keys(f.persisted.files).length,2)
  for (const file of Object.values(f.persisted.files)) assert.match(file.fileID,/^pg:\/\/campus-private\/campus\/migrations\//)
})

test('dry run verifies a read-only frozen source and returns only counts and aggregate digests', async (t) => {
  const f = fixture(t), before = readFileSync(f.databaseFile), original = f.snapshot()
  const result = await prepareCloudMigration(f.options)
  assert.equal(result.status, 'dry_run')
  assert.equal(result.dryRun, true)
  assert.deepEqual(f.calls, ['read'])
  assert.equal(result.summary.records, 7)
  assert.equal(result.summary.accounts, 2)
  assert.equal(result.summary.images, 2)
  assert.equal(result.summary.sha256, digest(before))
  assert.match(result.summary.imageSetSha256, /^[a-f0-9]{64}$/)
  assert.equal(result.summary.computedHashes, 2)
  assert.equal(result.summary.sourceHashesVerified, 0)
  assert.equal(result.summary.expectedHashesVerified, 0)
  const output = JSON.stringify(result)
  for (const privateText of ['passwordHash', 'passwordSalt', 'invented-old-token-digest', '正文', 'private-avatar', 'snapshot', oldOrigin])
    assert.equal(output.includes(privateText), false)
  assert.deepEqual(readFileSync(f.databaseFile), before)
  assert.deepEqual(f.snapshot(), original)
  assert.equal(f.objects.size, 0)
})

test('a nonempty or unverifiable target fails before accessing source paths or staging uploads', async (t) => {
  const f = fixture(t)
  f.controls.target = { version: 1 }
  await assert.rejects(prepareCloudMigration({ ...f.options, databaseFile: 'does-not-exist', confirmEmpty: true }),
    { code: 'CLOUD_MIGRATION_TARGET_NOT_EMPTY' })
  assert.deepEqual(f.calls, ['read'])
  await assert.rejects(prepareCloudMigration({ ...f.options, repository: { async read() { throw new Error('private cloud error') } } }),
    { code: 'CLOUD_MIGRATION_TARGET_UNAVAILABLE' })
})

test('source verification never creates SQLite WAL or shared-memory files beside the frozen backup', async (t) => {
  const f = fixture(t), before = readdirSync(f.directory).sort()
  await prepareCloudMigration(f.options)
  assert.deepEqual(readdirSync(f.directory).sort(), before)
})

test('an empty standalone source initializes without inventing accounts, files or game state', async (t) => {
  const f = fixture(t), databaseFile = join(f.directory, 'empty.sqlite')
  const source = openCStore(databaseFile)
  source.close()
  const result = await prepareCloudMigration({ ...f.options, databaseFile, confirmEmpty: true })
  assert.equal(result.summary.records, 0)
  assert.equal(result.summary.accounts, 0)
  assert.equal(result.summary.images, 0)
  assert.equal(result.summary.computedHashes, 0)
  assert.deepEqual(f.persisted.files, {})
  assert.deepEqual(f.persisted.cleanup, [])
  assert.equal(f.persisted.game, null)
  assert.equal(f.persisted.snapshot.sequence, 0)
  assert.deepEqual(f.calls, ['read', 'initialize'])
})

test('confirmed initialization preserves credentials, tokens, privacy, receipts, settings and sequence while remapping only owned exact URLs', async (t) => {
  const f = fixture(t), before = readFileSync(f.databaseFile), original = f.snapshot()
  const result = await prepareCloudMigration({ ...f.options, confirmEmpty: true })
  assert.equal(result.status, 'imported')
  assert.equal(result.version, 1)
  assert.deepEqual(f.calls, ['read', 'upload', 'upload', 'initialize'])
  assert.equal(f.persisted.game, null)
  assert.deepEqual(f.persisted.cleanup, [])
  assert.equal(f.persisted.snapshot.sequence, 999)
  assert.deepEqual(f.persisted.snapshot.settings, original.settings)
  assert.equal(f.persisted.snapshot.receipts[0].fingerprint, original.receipts[0].fingerprint)
  assert.deepEqual(JSON.parse(f.persisted.snapshot.receipts[0].response).images, [newUrl('pending-content')])
  for (let index = 0; index < original.records.length; index++) {
    const old = original.records[index], row = f.persisted.snapshot.records[index]
    assert.equal(row.id, old.id)
    assert.equal(row.seq, old.seq)
    assert.equal(row.collection, old.collection)
    if (['campus.sessions'].includes(row.collection) || row.id === 'other-user') assert.equal(row.data, old.data)
  }
  const rows = new Map(f.persisted.snapshot.records.map((row) => [row.id, JSON.parse(row.data)]))
  assert.equal(rows.get('private-user').passwordHash, 'invented-password-hash')
  assert.equal(rows.get('private-user').avatarUrl, newUrl('private-avatar'))
  assert.equal(rows.get('private-post').visibility, 'private')
  assert.equal(rows.get('private-post').body, JSON.parse(original.records.find((row) => row.id === 'private-post').data).body)
  assert.equal(rows.get('private-post').unrelated, `${oldOrigin}/api/files/unowned-image`)
  assert.equal(rows.get('private-post').lookalike, `${oldUrl('pending-content')}?not-an-exact-match=1`)
  assert.equal(rows.get('old-message').nested.image, newUrl('pending-content'))
  assert.equal(rows.get('old-message').nested.originText, oldOrigin)
  for (const id of ['private-avatar', 'pending-content']) {
    assert.equal(rows.get(id).filePath, `/cloudbase/uploads/${id}.png`)
    assert.equal(rows.get(id).status, id === 'private-avatar' ? 'confirmed' : 'pending')
    const file = f.persisted.files[id]
    assert.deepEqual(Object.keys(file).sort(), ['fileID', 'filename', 'sha256', 'size'])
    assert.equal(file.sha256, digest(png))
    assert.equal(file.filename, `${id}.png`)
    assert.equal(file.size, png.length)
    assert.deepEqual(f.objects.get(file.fileID), png)
  }
  assert.deepEqual(readFileSync(f.databaseFile), before)
  assert.deepEqual(f.snapshot(), original)
})

test('stored and optional external image hashes are really checked, with historical computed counts explicit', async (t) => {
  const f = fixture(t)
  f.changeUpload('private-avatar', (image) => { image.sha256 = digest(png).toUpperCase() })
  const expectedFileHashes = { 'private-avatar.png': digest(png), 'pending-content.png': digest(png) }
  const result = await prepareCloudMigration({ ...f.options, expectedFileHashes })
  assert.equal(result.summary.sourceHashesVerified, 1)
  assert.equal(result.summary.computedHashes, 2)
  assert.equal(result.summary.expectedHashesVerified, 2)
  await assert.rejects(prepareCloudMigration({ ...f.options, expectedFileHashes: { ...expectedFileHashes,
    'pending-content.png': '0'.repeat(64) } }), { code: 'CLOUD_MIGRATION_SOURCE_INVALID' })
  await assert.rejects(prepareCloudMigration({ ...f.options, expectedFileHashes: {} }), { code: 'CLOUD_MIGRATION_SOURCE_INVALID' })
  f.changeUpload('private-avatar', (image) => { image.sha256 = '0'.repeat(64) })
  await assert.rejects(prepareCloudMigration(f.options), { code: 'CLOUD_MIGRATION_SOURCE_INVALID' })
  assert.equal(f.objects.size, 0)
})

test('unknown, forged, traversing or unowned upload metadata fails before every cloud write', async (t) => {
  const corruptions = [
    (image) => { image.filename = '../private-avatar.png' },
    (image) => { image.filename = '..\\private-avatar.png' },
    (image) => { image.filename = 'private-avatar.png:secret' },
    (image) => { image.filename = 'pending-content.png' },
    (image) => { image.imageId = 'pending-content' },
    (image) => { image.ownerId = 'missing-user' },
    (image) => { image.url = oldUrl('pending-content') },
    (image) => { image.url = `${oldUrl('private-avatar')}?secret=1` },
    (image) => { image.mime = 'image/jpeg' },
    (image) => { image.size++ },
    (image) => { image.sha256 = 'not-a-digest' },
    (image) => { image.unknownLegacyMetadata = 'must-review' }
  ]
  for (const change of corruptions) {
    const f = fixture(t)
    f.changeUpload('private-avatar', change)
    await assert.rejects(prepareCloudMigration({ ...f.options, confirmEmpty: true }), { code: 'CLOUD_MIGRATION_SOURCE_INVALID' })
    assert.deepEqual(f.calls, ['read'])
  }
})

test('upload bytes and symlinks are verified within uploadsRoot instead of reading the original Windows filePath', async (t) => {
  const f = fixture(t)
  // The fixture has a deliberately nonexistent Z:\\ filePath; verified child
  // filenames still migrate, while a linked file never counts as that child.
  await prepareCloudMigration(f.options)
  const path = join(f.uploadsRoot, 'private-avatar.png')
  const outside = join(f.directory, 'outside.png')
  writeFileSync(outside, png)
  unlinkSync(path)
  try { symlinkSync(outside, path, 'file') }
  catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Windows symlink creation is unavailable'); return }
    throw error
  }
  await assert.rejects(prepareCloudMigration({ ...f.options, confirmEmpty: true }), { code: 'CLOUD_MIGRATION_SOURCE_INVALID' })
  assert.equal(f.objects.size, 0)
})

test('corrupt source bytes and incomplete SQLite snapshots cannot be uploaded', async (t) => {
  const f = fixture(t)
  const broken = Buffer.from(png); broken[0] = 0
  writeFileSync(join(f.uploadsRoot, 'private-avatar.png'), broken)
  await assert.rejects(prepareCloudMigration({ ...f.options, confirmEmpty: true }), { code: 'CLOUD_MIGRATION_SOURCE_INVALID' })
  assert.deepEqual(f.calls, ['read'])
  writeFileSync(join(f.uploadsRoot, 'private-avatar.png'), png)
  writeFileSync(`${f.databaseFile}-wal`, Buffer.from('uncheckpointed invented WAL'))
  await assert.rejects(prepareCloudMigration(f.options), { code: 'CLOUD_MIGRATION_SOURCE_INVALID' })
  unlinkSync(`${f.databaseFile}-wal`)
  writeFileSync(`${f.databaseFile}-journal`, Buffer.from('uncommitted invented rollback journal'))
  await assert.rejects(prepareCloudMigration(f.options), { code: 'CLOUD_MIGRATION_SOURCE_INVALID' })
  assert.equal(f.objects.size, 0)
})

test('staging failure recycles only this attempt and never calls initialization', async (t) => {
  const f = fixture(t)
  f.objects.set('cloud://invented-private/preexisting-object', png)
  f.controls.failUpload = 2
  await assert.rejects(prepareCloudMigration({ ...f.options, confirmEmpty: true }), (error) => {
    assert.equal(error.code, 'CLOUD_MIGRATION_UPLOAD_FAILED')
    assert.equal(error.cleanupFailures, 0)
    assert.equal(error.cause, undefined)
    assert.equal(error.message.includes('invented-private-data'), false)
    return true
  })
  assert.deepEqual(f.calls, ['read', 'upload', 'upload', 'remove'])
  assert.deepEqual([...f.objects.keys()], ['cloud://invented-private/preexisting-object'])
  assert.equal(f.persisted, null)
})

test('a source image changed after dry preflight cannot enter initialization', async (t) => {
  const f = fixture(t)
  f.controls.afterUpload = (count) => {
    if (count === 1) writeFileSync(join(f.uploadsRoot, 'pending-content.png'), Buffer.alloc(png.length))
  }
  await assert.rejects(prepareCloudMigration({ ...f.options, confirmEmpty: true }), { code: 'CLOUD_MIGRATION_UPLOAD_FAILED' })
  assert.deepEqual(f.calls, ['read', 'upload', 'remove'])
  assert.equal(f.persisted, null)
  assert.equal(f.objects.size, 0)
})

test('atomic initialize refuses a target race and reclaims staged objects after a definite rejection', async (t) => {
  const f = fixture(t)
  f.controls.afterUpload = (count) => { if (count === 2) f.controls.target = { version: 4, untouched: true } }
  await assert.rejects(prepareCloudMigration({ ...f.options, confirmEmpty: true }), { code: 'CLOUD_MIGRATION_INITIALIZE_FAILED' })
  assert.deepEqual(f.controls.target, { version: 4, untouched: true })
  assert.deepEqual(f.calls, ['read', 'upload', 'upload', 'initialize', 'remove', 'remove'])
  assert.equal(f.objects.size, 0)
  assert.equal(f.persisted, null)
})

test('lost, unknown or incomplete commit acknowledgement preserves every staged object', async (t) => {
  for (const mode of ['loseAck', 'emptyAck', 'unknown']) {
    const f = fixture(t)
    if (mode === 'unknown') f.controls.initializeError = new Error('private network outcome')
    else f.controls[mode] = true
    await assert.rejects(prepareCloudMigration({ ...f.options, confirmEmpty: true }), (error) => {
      assert.equal(error.code, 'CLOUD_MIGRATION_COMMIT_UNCERTAIN')
      assert.equal(error.stagedPreserved, 2)
      assert.equal(error.cause, undefined)
      return true
    })
    assert.deepEqual(f.calls, ['read', 'upload', 'upload', 'initialize'])
    assert.equal(f.objects.size, 2)
    if (mode !== 'unknown') assert.ok(f.persisted)
  }
})

test('failed cleanup reports a safe failure count without exposing uploaded IDs or credentials', async (t) => {
  const f = fixture(t)
  f.controls.failUpload = 2
  f.controls.failRemove = true
  await assert.rejects(prepareCloudMigration({ ...f.options, confirmEmpty: true }), (error) => {
    assert.equal(error.code, 'CLOUD_MIGRATION_UPLOAD_FAILED')
    assert.equal(error.cleanupFailures, 1)
    assert.equal(JSON.stringify(error).includes('cloud://'), false)
    return true
  })
  assert.equal(f.objects.size, 1)
})
