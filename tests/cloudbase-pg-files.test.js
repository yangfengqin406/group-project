import test from 'node:test'
import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { createPgCloudFiles } from '../backend/cloudbase/pg-files.js'

const envId = 'invented-course-abc123'
const accessKey = 'invented-private-key-never-print'
const base = `https://${envId}.api.tcloudbasegateway.com/v1/storages/object/`
const locator = 'pg://campus-private/folder/photo.png'
const maxBytes = 5 * 1024 * 1024
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
function adapter(respond) {
  const calls = []
  const files = createPgCloudFiles({ envId, accessKey, fetch: async (url, options) => {
    calls.push({ url, options })
    return respond(url, options)
  } })
  return { files, calls }
}
function privateError(error) {
  const rendered = inspect(error, { depth: 8 })
  assert.ok(!rendered.includes(accessKey))
  assert.ok(!rendered.includes('private upstream body'))
  assert.ok(!rendered.includes('https://evil.example'))
  return true
}

test('upload follows official binary POST contract and returns only the private opaque locator', async () => {
  const { files, calls } = adapter(() => json({ Id: 'invented-id', Key: 'folder/图片 a.png' }))
  const bytes = Buffer.from([0, 255, 1, 128])
  assert.equal(await files.upload('folder/图片 a.png', bytes), 'pg://campus-private/folder/图片 a.png')
  assert.equal(calls.length, 1)
  const { url, options } = calls[0]
  assert.equal(url, `${base}campus-private/folder/${encodeURIComponent('图片 a.png')}`)
  assert.equal(options.method, 'POST')
  assert.equal(options.redirect, 'error')
  assert.equal(options.credentials, 'omit')
  assert.equal(options.headers.Authorization, `Bearer ${accessKey}`)
  assert.equal(options.headers['Content-Type'], 'application/octet-stream')
  assert.equal(options.headers['Content-Length'], '4')
  assert.equal(options.headers['Cache-Control'], 'max-age=0')
  assert.equal(options.headers['x-upsert'], undefined)
  assert.equal(options.body, bytes)
})

test('download uses authenticated route and preserves every binary byte; remove is idempotent', async () => {
  const bytes = Buffer.from([0, 255, 128, 13, 10])
  const { files, calls } = adapter((_url, { method }) => method === 'GET'
    ? new Response(bytes) : new Response(null, { status: calls.length === 2 ? 204 : 404 }))
  assert.deepEqual(await files.download(locator), bytes)
  await files.remove(locator)
  await files.remove(locator)
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method]), [
    [`${base}authenticated/campus-private/folder/photo.png`, 'GET'],
    [`${base}campus-private/folder/photo.png`, 'DELETE'],
    [`${base}campus-private/folder/photo.png`, 'DELETE']
  ])
  for (const { options } of calls) {
    assert.equal(options.headers.Authorization, `Bearer ${accessKey}`)
    assert.equal(options.redirect, 'error')
  }
})

test('foreign locators and ambiguous original paths fail before any credentials are sent', async () => {
  const { files, calls } = adapter(() => { throw new Error('must not fetch') })
  const paths = ['', '/a', 'a/', 'a//b', '.', '..', 'a/../b', 'a/./b', 'a\\b', 'a/%2e%2e/b',
    'a/%252e/b', 'a/%2f/b', 'a?x', 'a#x', 'a\u0000b', 'a\r\nb', 'C:/a', 'a/\ud800']
  for (const path of paths) {
    await assert.rejects(files.upload(path, Buffer.from('x')), { code: 'CLOUD_FILE_INVALID' })
    await assert.rejects(files.download(`pg://campus-private/${path}`), { code: 'CLOUD_FILE_INVALID' })
    await assert.rejects(files.remove(`pg://campus-private/${path}`), { code: 'CLOUD_FILE_INVALID' })
  }
  for (const other of ['pg://other-bucket/a', 'pg://campus-private.evil/a', 'pg://campus-private@evil/a',
    'https://evil.example/a', 'cloud://some-env/a', 'pg://campus-private', 'PG://campus-private/a']) {
    await assert.rejects(files.download(other), { code: 'CLOUD_FILE_INVALID' })
    await assert.rejects(files.remove(other), { code: 'CLOUD_FILE_INVALID' })
  }
  assert.equal(calls.length, 0)
})

test('invalid environment, bucket, key, upload body and oversized uploads fail locally', async () => {
  const config = { envId, accessKey, fetch() { throw new Error('must not fetch') } }
  for (const change of [{ envId: 'x.evil' }, { envId: 'https://evil.example' }, { envId: 'x/../y' },
    { bucket: '../x' }, { bucket: 'a/b' }, { bucket: 'x@y' }, { accessKey: '' },
    { accessKey: 'bad\r\nheader' }, { fetch: null }]) {
    assert.throws(() => createPgCloudFiles({ ...config, ...change }), { code: 'CLOUD_FILE_INVALID' })
  }
  const files = createPgCloudFiles(config)
  await assert.rejects(files.upload('file', new Uint8Array([1])), { code: 'CLOUD_FILE_INVALID' })
  await assert.rejects(files.upload('file', Buffer.alloc(maxBytes + 1)), { code: 'CLOUD_FILE_TOO_LARGE' })
})

