import test from 'node:test'
import assert from 'node:assert/strict'
import { createPushWakeup } from '../backend/cloudbase/push-wakeup.js'

const timestamp = 1700000000123
const jobs = ['a'.repeat(64), 'b'.repeat(64)]
const configuration = () => ({
  CAMPUS_PUSH_WORKER_FUNCTION: 'campus-push-worker',
  CAMPUS_CLOUDBASE_ENV: 'happy-catfish-test',
  TENCENTCLOUD_REGION: 'ap-shanghai',
  TENCENTCLOUD_SECRETID: 'AKIDEXAMPLE000000000000000000000000',
  TENCENTCLOUD_SECRETKEY: 'example-secret-key-1234567890',
  TENCENTCLOUD_SESSIONTOKEN: 'example-session-token',
  CAMPUS_PUSH_BRIDGE_SECRET: 'c'.repeat(64)
})
const accepted = () => new Response(JSON.stringify({ Response: {
  Result: { InvokeResult: 0 }, RequestId: 'request-accepted'
} }))
const invalid = error => error.code === 'CLOUD_PUSH_WAKEUP_INVALID'
const unavailable = error => error.code === 'CLOUD_PUSH_WAKEUP_UNAVAILABLE' && !error.cause

test('SCF wakeup signs a fixed asynchronous request and authenticates its bounded job event', async () => {
  let request
  const wakeup = createPushWakeup({ env: configuration(), now: () => timestamp,
    fetcher: async (url, options) => { request = { url, ...options }; return accepted() } })
  assert.deepEqual(await wakeup.wake(jobs), { accepted: true })
  assert.equal(request.url, 'https://scf.tencentcloudapi.com/')
  assert.equal(request.method, 'POST')
  assert.equal(request.redirect, 'error')
  assert.equal(request.credentials, 'omit')
  assert.equal(request.headers['X-TC-Action'], 'Invoke')
  assert.equal(request.headers['X-TC-Version'], '2018-04-16')
  assert.equal(request.headers['X-TC-Region'], 'ap-shanghai')
  assert.equal(request.headers['X-TC-Timestamp'], '1700000000')
  assert.equal(request.headers['X-TC-Token'], 'example-session-token')
  assert.equal(request.headers['Content-Type'], 'application/json; charset=utf-8')
  assert.equal(request.headers.Host, 'scf.tencentcloudapi.com')
  const body = JSON.parse(request.body)
  assert.deepEqual(Object.keys(body), ['FunctionName', 'Namespace', 'InvocationType', 'ClientContext'])
  assert.equal(body.FunctionName, 'campus-push-worker')
  assert.equal(body.Namespace, 'happy-catfish-test')
  assert.equal(body.InvocationType, 'Event')
  assert.deepEqual(JSON.parse(body.ClientContext), { type: 'campus-push-wakeup', jobIds: jobs, timestamp,
    signature: '8f1c5bca4257a4ac2cd74353dbdfff47834e08f4e8f343b244bcf7793366d12d' })
  // These fixed vectors were calculated independently with .NET SHA256/HMAC
  // from the Tencent TC3 canonical request, including its blank header line.
  assert.equal(request.headers.Authorization,
    'TC3-HMAC-SHA256 Credential=AKIDEXAMPLE000000000000000000000000/2023-11-14/scf/tc3_request, ' +
    'SignedHeaders=content-type;host, Signature=cb2c65d153c3306f01b9b1447c91555c740ef55cd2f8c61f1747a97a2ef1dddf')
  assert.ok(!request.body.includes('example-session-token'))
  assert.ok(!request.body.includes('example-secret-key'))
})

test('disabled wakeup is inert and configured wakeup rejects incomplete or unsafe server settings', () => {
  assert.equal(createPushWakeup({ env: {} }), null)
  assert.equal(createPushWakeup({ env: { CAMPUS_PUSH_WORKER_FUNCTION: '' } }), null)
  for (const field of ['CAMPUS_CLOUDBASE_ENV', 'TENCENTCLOUD_REGION', 'TENCENTCLOUD_SECRETID',
    'TENCENTCLOUD_SECRETKEY', 'TENCENTCLOUD_SESSIONTOKEN', 'CAMPUS_PUSH_BRIDGE_SECRET']) {
    const env = configuration()
    delete env[field]
    assert.throws(() => createPushWakeup({ env }), invalid, field)
  }
  const unsafe = [
    ['CAMPUS_PUSH_WORKER_FUNCTION', 'worker/another'],
    ['CAMPUS_PUSH_WORKER_FUNCTION', 'x'.repeat(61)],
    ['CAMPUS_CLOUDBASE_ENV', 'wrong/namespace'],
    ['CAMPUS_CLOUDBASE_ENV', 'Uppercase'],
    ['TENCENTCLOUD_REGION', 'ap-shanghai\nX-TC-Action:DeleteFunction'],
    ['TENCENTCLOUD_SECRETID', 'id\r\nheader'],
    ['TENCENTCLOUD_SECRETKEY', ''],
    ['TENCENTCLOUD_SESSIONTOKEN', 'token with spaces'],
    ['CAMPUS_PUSH_BRIDGE_SECRET', 'too-short']
  ]
  for (const [field, value] of unsafe) assert.throws(() => createPushWakeup({ env: { ...configuration(), [field]: value } }), invalid, field)
  assert.throws(() => createPushWakeup({ env: configuration(), fetcher: null }), invalid)
  assert.throws(() => createPushWakeup({ env: configuration(), now: null }), invalid)
})

