import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { ref, computed } from 'vue'
import { ServiceError } from '../src/utils/errors.js'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const stripImports = (source) => source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
function moduleUnderTest(file, dependencies, names) {
  const context = vm.createContext({ ...dependencies })
  vm.runInContext(`${stripImports(read(file)).replace(/^export /gm, '')}\nglobalThis.subject = { ${names} }`, context)
  return context.subject
}
const plain = (value) => JSON.parse(JSON.stringify(value))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
const lobbyValue = (matchStatus = 'idle') => ({ onlineCount: 3, queueCount: matchStatus === 'queued' ? 1 : 0, roomId: null, matchStatus })
function snapshot(revision = 1, overrides = {}) {
  return {
    roomId: 'table-a', revision, phase: 'playing', selfId: 'self', currentPlayerId: 'self', deadline: Date.now() + 30000, serverTime: Date.now(),
    landlordId: 'self', highestBid: 3, highestBidderId: 'self', bids: [], bottomCards: [],
    seats: [{ playerId: 'self', nickname: '我', handCount: 2, auto: false, role: 'landlord' }, { playerId: 'other', nickname: '牌友', handCount: 17, auto: false, role: 'farmer' }],
    hand: [{ id: 'S3', rank: 3, suit: 'spades', label: '3' }, { id: 'H4', rank: 4, suit: 'hearts', label: '4' }],
    lastPlay: null, winnerTeam: null, winnerIds: [], ...overrides
  }
}
function page(overrides = {}) {
  const hooks = {}, timers = new Map(), modal = [], calls = [], routes = []
  let timerId = 0
  const landlord = {
    getSetup: () => ({ configured: true }), getSavedSession: () => ({ playerId: 'self', nickname: '我' }), clearSession: () => calls.push('clearSession'),
    openSession: async () => ({ playerId: 'self', nickname: '我' }), getLobby: async () => lobbyValue(), getRoom: async () => snapshot(),
    joinQueue: async () => lobbyValue('queued'), cancelQueue: async () => lobbyValue(), leave: async () => lobbyValue(),
    hint: async () => ({ cardIds: ['S3'] }), bid: async () => snapshot(2), play: async () => snapshot(2), pass: async () => snapshot(2), setAuto: async () => snapshot(2),
    ...overrides
  }
  const context = vm.createContext({
    ref, computed, landlord, errorText: (e) => e.message, Date, Math,
    setTimeout: (fn) => { const id = ++timerId; timers.set(id, fn); return id }, clearTimeout: (id) => timers.delete(id),
    onShow: (fn) => { hooks.show = fn }, onHide: (fn) => { hooks.hide = fn }, onUnload: (fn) => { hooks.unload = fn }, onBackPress: (fn) => { hooks.back = fn },
    uni: { showModal: (value) => modal.push(value), navigateBack: (value) => routes.push(value), switchTab: (value) => routes.push(value) }
  })
  const source = read('src/rooms/landlord/index.vue').match(/<script setup>([\s\S]*?)<\/script>/)[1]
  vm.runInContext(`${stripImports(source)}\nglobalThis.subject = { nickname, guest, lobby, room, selected, pendingAction, busy, connected, error, notice, refresh, submit, retryAction, showHint, toggleCard, askLeavePage, canAct, acceptRoom }`, context)
  return { ...context.subject, hooks, timers, calls, modal, routes }
}

test('牌桌未配置或断网时明确失败，完全不调用校园 mock 或伪造在线', async () => {
  let requests = 0
  const config = { gameBaseUrl: '' }
  const transport = moduleUnderTest('src/services/game-transport.js', {
    config, ServiceError, readGameSession: () => null,
    uni: { request: (options) => { requests++; options.fail() } }
  }, 'gameCall')
  await assert.rejects(transport.gameCall('landlord.getLobby'), (error) => error.code === 'SERVICE_UNAVAILABLE' && error.message.includes('尚未配置'))
  assert.equal(requests, 0)
  config.gameBaseUrl = '/game'
  await assert.rejects(transport.gameCall('landlord.getLobby'), (error) => error.code === 'SERVICE_UNAVAILABLE' && error.message.includes('Wi-Fi'))
  assert.equal(requests, 1)
})

