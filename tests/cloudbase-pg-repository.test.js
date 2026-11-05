import test from 'node:test'
import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { createPgRepository } from '../backend/cloudbase/pg-repository.js'
import { validateCloudState } from '../backend/cloudbase/repository.js'

const envId = 'invented-pg-course-123'
const accessKey = 'invented-private-api-key'
const base = `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/campus_runtime`
const initial = () => ({ schemaVersion: 1, snapshot: { schemaVersion: 1, records: [], receipts: [],
  settings: [{ name: 'cursor_secret', value: 'a'.repeat(64) }], sequence: 0 }, game: null, files: {}, cleanup: [] })
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const clone = value => structuredClone(value)
function privateError(error) {
  const text = inspect(error, { depth: 9 })
  assert.ok(!text.includes(accessKey))
  assert.ok(!text.includes('private upstream response'))
  assert.equal(error.cause, undefined)
  return true
}

function fakePg() {
  let stored = null
  const calls = [], controls = { response: null, loseAck: false, emptyAck: false, serverError: false }
  const repo = createPgRepository({ envId, accessKey, fetch: async (address, options) => {
    calls.push({ address, options })
    assert.equal(options.headers.Authorization, `Bearer ${accessKey}`)
    assert.equal(options.redirect, 'error')
    const url = new URL(address)
    assert.equal(url.origin + url.pathname, base)
    if (controls.response) return controls.response(address, options)
    if (options.method === 'GET') {
      assert.equal(url.searchParams.get('id'), 'eq.primary')
      assert.equal(url.searchParams.get('select'), 'id,version,state')
      return json(stored ? [clone(stored)] : [])
    }
    assert.equal(options.headers.Prefer, 'return=representation')
    assert.ok(!options.headers.Prefer.includes('resolution='))
    const body = JSON.parse(options.body)
    if (options.method === 'POST') {
      assert.equal(url.search, '')
      assert.deepEqual(Object.keys(body).sort(), ['id', 'state', 'version'])
      if (stored) return json({ message: 'duplicate key' }, 409)
      assert.equal(body.id, 'primary')
      assert.equal(body.version, 1)
      stored = clone(body)
    } else {
      assert.equal(options.method, 'PATCH')
      assert.equal(url.searchParams.get('id'), 'eq.primary')
      assert.deepEqual(Object.keys(body).sort(), ['state', 'version'])
      const expected = Number(url.searchParams.get('version').slice(3))
      if (stored?.version !== expected) return json([])
      assert.equal(body.version, expected + 1)
      stored = { id: 'primary', ...clone(body) }
    }
    if (controls.loseAck) throw new Error(`${accessKey} private upstream response`)
    if (controls.emptyAck) return new Response(null, { status: 204 })
    if (controls.serverError) return new Response(`${accessKey} private upstream response`, { status: 503 })
    return json([clone(stored)], options.method === 'POST' ? 201 : 200)
  } })
  return { repo, calls, controls, get stored() { return clone(stored) }, put(value) { stored = clone(value) } }
}

test('shared validator is pure and the PG repository roundtrips all private state fields', async () => {
  const input = initial()
  input.files.image = { fileID: 'pg://campus-private/file.png', size: 1 }
  input.cleanup.push({ fileID: 'pg://campus-private/old.png' })
  input.game = { checkpoint: 'invented' }
  const before = clone(input), validated = validateCloudState(input, 1)
  assert.deepEqual(input, before)
  assert.equal(validated.version, 1)
  const { repo, calls } = fakePg()
  assert.equal(await repo.read(), null)
  const result = await repo.initialize(input)
  assert.deepEqual(result, validated)
  assert.deepEqual(await repo.read(), validated)
  assert.deepEqual(input, before)
  assert.deepEqual(calls.map(call => call.options.method), ['GET', 'POST', 'GET'])
})

test('initialization is an atomic unique insert and refuses any overwrite', async () => {
  const fake = fakePg()
  const first = await fake.repo.initialize(initial())
  const changed = initial(); changed.game = { replaced: true }
  await assert.rejects(fake.repo.initialize(changed), { code: 'CLOUD_STATE_CONFLICT' })
  assert.deepEqual(fake.stored.state, first)
  assert.deepEqual(fake.calls.map(call => call.options.method), ['POST', 'POST'])
})

