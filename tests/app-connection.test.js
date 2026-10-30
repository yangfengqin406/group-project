import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { APP_CONNECTION_KEY, normalizeAppOrigin, createAppConnectionPreferences, loadAppConnection } from '../src/platform/app-connection.js'
import { ServiceError } from '../src/utils/errors.js'

const OLD = 'https://old.example', NEXT = 'https://next.example', DEFAULT = 'https://default.example'
const tokenKey = (origin) => `campus-plaza-token:http:${origin}/api`
const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const plainSource = (name) => read(name).replace(/^import .*$/gm, '').replace(/export /g, '')

function fixture({ origin = OLD, defaultOrigin = DEFAULT, saved = { origin: OLD }, runtime, health, failSet, failRemove } = {}) {
  const storage = new Map([[APP_CONNECTION_KEY, saved], [tokenKey(OLD), 'old-token'], [tokenKey(NEXT), 'target-old-token']])
  const requests = [], events = []
  const uni = {
    getStorageSync: (key) => storage.has(key) ? storage.get(key) : '',
    setStorageSync(key, value) { if (failSet?.(key, value)) throw new Error('write denied'); storage.set(key, value) },
    removeStorageSync(key) { if (failRemove?.(key)) throw new Error('remove denied'); storage.delete(key) },
    request(options) {
      requests.push(options)
      if (options.url.endsWith('/health')) {
        if (health) health(options)
        else options.success({ statusCode: 200, data: { code: 'OK', data: { mode: 'local-persistent', database: 'sqlite' } } })
      }
    }
  }
  const preferences = createAppConnectionPreferences(() => uni)
  const context = vm.createContext({
    uni, ServiceError, Promise, setTimeout, clearTimeout,
    config: { apiMode: 'http', apiBaseUrl: `${origin}/api`, gameBaseUrl: `${origin}/game`, defaultAppOrigin: defaultOrigin },
    reactive: (value) => value, normalizeAppOrigin, createAppConnectionPreferences: () => preferences,
    messageAlerts: { stop: () => events.push('messages-stop'), reset: () => events.push('messages-reset'), start: () => events.push('messages-start') },
    soundscape: { setVisible(value) { events.push(['sound-visible', value]); return Promise.resolve() } },
    plus: { runtime: runtime ?? { restart() { events.push('restart') } } },
    mockRequest: () => { throw new Error('mock must not run') }, ensurePhonePreview: () => Promise.resolve()
  })
  vm.runInContext(plainSource('utils/session.js') + '\nglobalThis.sessionApi={session,getToken,setToken,setSession,prepareConnectionSession};', context)
  context.sessionApi.setSession({ id: 'old-user' })
  vm.runInContext(plainSource('services/connection.js') + '\nglobalThis.connectionFactory=createConnectionService;', context)
  const service = context.connectionFactory()
  return { storage, requests, events, preferences, service, context, sessionApi: context.sessionApi }
}

test('HTTPS origins are validated without URL and normalize only host case/default port', (t) => {
  const previous = globalThis.URL
  t.after(() => { globalThis.URL = previous })
  globalThis.URL = undefined
  assert.equal(normalizeAppOrigin('HTTPS://Example.COM:443'), 'https://example.com')
  assert.equal(normalizeAppOrigin('https://example.com:8443'), 'https://example.com:8443')
  assert.equal(normalizeAppOrigin('https://example.com/'), 'https://example.com')
  assert.equal(normalizeAppOrigin('https://[2001:db8::1]:8443'), 'https://[2001:db8::1]:8443')
  for (const input of ['http://example.com', 'https://user:pass@example.com', 'https://x.example//', 'https://x.example/api', 'https://x.example?x=1', 'https://x.example#x', 'https://x.example\\evil', 'https://x.example\r\nX:x', ' https://x.example', 'https://x.example:0', 'https://x.example:65536', 'https://x.example:0443', 'https://a..example', 'https://-bad.example', 'https://127.1', 'https://999.1.1.1', 'https://[:::1]', 'https://[1:2:3]'])
    assert.throws(() => normalizeAppOrigin(input), { code: 'INVALID_ARGUMENT' }, input)
})