test('真实牌桌只带独立访客凭证，保留服务端权限错误与HTTP故障', async () => {
  let request
  const transport = moduleUnderTest('src/services/game-transport.js', {
    config: { gameBaseUrl: '/game' }, ServiceError, readGameSession: () => ({ token: 'game-only-token' }),
    uni: { request: (options) => { request = options } }
  }, 'gameCall')
  const failed = transport.gameCall('landlord.play', { roomId: 'r', cardIds: ['S3'] })
  assert.equal(request.url, '/game/rpc')
  assert.equal(request.header.Authorization, 'Bearer game-only-token')
  assert.equal(request.data.method, 'landlord.play')
  request.success({ statusCode: 401, data: { code: 'UNAUTHORIZED', message: '访客已失效', data: null } })
  await assert.rejects(failed, (error) => error.code === 'UNAUTHORIZED' && error.message === '访客已失效')
  const malformed = transport.gameCall('landlord.getLobby')
  request.success({ statusCode: 200, data: { onlineCount: 3 } })
  await assert.rejects(malformed, (error) => error.code === 'SERVICE_UNAVAILABLE')
  const badHttp = transport.gameCall('landlord.getLobby')
  request.success({ statusCode: 503, data: { code: 'OK', data: { onlineCount: 99 } } })
  await assert.rejects(badHttp, (error) => error.code === 'SERVICE_UNAVAILABLE')
})

test('访客凭证按游戏服务隔离，页面读取不会获得token', async () => {
  const storage = new Map()
  const session = moduleUnderTest('src/utils/game-session.js', {
    uni: { getStorageSync: (key) => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: (key) => storage.delete(key) }
  }, 'readGameSession,writeGameSession,removeGameSession')
  session.writeGameSession('/game-a', { token: 'secret', playerId: 'self', nickname: '我' })
  assert.equal(session.readGameSession('/game-b'), null)
  const service = moduleUnderTest('src/services/landlord.js', {
    config: { gameBaseUrl: '/game-a' }, ...session, ServiceError,
    gameCall: async () => ({ token: 'real-guest', playerId: 'other', nickname: '新牌友' })
  }, 'getSavedSession,openSession,clearSession')
  assert.deepEqual(plain(service.getSavedSession()), { playerId: 'self', nickname: '我' })
  const value = await service.openSession({ nickname: '新牌友' })
  assert.deepEqual(plain(value), { playerId: 'other', nickname: '新牌友' })
  assert.equal(session.readGameSession('/game-a').token, 'real-guest')
  service.clearSession()
  assert.equal(service.getSavedSession(), null)
})

test('前台轮询与隐藏隔离：旧大厅请求不能回填，隐藏后不再继续轮询', async () => {
  const old = deferred(), fresh = deferred()
  let reads = 0
  const subject = page({ getLobby: () => ++reads === 1 ? old.promise : fresh.promise })
  subject.hooks.show(); await flush()
  assert.equal(subject.timers.size, 1)
  subject.hooks.hide()
  assert.equal(subject.timers.size, 0)
  subject.hooks.show(); await flush()
  fresh.resolve({ ...lobbyValue('queued'), onlineCount: 7 }); await flush()
  old.resolve({ ...lobbyValue(), onlineCount: 1 }); await flush()
  assert.equal(subject.lobby.value.onlineCount, 7)
  assert.equal(subject.lobby.value.matchStatus, 'queued')
})