test('SCF wakeup reads rotated temporary credentials and bridge secret for each invocation', async () => {
  const env = configuration(), requests = []
  const wakeup = createPushWakeup({ env, now: () => timestamp,
    fetcher: async (url, options) => { requests.push(options); return accepted() } })
  await wakeup.wake([jobs[0]])
  env.TENCENTCLOUD_SECRETID = 'AKIDROTATED000000000000000000000000'
  env.TENCENTCLOUD_SECRETKEY = 'rotated-secret-key'
  env.TENCENTCLOUD_SESSIONTOKEN = 'rotated-session-token'
  env.CAMPUS_PUSH_BRIDGE_SECRET = 'd'.repeat(64)
  await wakeup.wake([jobs[0]])
  assert.match(requests[1].headers.Authorization, /Credential=AKIDROTATED/)
  assert.notEqual(requests[1].headers.Authorization, requests[0].headers.Authorization)
  assert.equal(requests[1].headers['X-TC-Token'], 'rotated-session-token')
  const events = requests.map(request => JSON.parse(JSON.parse(request.body).ClientContext))
  assert.notEqual(events[1].signature, events[0].signature)
  delete env.TENCENTCLOUD_SESSIONTOKEN
  await assert.rejects(wakeup.wake([jobs[0]]), invalid)
  assert.equal(requests.length, 2)
})

test('wakeup rejects empty, oversized, duplicate or forged job identifiers before networking', async () => {
  let calls = 0
  const wakeup = createPushWakeup({ env: configuration(), now: () => timestamp,
    fetcher: async () => { calls++; return accepted() } })
  for (const value of [null, {}, [], [jobs[0], jobs[0]], ['A'.repeat(64)], ['not-a-job'],
    [jobs[0], '1'.repeat(64), '2'.repeat(64), '3'.repeat(64), '4'.repeat(64), '5'.repeat(64)]]) {
    await assert.rejects(wakeup.wake(value), invalid)
  }
  assert.equal(calls, 0)
  const ids = [jobs[0]]
  const promise = wakeup.wake(ids)
  ids[0] = 'changed-after-start'
  assert.deepEqual(await promise, { accepted: true })
  assert.equal(calls, 1)
})

test('invalid signing clocks fail before sending a request', async () => {
  let calls = 0
  for (const clock of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
    const wakeup = createPushWakeup({ env: configuration(), now: () => clock,
      fetcher: async () => { calls++; return accepted() } })
    await assert.rejects(wakeup.wake([jobs[0]]), invalid)
  }
  assert.equal(calls, 0)
})

test('only explicit SCF acceptance is successful and provider response details stay private', async t => {
  const denied = [
    ['HTTP error', () => new Response('upstream-private-text', { status: 503 })],
    ['redirect', () => ({ status: 200, redirected: true })],
    ['different origin', () => ({ status: 200, url: 'https://another.example/' })],
    ['missing body', () => ({ status: 200, headers: new Headers() })],
    ['malformed JSON', () => new Response('{')],
    ['API error', () => new Response(JSON.stringify({ Response: {
      Error: { Code: 'Denied', Message: 'upstream-private-text' }, RequestId: 'r'
    } }))],
    ['missing result', () => new Response(JSON.stringify({ Response: { RequestId: 'r' } }))],
    ['failed invoke', () => new Response(JSON.stringify({ Response: { Result: { InvokeResult: 1 }, RequestId: 'r' } }))],
    ['string success', () => new Response(JSON.stringify({ Response: { Result: { InvokeResult: '0' }, RequestId: 'r' } }))],
    ['missing request ID', () => new Response(JSON.stringify({ Response: { Result: { InvokeResult: 0 } } }))],
    ['oversized header', () => new Response('{}', { headers: { 'content-length': '16385' } })],
    ['invalid length', () => new Response('{}', { headers: { 'content-length': '-1' } })],
    ['oversized streamed JSON', () => new Response(' '.repeat(16384) + JSON.stringify({ Response: { Result: { InvokeResult: 0 }, RequestId: 'r' } }))]
  ]
  for (const [name, response] of denied) await t.test(name, async () => {
    const wakeup = createPushWakeup({ env: configuration(), now: () => timestamp, fetcher: async () => response() })
    await assert.rejects(wakeup.wake([jobs[0]]), error => unavailable(error) && !error.message.includes('upstream-private-text'))
  })
  const wakeup = createPushWakeup({ env: configuration(), now: () => timestamp,
    fetcher: async () => { throw new Error('upstream-private-text example-session-token') } })
  await assert.rejects(wakeup.wake([jobs[0]]), error => unavailable(error) && !error.message.includes('example-session-token'))
})

test('SCF wakeup has a two-second deadline and aborts an unresponsive HTTP request', { timeout: 5000 }, async () => {
  let signal
  const wakeup = createPushWakeup({ env: configuration(), now: () => timestamp,
    fetcher: (url, options) => { signal = options.signal; return new Promise(() => {}) } })
  await assert.rejects(wakeup.wake([jobs[0]]), unavailable)
  assert.equal(signal.aborted, true)
})