test('redirects are rejected for upload, download and remove without following any Location', async () => {
  for (const response of [() => new Response(null, { status: 307, headers: { Location: 'https://evil.example' } }),
    () => ({ status: 200, redirected: true, headers: new Headers(), body: null }),
    () => ({ status: 200, url: 'https://evil.example', headers: new Headers(), body: null })]) {
    const { files, calls } = adapter(response)
    for (const operation of [() => files.upload('file', Buffer.from('x')), () => files.download(locator), () => files.remove(locator)])
      await assert.rejects(operation(), error => { assert.equal(error.code, 'CLOUD_FILE_REDIRECT'); return privateError(error) })
    assert.equal(calls.length, 3)
    assert.ok(calls.every(call => call.url.startsWith(base) && call.options.redirect === 'error'))
  }
})

test('upload requires a valid acknowledgement and never fabricates success after upstream failure', async () => {
  for (const response of [() => json({ Message: `${accessKey} private upstream body` }, 403),
    () => new Response(`${accessKey} private upstream body`, { status: 500 }),
    () => new Response(null, { status: 204 }), () => json({}), () => json({ Id: 'id' }),
    () => json({ Id: 'id', Key: 'key', Code: `${accessKey} private upstream body` }),
    () => new Response(`${accessKey} private upstream body`)]) {
    const { files, calls } = adapter(response)
    await assert.rejects(files.upload('file', Buffer.from('x')), privateError)
    assert.equal(calls.length, 1)
  }
})

test('all methods redact network exceptions, raw bodies and statusText with no error cause', async () => {
  for (const respond of [() => { throw new Error(`${accessKey} private upstream body https://evil.example`) },
    () => ({ status: 401, statusText: `${accessKey} private upstream body`, headers: new Headers(), body: null })]) {
    const { files } = adapter(respond)
    for (const operation of [() => files.upload('file', Buffer.from('x')), () => files.download(locator), () => files.remove(locator)])
      await assert.rejects(operation(), error => { assert.equal(error.cause, undefined); return privateError(error) })
  }
})

test('download accepts exactly 5 MiB and rejects announced oversize before reading bytes', async () => {
  const { files } = adapter(() => new Response(Buffer.alloc(maxBytes, 127), { headers: { 'Content-Length': String(maxBytes) } }))
  const bytes = await files.download(locator)
  assert.equal(bytes.length, maxBytes)
  assert.equal(bytes[0], 127)
  let read = false, cancelled = false
  const oversized = adapter(() => ({ status: 200, headers: new Headers({ 'Content-Length': String(maxBytes + 1) }),
    body: { getReader() { read = true; throw new Error('must not read') }, async cancel() { cancelled = true } } }))
  await assert.rejects(oversized.files.download(locator), { code: 'CLOUD_FILE_TOO_LARGE' })
  assert.equal(read, false)
  assert.equal(cancelled, true)
})

test('stream byte cap catches absent or misleading Content-Length and cancels the reader', async () => {
  for (const headers of [new Headers(), new Headers({ 'Content-Length': '1' })]) {
    let cancelled = false, reads = 0
    const { files } = adapter(() => new Response(new ReadableStream({
      pull(controller) { reads++; controller.enqueue(new Uint8Array(reads === 1 ? maxBytes : 1)) },
      cancel() { cancelled = true }
    }), { headers }))
    await assert.rejects(files.download(locator), { code: 'CLOUD_FILE_TOO_LARGE' })
    assert.equal(cancelled, true)
    assert.ok(reads <= 3)
  }
  let cancelled = false
  const single = adapter(() => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(maxBytes + 1)) }, cancel() { cancelled = true }
  })))
  await assert.rejects(single.files.download(locator), { code: 'CLOUD_FILE_TOO_LARGE' })
  assert.equal(cancelled, true)
})

test('download rejects partial responses and redacts stream failures; delete failures remain failures', async () => {
  for (const respond of [() => new Response('partial', { status: 206 }),
    () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(`${accessKey} private upstream body`)) } }))]) {
    const { files } = adapter(respond)
    await assert.rejects(files.download(locator), privateError)
  }
  for (const respond of [() => json({ Message: `${accessKey} private upstream body` }, 403),
    () => json({ Code: `${accessKey} private upstream body` }), () => new Response('private upstream body')]) {
    const { files } = adapter(respond)
    await assert.rejects(files.remove(locator), privateError)
  }
})