test('重入座与注销期间的旧session.open响应不会覆盖新的访客凭证', async () => {
  const first = deferred(), second = deferred(), third = deferred(), stored = []
  const replies = [first, second, third]
  const service = moduleUnderTest('src/services/landlord.js', {
    config: { gameBaseUrl: '/game' }, ServiceError, readGameSession: () => null,
    writeGameSession: (_, value) => stored.push(value.playerId), removeGameSession: () => stored.push('removed'),
    gameCall: () => replies.shift().promise
  }, 'openSession,clearSession')
  const old = service.openSession({ nickname: '旧访客' })
  const newer = service.openSession({ nickname: '新访客' })
  second.resolve({ token: 'new', playerId: 'new', nickname: '新访客' })
  await newer
  first.resolve({ token: 'old', playerId: 'old', nickname: '旧访客' })
  await assert.rejects(old, (error) => error.code === 'CONFLICT')
  assert.deepEqual(stored, ['new'])
  const loggedOut = service.openSession({ nickname: '退出前访客' })
  service.clearSession()
  third.resolve({ token: 'late', playerId: 'late', nickname: '退出前访客' })
  await assert.rejects(loggedOut, (error) => error.code === 'CONFLICT')
  assert.deepEqual(stored, ['new', 'removed'])
})

test('其他窗口更新访客令牌后，当前窗口旧入座响应不能覆盖新凭证', async () => {
  const delayed = deferred(), writes = []
  let token = 'before'
  const service = moduleUnderTest('src/services/landlord.js', {
    config: { gameBaseUrl: '/game' }, ServiceError,
    readGameSession: () => ({ token, playerId: 'self', nickname: '我' }),
    writeGameSession: (_, value) => writes.push(value), removeGameSession: () => {},
    gameCall: (_, __, options) => { assert.equal(options.token, 'before'); return delayed.promise }
  }, 'openSession')
  const old = service.openSession({ nickname: '我' })
  token = 'new-other-window'
  delayed.resolve({ token: 'old-reply', playerId: 'old', nickname: '旧访客' })
  await assert.rejects(old, (error) => error.code === 'CONFLICT')
  assert.equal(writes.length, 0)
})

test('取消匹配后，先前慢到的排队读取不能重新显示排队', async () => {
  const old = deferred()
  const subject = page({ getLobby: () => old.promise })
  subject.hooks.show(); await flush()
  await subject.submit('cancelQueue')
  assert.equal(subject.lobby.value.matchStatus, 'idle')
  old.resolve(lobbyValue('queued')); await flush()
  assert.equal(subject.lobby.value.matchStatus, 'idle')
})

test('新排队成功后，先前大厅读取的迟到网络失败不会把新状态标成断线', async () => {
  const old = deferred()
  const subject = page({ getLobby: () => old.promise })
  subject.hooks.show(); await flush()
  await subject.submit('joinQueue')
  assert.equal(subject.connected.value, true)
  old.reject(new ServiceError('SERVICE_UNAVAILABLE', '旧请求失败')); await flush()
  assert.equal(subject.connected.value, true)
  assert.equal(subject.error.value, '')
  assert.equal(subject.lobby.value.matchStatus, 'queued')
})

test('写操作结果不明保留原operationId与revision，确认重试不会另发一手', async () => {
  const sent = []
  const subject = page({ play: async (params) => {
    sent.push(plain(params))
    if (sent.length === 1) throw new ServiceError('SERVICE_UNAVAILABLE', '网络中断')
    return snapshot(3, { hand: [snapshot().hand[1]] })
  } })
  subject.hooks.show(); await flush()
  subject.room.value = snapshot(2)
  await subject.submit('play', { cardIds: ['S3'] })
  assert.ok(subject.pendingAction.value)
  assert.equal(subject.error.value.includes('尚未确认'), true)
  await subject.submit('play', { cardIds: ['H4'] })
  assert.equal(sent.length, 1)
  await subject.retryAction()
  assert.equal(sent.length, 2)
  assert.deepEqual(sent[1], sent[0])
  assert.equal(sent[0].expectedRevision, 2)
  assert.equal(subject.pendingAction.value, null)
  assert.equal(subject.room.value.revision, 3)
})

test('写操作期间切后台：恢复后可确认同一操作，晚到成功不覆盖隐藏页', async () => {
  const first = deferred(), sent = []
  const subject = page({ joinQueue: (params) => { sent.push(plain(params)); return sent.length === 1 ? first.promise : Promise.resolve(lobbyValue('queued')) } })
  subject.hooks.show(); await flush()
  const write = subject.submit('joinQueue'); await flush()
  subject.hooks.hide()
  first.resolve(lobbyValue('queued')); await write
  assert.equal(subject.lobby.value.matchStatus, 'idle')
  assert.ok(subject.pendingAction.value)
  subject.hooks.show(); await flush()
  assert.ok(subject.error.value.includes('尚未确认'))
  await subject.retryAction()
  assert.deepEqual(sent[1], sent[0])
  assert.equal(subject.lobby.value.matchStatus, 'queued')
})