test('startup selects saved API/game before plus is ready; H5/MP keep build parameters', () => {
  const f = fixture({ saved: { origin: NEXT } })
  for (const native of [true, false]) {
    const source = read('config/index.js').replace(/\/\/ #ifdef APP-PLUS\r?\n([\s\S]*?)\/\/ #endif/g, (_, body) => native ? body : '')
      .replace(/^import .*$/gm, '').replace(/import\.meta\.env/g, 'env').replace(/export /g, '')
    let reads = 0
    const context = vm.createContext({ env: { VITE_API_MODE: 'mock', VITE_API_BASE_URL: `${DEFAULT}/api`, VITE_GAME_BASE_URL: 'https://games.example/game' }, loadAppConnection: (base) => { reads++; return loadAppConnection(base, f.preferences) } })
    vm.runInContext(source + '\nglobalThis.result=config;', context)
    assert.equal(context.result.apiBaseUrl, `${native ? NEXT : DEFAULT}/api`)
    assert.equal(context.result.gameBaseUrl, native ? `${NEXT}/game` : 'https://games.example/game')
    assert.equal(context.result.apiMode, native ? 'http' : 'mock')
    assert.equal(reads, native ? 1 : 0)
  }
})

test('damaged or unreadable preference keeps real default and a visible error, never mock success', () => {
  const f = fixture({ saved: { origin: NEXT, token: 'not-allowed' } })
  const boot = loadAppConnection(`${DEFAULT}/api`, f.preferences)
  assert.equal(boot.apiBaseUrl, `${DEFAULT}/api`)
  assert.match(boot.error, /损坏/)
  assert.equal(f.service.getState().supported, true)
  assert.match(f.service.getState().error, /损坏/)
  const failed = createAppConnectionPreferences(() => ({ getStorageSync() { throw new Error('read denied') }, setStorageSync() {}, removeStorageSync() {} }))
  assert.match(loadAppConnection(`${DEFAULT}/api`, failed).error, /读取失败/)
})

test('health check is anonymous and saves only origin; success clears both source and target tokens then restarts', async () => {
  const f = fixture()
  assert.deepEqual({ ...f.service.getState() }, { supported: true, currentOrigin: OLD, defaultOrigin: DEFAULT, usesOverride: true })
  assert.equal((await f.service.switchTo(NEXT)).restarting, true)
  const request = f.requests[0]
  assert.equal(request.url, `${NEXT}/api/health`)
  assert.equal(request.method, 'GET')
  assert.equal(request.header.Authorization, undefined)
  assert.equal(request.header.Cookie, '')
  assert.equal(request.data, undefined)
  assert.equal(request.withCredentials, false)
  assert.deepEqual(f.storage.get(APP_CONNECTION_KEY), { origin: NEXT })
  assert.equal(f.storage.has(tokenKey(OLD)), false)
  assert.equal(f.storage.has(tokenKey(NEXT)), false)
  assert.equal(f.sessionApi.session.user, null)
  assert.throws(() => f.sessionApi.getToken(), { code: 'CONFLICT' })
  assert.deepEqual(f.events, ['messages-stop', 'messages-reset', ['sound-visible', false], 'restart'])
  assert.equal(loadAppConnection(`${DEFAULT}/api`, f.preferences).origin, NEXT)
  assert.equal(f.requests.some(request => request.data?.method === 'auth.logout'), false)
})

test('wrong/failed campus health responses never save, clear login or restart', async () => {
  for (const response of [{ statusCode: 502, data: {} }, { statusCode: 200, data: { code: 'OK', data: { mode: 'mock', database: 'sqlite' } } }, { statusCode: 200, data: { code: 'OK', data: { mode: 'local-persistent', database: 'mysql' } } }, { statusCode: 200, data: null }, null]) {
    const f = fixture({ health: options => response ? options.success(response) : options.fail({ errMsg: 'timeout' }) })
    await assert.rejects(f.service.switchTo(NEXT), { code: 'SERVICE_UNAVAILABLE' })
    assert.equal(f.storage.get(APP_CONNECTION_KEY).origin, OLD)
    assert.equal(f.sessionApi.getToken(), 'old-token')
    assert.equal(f.sessionApi.session.user.id, 'old-user')
    assert.equal(f.events.length, 0)
  }
})

test('hidden/cancelled page invalidates a late health check; competing switches do not race', async () => {
  let finish, active = true
  const f = fixture({ health: options => { finish = options.success } })
  const pending = f.service.switchTo(NEXT, { current: () => active })
  await assert.rejects(f.service.switchTo('https://other.example'), { code: 'CONFLICT' })
  active = false
  finish({ statusCode: 200, data: { code: 'OK', data: { mode: 'local-persistent', database: 'sqlite' } } })
  await assert.rejects(pending, { code: 'CONFLICT' })
  assert.equal(f.storage.get(APP_CONNECTION_KEY).origin, OLD)
  assert.equal(f.sessionApi.getToken(), 'old-token')
  assert.equal(f.events.length, 0)
})

test('preference write failure rolls back source/target tokens and session and releases switch lock', async () => {
  const f = fixture({ failSet: (key, value) => key === APP_CONNECTION_KEY && value.origin === NEXT })
  await assert.rejects(f.service.switchTo(NEXT), { code: 'SERVICE_UNAVAILABLE' })
  assert.equal(f.storage.get(APP_CONNECTION_KEY).origin, OLD)
  assert.equal(f.sessionApi.getToken(), 'old-token')
  assert.equal(f.storage.get(tokenKey(NEXT)), 'target-old-token')
  assert.equal(f.sessionApi.session.user.id, 'old-user')
  assert.equal(f.events.includes('restart'), false)
  f.sessionApi.setToken('still-usable')
  assert.equal(f.sessionApi.getToken(), 'still-usable')
})

test('hiding while services stop rolls back the connection without restarting foreground polling', async () => {
  const f = fixture()
  let active = true, release
  const service = f.context.connectionFactory({ stopServices: () => new Promise(resolve => { release = resolve }) })
  const pending = service.switchTo(NEXT, { current: () => active })
  const rejected = assert.rejects(pending, { code: 'CONFLICT' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.sessionApi.session.user, null)
  active = false
  release()
  await rejected
  assert.equal(f.events.includes('messages-start'), false)
  assert.equal(f.events.includes('restart'), false)
  assert.equal(f.storage.get(APP_CONNECTION_KEY).origin, OLD)
  assert.equal(f.sessionApi.getToken(), 'old-token')
  assert.equal(f.sessionApi.session.user.id, 'old-user')
})

test('missing/throwing/rejected/refused native restart cannot leave the new preference or erased account', async () => {
  for (const runtime of [{}, { restart() { throw new Error('failed') } }, { restart: () => Promise.reject(new Error('failed')) }, { restart: () => false }]) {
    const f = fixture({ runtime })
    await assert.rejects(f.service.switchTo(NEXT), error => ['NOT_SUPPORTED', 'SERVICE_UNAVAILABLE'].includes(error.code))
    assert.equal(f.storage.get(APP_CONNECTION_KEY).origin, OLD)
    assert.equal(f.sessionApi.getToken(), 'old-token')
    assert.equal(f.storage.get(tokenKey(NEXT)), 'target-old-token')
    assert.equal(f.sessionApi.session.user.id, 'old-user')
  }
})

test('restore default clears even damaged override without contacting an offline default', async () => {
  const f = fixture({ saved: { broken: true }, health: () => { throw new Error('must not probe') } })
  assert.ok(f.service.getState().error)
  assert.equal((await f.service.restoreDefault()).restarting, true)
  assert.equal(f.storage.has(APP_CONNECTION_KEY), false)
  assert.equal(f.requests.length, 0)
  assert.equal(loadAppConnection(`${DEFAULT}/api`, f.preferences).origin, DEFAULT)
})

test('failed restore default puts the exact damaged preference back and keeps original login', async () => {
  const f = fixture({ saved: 'damaged-old-value', runtime: { restart: () => false } })
  await assert.rejects(f.service.restoreDefault(), { code: 'SERVICE_UNAVAILABLE' })
  assert.equal(f.storage.get(APP_CONNECTION_KEY), 'damaged-old-value')
  assert.equal(f.sessionApi.getToken(), 'old-token')
  assert.equal(f.sessionApi.session.user.id, 'old-user')
})

test('a late old-source login cannot restore credentials during native restart', async () => {
  const f = fixture()
  vm.runInContext(plainSource('services/transport.js') + '\nglobalThis.call=call;', f.context)
  vm.runInContext(plainSource('services/auth.js') + '\nglobalThis.loginApi=login;', f.context)
  const login = f.context.loginApi({ type: 'h5' })
  const rejected = assert.rejects(login, { code: 'CONFLICT' })
  const loginRequest = f.requests.find(request => request.data?.method === 'auth.login')
  await f.service.switchTo(NEXT)
  loginRequest.success({ statusCode: 200, data: { code: 'OK', data: { token: 'late-old-token', user: { id: 'late-old-user' } } } })
  await rejected
  assert.equal(f.storage.has(tokenKey(OLD)), false)
  assert.equal(f.storage.has(tokenKey(NEXT)), false)
  assert.equal(f.sessionApi.session.user, null)
})

test('non-App connection API is explicitly unsupported and never reads preference storage', async () => {
  const f = fixture()
  const service = f.context.connectionFactory({ supported: false, preferences: { read() { throw new Error('not allowed') } } })
  assert.equal(service.getState().supported, false)
  await assert.rejects(service.switchTo(NEXT), { code: 'NOT_SUPPORTED' })
  await assert.rejects(service.restoreDefault(), { code: 'NOT_SUPPORTED' })
  assert.equal(f.requests.length, 0)
})