test('single PATCH atomically compares version; concurrent callers have exactly one winner', async () => {
  const fake = fakePg()
  const before = await fake.repo.initialize(initial())
  const left = { ...before, game: { winner: 'left' } }, right = { ...before, game: { winner: 'right' } }
  fake.calls.length = 0
  const results = await Promise.allSettled([fake.repo.compareAndSwap(1, left), fake.repo.compareAndSwap(1, right)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'CLOUD_STATE_CONFLICT')
  assert.equal(fake.stored.version, 2)
  assert.equal(fake.stored.state.version, 2)
  assert.equal(fake.stored.state.game.winner, 'left')
  assert.deepEqual(fake.calls.map(call => call.options.method), ['PATCH', 'PATCH'])
  assert.ok(fake.calls.every(call => new URL(call.address).searchParams.get('version') === 'eq.1'))
  await assert.rejects(fake.repo.compareAndSwap(1, left), { code: 'CLOUD_STATE_CONFLICT' })
})

test('lost, empty or 5xx write acknowledgements remain uncertain without retries after committing', async () => {
  for (const control of ['loseAck', 'emptyAck', 'serverError']) {
    for (const initializing of [true, false]) {
      const fake = fakePg()
      if (!initializing) await fake.repo.initialize(initial())
      fake.calls.length = 0
      fake.controls[control] = true
      const write = initializing ? fake.repo.initialize(initial()) : fake.repo.compareAndSwap(1, initial())
      await assert.rejects(write, error => { assert.equal(error.code, 'CLOUD_STATE_COMMIT_UNCERTAIN'); return privateError(error) })
      assert.equal(fake.calls.length, 1)
      assert.equal(fake.stored.version, initializing ? 1 : 2)
    }
  }
})

test('explicit 4xx writes fail definitely, while only initialization 409 is a conflict', async () => {
  for (const status of [400, 401, 403, 404, 409, 429]) {
    const fake = fakePg()
    fake.controls.response = () => new Response(`${accessKey} private upstream response`, { status })
    await assert.rejects(fake.repo.initialize(initial()), error => {
      assert.equal(error.code, status === 409 ? 'CLOUD_STATE_CONFLICT' : 'CLOUD_STATE_WRITE_FAILED')
      return privateError(error)
    })
    await assert.rejects(fake.repo.compareAndSwap(1, initial()), error => {
      assert.equal(error.code, 'CLOUD_STATE_WRITE_FAILED'); return privateError(error)
    })
    assert.equal(fake.calls.length, 2)
  }
})

test('successful write requires one matching, validated id/version/state representation', async () => {
  const state = validateCloudState(initial(), 2)
  for (const payload of [null, {}, [], [{ id: 'other', version: 2, state }],
    [{ id: 'primary', version: 3, state: { ...state, version: 3 } }],
    [{ id: 'primary', version: 2, state: { ...state, version: 1 } }],
    [{ id: 'primary', version: 2, state: { ...state, game: { unexpected: true } } }],
    [{ id: 'primary', version: 2, state }, { id: 'primary', version: 2, state }],
    [{ id: 'primary', version: 2, state: { ...state, snapshot: null } }]]) {
    const fake = fakePg(); fake.controls.response = () => json(payload)
    await assert.rejects(fake.repo.compareAndSwap(1, initial()), error => {
      assert.equal(error.code, Array.isArray(payload) && !payload.length ? 'CLOUD_STATE_CONFLICT' : 'CLOUD_STATE_COMMIT_UNCERTAIN')
      return privateError(error)
    })
    assert.equal(fake.calls.length, 1)
  }
  const fake = fakePg(); fake.controls.response = () => json([])
  await assert.rejects(fake.repo.initialize(initial()), { code: 'CLOUD_STATE_COMMIT_UNCERTAIN' })
})

test('PG JSONB property order changes do not turn a valid confirmation into an uncertain commit', async () => {
  const fake = fakePg()
  const state = validateCloudState(initial(), 1)
  fake.controls.response = () => json([{ state: Object.fromEntries(Object.entries(state).reverse()), version: 1, id: 'primary' }], 201)
  assert.deepEqual(await fake.repo.initialize(initial()), state)
})

test('local schema, version, cap and identifier failures occur before dispatch', async () => {
  const fake = fakePg()
  for (const state of [{}, { ...initial(), snapshot: { ...initial().snapshot, schemaVersion: 2 } },
    { ...initial(), game: { tooMuch: 'x'.repeat(4 * 1024 * 1024) } }, { ...initial(), version: 9 }])
    await assert.rejects(fake.repo.initialize(state), { code: 'CLOUD_STATE_INVALID' })
  for (const version of [0, -1, 1.1, '1', Number.MAX_SAFE_INTEGER - 1])
    await assert.rejects(fake.repo.compareAndSwap(version, initial()), { code: 'CLOUD_STATE_INVALID' })
  const circular = initial(); circular.game = circular
  await assert.rejects(fake.repo.initialize(circular), { code: 'CLOUD_STATE_INVALID' })
  for (const change of [{ envId: 'x.evil' }, { envId: 'x/../y' }, { table: 'table?x' }, { table: '../x' },
    { document: 'primary&version=eq.7' }, { accessKey: 'bad\r\nheader' }, { maxBytes: 4 * 1024 * 1024 + 1 }])
    assert.throws(() => createPgRepository({ envId, accessKey, ...change }), { code: 'CLOUD_STATE_INVALID' })
  assert.equal(fake.calls.length, 0)
})

test('read rejects corrupt rows, bad JSON, missing bodies and HTTP errors without a fallback', async () => {
  const state = validateCloudState(initial(), 1)
  for (const response of [() => json({ data: [] }), () => json([null]), () => json([{}]),
    () => json([{ id: 'primary', version: 1, state: { ...state, version: 2 } }]),
    () => json([{ id: 'primary', version: Number.MAX_SAFE_INTEGER + 1, state }]),
    () => new Response(`${accessKey} private upstream response`), () => new Response(null, { status: 204 }),
    () => new Response(`${accessKey} private upstream response`, { status: 500 })]) {
    const fake = fakePg(); fake.controls.response = response
    await assert.rejects(fake.repo.read(), privateError)
    assert.equal(fake.calls.length, 1)
  }
})

test('redirects and malicious response URLs never become success or expose credentials', async () => {
  for (const response of [() => new Response(null, { status: 307, headers: { Location: 'https://evil.example' } }),
    () => ({ status: 200, redirected: true, headers: new Headers(), body: null }),
    () => ({ status: 200, url: 'https://evil.example', headers: new Headers(), body: null }), () => undefined]) {
    const fake = fakePg(); fake.controls.response = response
    await assert.rejects(fake.repo.read(), error => { assert.equal(error.code, 'CLOUD_STATE_READ_FAILED'); return privateError(error) })
    await assert.rejects(fake.repo.initialize(initial()), { code: 'CLOUD_STATE_COMMIT_UNCERTAIN' })
    assert.equal(fake.calls.length, 2)
    assert.ok(fake.calls.every(call => call.address.startsWith(base) && call.options.redirect === 'error'))
  }
})

test('streamed reply bytes are capped even with no length or a false short length', async () => {
  const small = 1024
  for (const headers of [new Headers(), new Headers({ 'Content-Length': '1' })]) {
    let cancelled = false
    const repo = createPgRepository({ envId, accessKey, maxBytes: small, fetch: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(small + 1024 * 1024 + 1)) },
      cancel() { cancelled = true }
    }), { headers }) })
    await assert.rejects(repo.read(), { code: 'CLOUD_STATE_INVALID' })
    assert.equal(cancelled, true)
  }
  let cancelled = false, read = false
  const repo = createPgRepository({ envId, accessKey, maxBytes: small, fetch: async () => ({ status: 200,
    headers: new Headers({ 'Content-Length': String(small + 1024 * 1024 + 1) }),
    body: { async cancel() { cancelled = true }, getReader() { read = true; throw new Error('must not read') } } }) })
  await assert.rejects(repo.initialize(initial()), { code: 'CLOUD_STATE_COMMIT_UNCERTAIN' })
  assert.equal(cancelled, true)
  assert.equal(read, false)
})

test('stream errors and invalid write JSON are redacted and uncertain, with exactly one request', async () => {
  for (const response of [() => new Response(new ReadableStream({ start(controller) {
    controller.error(new Error(`${accessKey} private upstream response`))
  } })), () => new Response(`${accessKey} private upstream response`)]) {
    const fake = fakePg(); fake.controls.response = response
    await assert.rejects(fake.repo.compareAndSwap(1, initial()), error => {
      assert.equal(error.code, 'CLOUD_STATE_COMMIT_UNCERTAIN'); return privateError(error)
    })
    assert.equal(fake.calls.length, 1)
  }
})