test('牌桌旧revision不能倒退；出牌后从选择中剔除已不在手中的牌', async () => {
  const subject = page()
  subject.hooks.show(); await flush()
  subject.room.value = snapshot(5)
  subject.selected.value = ['S3', 'H4']
  subject.acceptRoom(snapshot(4), 1, 'self')
  assert.equal(subject.room.value.revision, 5)
  subject.acceptRoom(snapshot(6, { hand: [snapshot().hand[1]] }), 1, 'self')
  assert.equal(subject.room.value.revision, 6)
  assert.deepEqual(plain(subject.selected.value), ['H4'])
})

test('提示只选本手牌，轮次已变时不回写旧提示；权限失效清访客而非演示成功', async () => {
  const hint = deferred()
  const subject = page({ hint: () => hint.promise, getRoom: async () => { throw new ServiceError('UNAUTHORIZED', '过期') } })
  subject.hooks.show(); await flush()
  subject.room.value = snapshot(2); subject.connected.value = true
  const result = subject.showHint()
  subject.room.value = snapshot(3, { currentPlayerId: 'other' })
  hint.resolve({ cardIds: ['S3'] }); await result
  assert.equal(subject.selected.value.length, 0)
  await subject.refresh()
  assert.equal(subject.guest.value, null)
  assert.equal(subject.room.value, null)
  assert.equal(subject.calls.includes('clearSession'), true)
  assert.ok(subject.error.value.includes('已失效'))
})

test('结束后返回大厅不会被旧牌桌读取重新打开，进行中离开明确提示托管', async () => {
  const old = deferred()
  const subject = page({ getRoom: () => old.promise })
  subject.hooks.show(); await flush()
  subject.room.value = snapshot(5)
  subject.askLeavePage()
  assert.ok(subject.modal[0].content.includes('托管'))
  subject.modal[0].success({ confirm: false })
  assert.equal(subject.routes.length, 0)
  subject.room.value = snapshot(5, { phase: 'finished' })
  const reading = subject.refresh()
  await subject.submit('leave')
  assert.equal(subject.room.value, null)
  old.resolve(snapshot(5)); await reading
  assert.equal(subject.room.value, null)
})

test('旧桌超时已清理时先读真实大厅，清空旧手牌选择并允许重新匹配', async () => {
  const subject = page({ getRoom: async () => { throw new ServiceError('NOT_FOUND', '旧桌已结束') } })
  subject.hooks.show(); await flush()
  subject.room.value = snapshot(8)
  subject.selected.value = ['S3']
  await subject.refresh()
  assert.equal(subject.room.value, null)
  assert.equal(subject.selected.value.length, 0)
  assert.equal(subject.lobby.value.matchStatus, 'idle')
  assert.equal(subject.connected.value, true)
  assert.ok(subject.notice.value.includes('重新匹配'))
  await subject.submit('joinQueue')
  assert.equal(subject.lobby.value.matchStatus, 'queued')
})

test('牌桌路由独立分包，广场只跳转，页面不直接请求网络或保存业务', () => {
  const routes = JSON.parse(read('src/pages.json'))
  assert.equal(routes.pages.some((entry) => entry.path === 'rooms/landlord/index'), false)
  assert.ok(routes.subPackages.some((entry) => entry.root === 'rooms' && entry.pages.some((item) => item.path === 'landlord/index')))
  const plaza = read('src/pages/plaza/index.vue')
  assert.ok(plaza.includes("navigate('/rooms/landlord/index')"))
  assert.equal(plaza.includes('四人休息亭'), false)
  const room = read('src/rooms/landlord/index.vue')
  assert.equal(/uni\.(request|[a-zA-Z]*Storage)/.test(room), false)
  assert.equal(/from ['"]node:/.test(room), false)
})
