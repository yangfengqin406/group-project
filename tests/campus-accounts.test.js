import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { openCStore } from '../backend/c/store.js'
import { createAccounts } from '../backend/campus/accounts.js'
import { inspectImage } from '../backend/campus/image.js'

// Real 1×1 images encoded by Windows' PNG/JPEG encoders; no fake header-only
// buffers are accepted as successful uploads.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAALSURBVBhXY2AAAgAABQABqtXIUQAAAABJRU5ErkJggg==', 'base64')
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKAP/2Q==', 'base64')
const errorCode = (code) => (error) => error.code === code

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-account-test-'))
  const filename = join(directory, 'data.sqlite'), uploadsDir = join(directory, 'uploads')
  let store, accounts
  const reopen = () => {
    store?.close()
    store = openCStore(filename)
    accounts = createAccounts({ store, uploadsDir, uploadOrigin: 'http://127.0.0.1:8788' })
  }
  reopen()
  t.after(() => {
    store.close()
    // Only remove the test-owned directory returned by mkdtemp, under tmpdir.
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
    assert.match(directory.split(/[\\/]/).at(-1), /^campus-account-test-/)
    rmSync(directory, { recursive: true, force: true })
  })
  return { directory, filename, uploadsDir, reopen,
    get store() { return store }, get accounts() { return accounts },
    register(studentId = 'alice001', nickname = '小兔同学') {
      return accounts.invoke('auth.register', { studentId, nickname, password: 'a-strong-test-password' })
    }
  }
}

test('real registration isolates accounts, stores salted password digests and returns only public fields', (t) => {
  const f = fixture(t), a = f.register(), b = f.register('bob002', '松鼠同学')
  assert.notEqual(a.user.id, b.user.id)
  assert.notEqual(a.token, b.token)
  assert.equal(a.user.campusName, '本地校园（未核验学籍）')
  assert.deepEqual(f.accounts.authenticate(a.token), { userId: a.user.id })
  const rawA = f.accounts.getUser(a.user.id), rawB = f.accounts.getUser(b.user.id)
  assert.notEqual(rawA.passwordSalt, rawB.passwordSalt)
  assert.notEqual(rawA.passwordHash, rawB.passwordHash)
  for (const secret of ['passwordHash', 'passwordSalt', 'studentId', 'uniqueKey', 'roles']) {
    assert.equal(secret in a.user, false)
    assert.equal(secret in f.accounts.publicUser(a.user.id), false)
  }
  const saved = f.store.database.prepare('SELECT data FROM c_records').all().map((r) => r.data).join('\n')
  assert.equal(saved.includes('a-strong-test-password'), false)
  assert.equal(saved.includes(a.token), false)
  assert.equal(saved.includes(b.token), false)
  assert.throws(() => f.register('ALICE001', '重复账号'), errorCode('CONFLICT'))
})

test('login verifies passwords and rejects fabricated credentials without falling back to a user', (t) => {
  const f = fixture(t), a = f.register()
  const login = (studentId, password) => f.accounts.invoke('auth.login', { type: 'h5', studentId, password })
  assert.throws(() => login('alice001', 'wrong-password'), errorCode('UNAUTHENTICATED'))
  assert.throws(() => login('nobody001', 'wrong-password'), errorCode('UNAUTHENTICATED'))
  assert.equal(login('ALICE001', 'a-strong-test-password').user.id, a.user.id)
  assert.equal(f.accounts.authenticate(a.user.id), null)
  assert.equal(f.accounts.authenticate(`mock_${a.user.id}`), null)
  assert.equal(f.accounts.authenticate('a'.repeat(43)), null)
  assert.throws(() => f.accounts.invoke('auth.login', { type: 'wechat', code: 'not-a-real-code' }), errorCode('NOT_IMPLEMENTED'))
})

