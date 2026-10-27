import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function transport(mode = 'http', previewReady) {
  const requests = [], session = { user: null }
  let token = 'saved-real-token', loginRequests = 0
  const context = vm.createContext({
    config: { apiMode: mode, apiBaseUrl: '/api', phonePreviewDebug: Boolean(previewReady) }, session,
    ensurePhonePreview: previewReady || (() => Promise.resolve()),
    getToken: () => token, setToken: (value) => { token = value }, setSession: (value) => { session.user = value },
    openLogin: () => { loginRequests++ }, mockRequest: async () => ({ code: 'OK', data: { items: [] } }),
    ServiceError: class extends Error { constructor(code, message) { super(message); this.code = code } },
    uni: { request: (options) => requests.push(options) }
  })
  const source = readFileSync(new URL('../src/services/transport.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/export /g, '')
  vm.runInContext(source + '\nglobalThis.api = { call, restoreIdentity }', context)
  const reply = (index, data, code = 'OK') => requests[index].success({ statusCode: 200, data: { code, data, message: code === 'OK' ? '' : '登录已过期' } })
  return { ...context.api, session, requests, reply, setToken: (value) => { token = value }, get loginRequests() { return loginRequests } }
}
const flush = () => new Promise((done) => setImmediate(done))

test('手机预览在调试准备完成前不发身份或业务HTTP请求，默认构建不等待',async()=>{
  let release,preparations=0
  const ready=new Promise(resolve=>{release=resolve})
  const f=transport('http',()=>{preparations++;return ready})
  const pending=f.call('pet.get')
  await flush();assert.equal(f.requests.length,0)
  release();await flush();assert.ok(preparations>=1);assert.equal(f.requests.length,1)
  f.reply(0,{id:'author'});await flush();assert.equal(f.requests.length,2)
  f.reply(1,{species:'rabbit'});assert.equal((await pending).species,'rabbit')
})

test('微信域名、超时、证书失败各自提示且不改变账号或回退演示',async()=>{
  for(const [errMsg,expected] of [['request:fail url not in domain list',/域名/],['request:fail timeout',/超时/],['request:fail SSL handshake error',/HTTPS/],['request:fail disconnected',/网络连接失败/]]){
    const f=transport();f.session.user={id:'author'}
    const pending=f.call('pet.get'),rejected=assert.rejects(pending,error=>error.code==='SERVICE_UNAVAILABLE'&&expected.test(error.message))
    await flush();f.requests[0].fail({errMsg});await rejected
    assert.equal(f.session.user.id,'author');assert.equal(f.loginRequests,0);assert.equal(f.requests.length,1)
  }
})

test('HTTP冷启动共享一次身份恢复，详情和预约请求在当前身份确定后发出', async () => {
  const f = transport()
  const startup = f.restoreIdentity(), detail = f.call('market.get', { id: 'sale' }), reservations = f.call('market.getCandidates', { id: 'sale' })
  await flush()
  assert.equal(f.requests.length, 1)
  assert.equal(f.requests[0].data.method, 'user.getProfile')
  f.reply(0, { id: 'author', nickname: '作者' })
  await startup; await flush()
  assert.equal(f.session.user.id, 'author')
  assert.equal(f.requests.length, 3)
  f.reply(1, { id: 'sale', ownerId: 'author' }); f.reply(2, { items: [] })
  assert.equal((await detail).ownerId, 'author'); await reservations
})

test('冷启动过期令牌明确拒绝并去登录，不发送未授权的后续业务', async () => {
  const f = transport(), pending = f.call('market.get', { id: 'sale' })
  const rejected = assert.rejects(pending, { code: 'UNAUTHENTICATED' })
  await flush(); f.reply(0, null, 'UNAUTHENTICATED'); await rejected
  assert.equal(f.requests.length, 1); assert.equal(f.loginRequests, 1); assert.equal(f.session.user, null)
})

test('旧令牌的迟到身份恢复不覆盖新账号，mock启动保持原行为', async () => {
  const f = transport(), pending = f.restoreIdentity()
  await flush(); f.setToken('new-token'); f.session.user = { id: 'new-user' }
  f.reply(0, { id: 'old-user' }); await pending
  assert.equal(f.session.user.id, 'new-user')
  const mock = transport('mock')
  await mock.restoreIdentity(); await mock.call('market.list')
  assert.equal(mock.requests.length, 0); assert.equal(mock.session.user, null)
})

test('旧账号迟到UNAUTHENTICATED不会清除新账号会话或跳登录', async () => {
  const f = transport(), pending = f.restoreIdentity()
  const rejected = assert.rejects(pending, { code: 'UNAUTHENTICATED' })
  await flush(); f.setToken('token-B'); f.session.user = { id: 'B' }
  f.reply(0, null, 'UNAUTHENTICATED'); await rejected
  assert.equal(f.session.user.id, 'B'); assert.equal(f.loginRequests, 0)
})

test('切账号不会将旧账号提交意图用新令牌发送，等待中的新身份独立恢复', async () => {
  const f = transport()
  f.session.user = { id: 'A' }
  const pending = f.call('market.reserve', { id: 'A-intent' })
  const rejected = assert.rejects(pending, { code: 'CONFLICT' })
  f.setToken('token-B'); f.session.user = { id: 'B' }
  await rejected; assert.equal(f.requests.length, 0)
  const g = transport(), old = g.restoreIdentity()
  await flush(); g.setToken('token-B')
  const next = g.restoreIdentity()
  await flush(); assert.equal(g.requests.length, 2)
  g.reply(1, { id: 'B' }); await next
  g.reply(0, { id: 'A' }); await old
  assert.equal(g.session.user.id, 'B')
})

test('认证服务迟到登录/注册/退出不能覆盖另一个账号', async () => {
  const source = readFileSync(new URL('../src/services/auth.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/export /g, '')
  for (const action of ['login', 'register', 'logout']) {
    let token = 'A', user = { id: 'A' }, resolve
    const pending = new Promise((done) => { resolve = done })
    const context = vm.createContext({ call: () => pending, getToken: () => token,
      setToken: (value) => { token = value }, setSession: (value) => { user = value },
      ServiceError: class extends Error { constructor(code, message) { super(message); this.code = code } } })
    vm.runInContext(source + '\nglobalThis.api = { login, register, logout }', context)
    const result = context.api[action]()
    const checked = action === 'logout' ? result : assert.rejects(result, { code: 'CONFLICT' })
    token = 'B'; user = { id: 'B' }; resolve({ token: 'late-A', user: { id: 'A' } }); await checked
    assert.equal(token, 'B'); assert.equal(user.id, 'B')
  }
})

test('旧账号图片上传完成后不以新账号自动确认', async () => {
  let token = 'A', upload, confirmed = 0
  const source = readFileSync(new URL('../src/services/upload.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/export /g, '')
  const context = vm.createContext({ config: { apiMode: 'http', apiBaseUrl: '/api' }, getToken: () => token,
    call: async () => { confirmed++ }, uni: { uploadFile: (options) => { upload = options } },
    ServiceError: class extends Error { constructor(code, message) { super(message); this.code = code } } })
  vm.runInContext(source + '\nglobalThis.api = { create }', context)
  const pending = context.api.create({ usage: 'content', data: 'local-photo' })
  const rejected = assert.rejects(pending, { code: 'CONFLICT' })
  assert.equal(upload.header.Authorization, 'Bearer A')
  token = 'B'; upload.success({ statusCode: 200, data: JSON.stringify({ code: 'OK', data: { imageId: 'A-photo', url: '/A' } }) })
  await rejected; assert.equal(confirmed, 0)
})
