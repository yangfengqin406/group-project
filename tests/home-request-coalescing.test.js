import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'

const strip = source => source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '').replace(/export /g, '')
const flush = async () => { await Vue.nextTick(); await new Promise(resolve => setImmediate(resolve)) }
const profile = id => ({ id, nickname: id })
const emptyPage = { items: [], nextCursor: null }

// Execute the actual request layer, user service and Home setup together. No
// account or network storage is used; every HTTP response is controlled here.
function fixture(t, initialUser = null) {
  const requests = [], session = Vue.reactive({ user: initialUser }), hooks = { show: [], hide: [], unload: [] }
  let token = 'memory-token-a', loginRequests = 0
  const scope = Vue.effectScope()
  const context = vm.createContext({ ...Vue, session, config: { apiMode: 'http', apiBaseUrl: '/api', phonePreviewDebug: false },
    getToken: () => token, setToken: value => { token = value }, setSession: value => { session.user = value },
    openLogin: () => { loginRequests++ }, ServiceError: class extends Error { constructor(code, message) { super(message); this.code = code } },
    uni: { request: options => requests.push(options), navigateTo() {}, showToast() {} }, ensurePhonePreview: async () => {},
    mockRequest: async () => { throw new Error('real failures must not enter mock') }, demoUsers: () => [],
    switchDemoUser() {}, resetDemo() {}, formatTime: value => value, contentNames: {}, contentUrl: () => '',
    openProfile() {}, errorText: error => error.message, requestSubscription: async () => ({}), auth: {},
    onShow: fn => hooks.show.push(fn), onHide: fn => hooks.hide.push(fn), onUnload: fn => hooks.unload.push(fn) })
  vm.runInContext(strip(readFileSync(new URL('../src/services/transport.js', import.meta.url), 'utf8')) +
    '\nglobalThis.transport = { call, restoreIdentity }', context)
  vm.runInContext(strip(readFileSync(new URL('../src/services/user.js', import.meta.url), 'utf8')) +
    '\nglobalThis.user = { getProfile }', context)
  context.myContent = { list: params => context.transport.call('myContent.list', params) }
  context.favorite = { list: params => context.transport.call('favorite.list', params) }
  const source = readFileSync(new URL('../src/pages/home/index.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
  scope.run(() => vm.runInContext(strip(source) + '\nglobalThis.home = { profile, items, error, load, stats, loading }', context))
  t.after(() => scope.stop())
  const reply = (index, data, code = 'OK') => {
    requests[index].done = true
    requests[index].success({ statusCode: 200, data: { code, data, message: code === 'OK' ? '' : '登录已过期' } })
  }
  return { ...context, requests, hooks, reply, setToken: value => { token = value }, get loginRequests() { return loginRequests },
    async finish() {
      for (let round = 0; round < 8; round++) {
        for (let index = 0; index < requests.length; index++) if (!requests[index].done)
          reply(index, requests[index].data.method === 'user.getProfile' ? profile(session.user?.id || 'a') : emptyPage)
        await flush()
      }
    } }
}

test('冷启动身份恢复和本人资料共享在途请求，完成后的主动刷新仍读取后端', async t => {
  const f = fixture(t), startup = f.transport.restoreIdentity(), own = f.user.getProfile()
  await flush()
  assert.equal(f.requests.length, 1)
  f.reply(0, profile('a'))
  assert.equal((await startup).id, 'a'); assert.equal((await own).id, 'a')
  const refresh = f.user.getProfile(); await flush()
  assert.equal(f.requests.length, 2)
  f.reply(1, profile('a')); await refresh
})

test('实际冷启动小屋不重复读取本人资料或发送已失效的首屏内容', async t => {
  const f = fixture(t), startup = f.transport.restoreIdentity()
  f.hooks.show.forEach(fn => fn()); await flush()
  assert.deepEqual(f.requests.map(request => request.data.method), ['user.getProfile'])
  f.reply(0, profile('a')); await startup; await flush(); await f.finish()
  const counts = f.requests.reduce((result, request) => {
    result[request.data.method] = (result[request.data.method] || 0) + 1
    return result
  }, {})
  assert.deepEqual(counts, { 'user.getProfile': 1, 'myContent.list': 2, 'favorite.list': 1 })
  assert.equal(f.home.profile.value.id, 'a'); assert.equal(f.home.loading.value, false)
})

test('已知身份的小屋资料与首屏内容保持并行，不将公开他人资料合并', async t => {
  const f = fixture(t, profile('a'))
  f.hooks.show.forEach(fn => fn()); await flush()
  assert.deepEqual(f.requests.map(request => request.data.method), ['user.getProfile', 'myContent.list'])
  const publicRead = f.user.getProfile({ userId: 'b' }); await flush()
  assert.equal(f.requests.length, 3)
  f.reply(2, profile('b')); assert.equal((await publicRead).id, 'b')
  assert.equal(f.session.user.id, 'a')
  await f.finish(); assert.equal(f.home.profile.value.id, 'a')
})

test('共享本人读取失败后解除在途状态，可手动重试且不清除有效登录或回退演示', async t => {
  const f = fixture(t, profile('a')), first = f.user.getProfile(), second = f.user.getProfile()
  const rejected = [first, second].map(pending => assert.rejects(pending, error => error.code === 'SERVICE_UNAVAILABLE'))
  await flush(); assert.equal(f.requests.length, 1)
  f.requests[0].fail({ errMsg: 'request:fail timeout' }); await Promise.all(rejected)
  assert.equal(f.session.user.id, 'a'); assert.equal(f.loginRequests, 0)
  const retry = f.user.getProfile(); await flush(); assert.equal(f.requests.length, 2)
  f.reply(1, profile('a')); await retry
})

test('切换账号时新令牌单独读取，旧资料迟到不能复原旧小屋，退出仍清空', async t => {
  const f = fixture(t, profile('a'))
  f.hooks.show.forEach(fn => fn()); await flush()
  f.setToken('memory-token-b'); f.session.user = profile('b'); await flush()
  assert.equal(f.home.profile.value, null)
  assert.equal(f.requests.filter(request => request.data.method === 'user.getProfile').length, 2)
  f.reply(0, profile('a')); f.reply(1, { items: [{ id: 'private-old-a' }], nextCursor: null }); await flush()
  assert.equal(f.home.profile.value, null); assert.equal(f.home.items.value.length, 0)
  await f.finish(); assert.equal(f.home.profile.value.id, 'b')
  f.hooks.hide.forEach(fn => fn()); f.setToken(''); f.session.user = null; await flush()
  assert.equal(f.home.profile.value, null); assert.equal(f.home.items.value.length, 0)
})

test('共享身份读取遇到过期令牌仍跳登录，不发送后续本人业务', async t => {
  const f = fixture(t), startup = f.transport.restoreIdentity(), own = f.user.getProfile(), content = f.transport.call('myContent.list')
  const rejected = [startup, own, content].map(pending => assert.rejects(pending, { code: 'UNAUTHENTICATED' }))
  await flush(); assert.equal(f.requests.length, 1)
  f.reply(0, null, 'UNAUTHENTICATED'); await Promise.all(rejected)
  assert.equal(f.session.user, null); assert.equal(f.loginRequests, 1); assert.equal(f.requests.length, 1)
})