test('credentials and nickname limits are checked; registration cannot grant itself administrator roles', (t) => {
  const f = fixture(t)
  for (const studentId of ['', 'a', 'bad/name', 'bad name', 'x'.repeat(41), { id: 'alice' }])
    assert.throws(() => f.accounts.invoke('auth.register', { studentId, password: 'long-enough', nickname: '测试' }), errorCode('INVALID_ARGUMENT'))
  for (const password of ['', 'short', 'x'.repeat(129), { hash: 'long-enough' }])
    assert.throws(() => f.accounts.invoke('auth.register', { studentId: 'valid-user', password, nickname: '测试' }), errorCode('INVALID_ARGUMENT'))
  const a = f.accounts.invoke('auth.register', { studentId: 'no-admin', password: 'long-enough', nickname: '测试', roles: ['admin'], campusId: 'verified' })
  assert.deepEqual(f.accounts.getUser(a.user.id).roles, [])
  assert.equal(a.user.campusId, 'local-campus')
})

test('accounts and sessions survive reopening SQLite; logout revokes only the presented session', (t) => {
  const f = fixture(t), a = f.register()
  const second = f.accounts.invoke('auth.login', { type: 'h5', studentId: 'alice001', password: 'a-strong-test-password' })
  f.reopen()
  assert.deepEqual(f.accounts.authenticate(a.token), { userId: a.user.id })
  assert.equal(f.accounts.publicUser(a.user.id).nickname, '小兔同学')
  assert.deepEqual(f.accounts.invoke('auth.logout', {}, { userId: a.user.id, token: a.token }), { loggedOut: true })
  assert.equal(f.accounts.authenticate(a.token), null)
  assert.deepEqual(f.accounts.authenticate(second.token), { userId: a.user.id })
  f.reopen()
  assert.equal(f.accounts.authenticate(a.token), null)
  assert.deepEqual(f.accounts.authenticate(second.token), { userId: a.user.id })
})

test('expired sessions and disabled accounts cannot authenticate; another user cannot revoke a session', (t) => {
  const f = fixture(t), a = f.register(), b = f.register('bob002', '另一账号')
  assert.throws(() => f.accounts.invoke('auth.logout', {}, { userId: b.user.id, token: a.token }), errorCode('UNAUTHENTICATED'))
  const session = f.store.query('campus.sessions', "json_extract(data, '$.userId') = ?", [a.user.id], 'seq DESC', 1)[0].value
  f.store.update('campus.sessions', { ...session, expiresAt: '2000-01-01T00:00:00.000Z' })
  assert.equal(f.accounts.authenticate(a.token), null)
  f.store.update('campus.users', { ...f.accounts.getUser(b.user.id), disabled: true })
  assert.equal(f.accounts.authenticate(b.token), null)
  assert.throws(() => f.accounts.invoke('auth.login', { type: 'h5', studentId: 'bob002', password: 'a-strong-test-password' }), errorCode('UNAUTHENTICATED'))
})

test('PNG, JPEG and WebP uploads transfer real bytes and persist with safe random filenames', (t) => {
  const f = fixture(t), a = f.register()
  const webp = readFileSync(new URL('../src/static/village/guide-puppy.webp', import.meta.url))
  for (const [buffer, mime] of [[png, 'image/png'], [jpeg, 'image/jpeg'], [webp, 'image/webp']]) {
    const response = f.accounts.receiveUpload({ userId: a.user.id, usage: 'content', buffer, mime, origin: 'http://192.168.1.2:8788' })
    assert.equal(response.url, `http://192.168.1.2:8788/api/files/${response.imageId}`)
    const upload = f.accounts.getUpload(response.imageId)
    assert.equal(upload.ownerId, a.user.id)
    assert.equal(upload.mime, mime)
    assert.equal(upload.status, 'pending')
    assert.equal(upload.size, buffer.length)
    assert.ok(upload.filePath.startsWith(resolve(f.uploadsDir) + sep))
    assert.deepEqual(readFileSync(upload.filePath), buffer)
    assert.equal(f.accounts.getUploadByUrl(response.url).id, response.imageId)
    assert.equal(f.accounts.getUploadByUrl(response.url.replace('192.168.1.2', 'evil.example')), null)
    f.reopen()
    assert.deepEqual(readFileSync(f.accounts.getUpload(response.imageId).filePath), buffer)
  }
})

test('upload confirmation is owned, checks trusted content binding and preserves confirmed status', (t) => {
  const f = fixture(t), a = f.register(), b = f.register('bob002', '另一账号')
  const upload = f.accounts.receiveUpload({ userId: a.user.id, usage: 'content', buffer: png, mime: 'image/png' })
  assert.throws(() => f.accounts.invoke('upload.confirm', upload, { userId: b.user.id }), errorCode('FORBIDDEN'))
  assert.throws(() => f.accounts.invoke('upload.confirm', { ...upload, contentType: 'market', contentId: 'other-content' }, { userId: a.user.id }), errorCode('FORBIDDEN'))
  assert.equal(f.accounts.invoke('upload.confirm', upload, { userId: a.user.id }).status, 'confirmed')
  assert.equal(f.accounts.invoke('upload.confirm', { ...upload, contentType: 'market', contentId: 'my-content' }, { userId: a.user.id, uploadTargetVerified: true }).status, 'confirmed')
  assert.equal(f.accounts.getUpload(upload.imageId).contentId, 'my-content')
  f.reopen()
  assert.equal(f.accounts.getUpload(upload.imageId).status, 'confirmed')
})

test('missing authentication, SVG, forged MIME, corrupt and oversized image payloads leave no files or success records', (t) => {
  const f = fixture(t), a = f.register()
  const upload = (extra) => f.accounts.receiveUpload({ userId: a.user.id, usage: 'content', buffer: png, mime: 'image/png', ...extra })
  assert.throws(() => upload({ userId: 'fake-user' }), errorCode('UNAUTHENTICATED'))
  for (const extra of [
    { usage: 'anything' }, { buffer: Buffer.from('<svg><script>alert(1)</script></svg>') },
    { mime: 'image/jpeg' }, { buffer: Buffer.alloc(5 * 1024 * 1024 + 1) },
    { buffer: Buffer.alloc(0) }, { buffer: png.subarray(0, png.length - 1) },
    { buffer: Buffer.concat([png, Buffer.from('<script>')]) }
  ]) assert.throws(() => upload(extra), errorCode('INVALID_ARGUMENT'))
  const corrupt = Buffer.from(png); corrupt[corrupt.length - 15] ^= 1
  assert.throws(() => upload({ buffer: corrupt }), errorCode('INVALID_ARGUMENT'))
  assert.deepEqual(readdirSync(f.uploadsDir), [])
  assert.deepEqual(f.store.query('campus.uploads'), [])
  assert.throws(() => f.accounts.invoke('upload.create', { usage: 'content', data: 'blob:temporary-file' }, { userId: a.user.id }), errorCode('NOT_SUPPORTED'))
})

test('failed upload record persistence cleans up the written file and exposes no raw storage error', (t) => {
  const f = fixture(t), a = f.register(), insert = f.store.insert
  f.store.insert = (collection, value) => {
    if (collection === 'campus.uploads') throw new Error('private-database-details')
    return insert(collection, value)
  }
  assert.throws(() => f.accounts.receiveUpload({ userId: a.user.id, usage: 'avatar', buffer: png, mime: 'image/png' }),
    (error) => error.code === 'SERVICE_UNAVAILABLE' && !error.message.includes('private-database-details'))
  assert.deepEqual(readdirSync(f.uploadsDir), [])
})

test('image byte inspection rejects dimensions bombs and header-only fakes', () => {
  // A structurally valid PNG encoded at 8193×1 exceeds the allowed width.
  const tooWide = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAIAEAAAABCAYAAACZiUteAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA2SURBVHhe7cEBDQAAAMKg90/tZg6gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAbgAUAAVVLy38AAAAASUVORK5CYII=', 'base64')
  assert.equal(inspectImage(tooWide), null)
  assert.equal(inspectImage(Buffer.from('not-an-image')), null)
  assert.equal(inspectImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), null)
  assert.equal(inspectImage(Buffer.from('RIFF0000WEBPVP8X00000000000000')), null)
  assert.equal(inspectImage(png).mime, 'image/png')
  assert.equal(inspectImage(jpeg).mime, 'image/jpeg')
})
