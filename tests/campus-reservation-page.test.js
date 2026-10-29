import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'
import * as routes from '../src/utils/routes.js'

const flush = async () => { await nextTick(); await new Promise((done) => setImmediate(done)) }
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const source = readFileSync(new URL('../src/pages/content/detail.vue', import.meta.url), 'utf8')
  .match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm, '')
function page({ userId = 'seller', invoke, mode = 'http', overrides = {} } = {}) {
  const hooks = { load: [], show: [], hide: [], unload: [] }, calls = []
  const session = reactive({ user: { id: userId } }), modals = []
  const item = { id: 'sale', ownerId: 'seller', marketType: 'sell', status: 'active' }
  const fallback = (method) => method === 'market.get' ? item : { items: [], nextCursor: null }
  const api = new Proxy({}, { get: (_, module) => new Proxy({}, { get: (_, action) => async (p) => {
    const method = `${module}.${action}`
    calls.push({ method, params: p, userId: session.user?.id })
    return overrides[method] ? overrides[method](p) : invoke ? invoke(method, p, session.user?.id) : fallback(method)
  } }) })
  const context = vm.createContext({ ref, reactive, computed, watch, session, api, ...routes, config: { apiMode: mode },
    errorText: (e) => e.message, onLoad: (fn) => hooks.load.push(fn), onShow: (fn) => hooks.show.push(fn),
    onHide: (fn) => hooks.hide.push(fn), onUnload: (fn) => hooks.unload.push(fn),
    uni: { showModal: (modal) => modals.push(modal), showToast() {} } })
  vm.runInContext(`${source}\nglobalThis.page={item,error,busy,reservations,reservationsCursor,reservationsLoading,reservationsError,loadReservations,respondReservation,completeReservation,reserve}`, context)
  hooks.load[0]({ type: 'market', id: 'sale' })
  return { ...context.page, hooks, session, calls, modals }
}

test('实际详情脚本贯通 SQLite 买方预约、卖方接受、买方确认交接并刷新终态', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'campus-reservation-page-'))
  const store = openCStore(join(directory, 'campus.sqlite'))
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }) })
  const service = createCampusService({ store, uploadsDir: join(directory, 'uploads'), uploadOrigin: 'http://127.0.0.1:8788' })
  const seller = service.invoke('auth.register', { studentId: 'seller01', password: 'campus-password-123', nickname: '卖方' }).user
  const buyer = service.invoke('auth.register', { studentId: 'buyer001', password: 'campus-password-123', nickname: '买方' }).user
  const sale = service.invoke('market.create', { title: '校园二手教材', body: '门口交接', category: '教材', marketType: 'sell', priceCents: 2500, condition: '九成新' }, { userId: seller.id })
  const invoke = (method, params, userId) => service.invoke(method, params, { userId })
  const sellerPage = page({ userId: seller.id, invoke }), buyerPage = page({ userId: buyer.id, invoke })
  sellerPage.hooks.load[0]({ type: 'market', id: sale.id })
  buyerPage.hooks.load[0]({ type: 'market', id: sale.id })
  buyerPage.hooks.show[0](); await flush()
  buyerPage.reserve(); await flush()
  assert.equal(buyerPage.reservations.value[0].status, 'pending')
  sellerPage.hooks.show[0](); await flush()
  const pending = sellerPage.reservations.value[0]
  assert.equal(pending.buyer.nickname, '买方')
  await sellerPage.respondReservation(pending, true)
  assert.equal(sellerPage.item.value.status, 'reserved')
  assert.equal(sellerPage.reservations.value[0].status, 'accepted')
  await buyerPage.loadReservations()
  buyerPage.completeReservation(buyerPage.reservations.value[0])
  assert.equal(buyerPage.modals.length, 1)
  buyerPage.modals[0].success({ confirm: true }); await flush()
  assert.equal(buyerPage.item.value.status, 'completed')
  assert.equal(buyerPage.reservations.value[0].status, 'completed')
  assert.equal(buyerPage.error.value, '')
  assert.equal(service.invoke('market.get', { id: sale.id }, { userId: seller.id }).status, 'completed')
})

test('真实预约分页追加去重，刷新后迟到的更多页不能覆盖新预约', async () => {
  const more = deferred()
  let requests = 0
  const detail = page({ overrides: { 'market.getCandidates': async (params) => {
    requests++
    if (requests === 1) return { items: [{ id: 'r1', status: 'pending' }], nextCursor: 'next' }
    if (requests === 2) { assert.equal(params.cursor, 'next'); return { items: [{ id: 'r1' }, { id: 'r2' }], nextCursor: 'more' } }
    if (requests === 3) return more.promise
    return { items: [{ id: 'latest', status: 'accepted' }], nextCursor: null }
  } } })
  detail.hooks.show[0](); await flush()
  await detail.loadReservations({ reset: false })
  assert.equal(detail.reservations.value.map((r) => r.id).join(','), 'r1,r2')
  const pending = detail.loadReservations({ reset: false })
  await detail.loadReservations()
  more.resolve({ items: [{ id: 'stale-private' }], nextCursor: null }); await pending
  assert.equal(detail.reservations.value.map((r) => r.id).join(','), 'latest')
  assert.equal(detail.reservationsCursor.value, null)
  assert.equal(detail.reservationsLoading.value, false)
})

test('离开详情或更换账号后，迟到的预约不会回填上一账号的数据', async () => {
  for (const action of ['hide', 'account', 'unload']) {
    const pending = deferred()
    let count = 0
    const detail = page({ overrides: { 'market.getCandidates': () => ++count === 1 ? pending.promise : { items: [], nextCursor: null } } })
    detail.hooks.show[0](); await flush()
    if (action === 'account') { detail.session.user = { id: 'different-user' }; await flush() }
    else detail.hooks[action][0]()
    pending.resolve({ items: [{ id: 'previous-account-private' }], nextCursor: 'secret' }); await flush()
    assert.equal(detail.reservations.value.length, 0, action)
    assert.equal(detail.reservationsCursor.value, null, action)
    assert.equal(detail.reservationsLoading.value, false, action)
  }
})

test('交接确认弹窗之后离开页面或换身份，确认回调不能提交旧预约', async () => {
  for (const action of ['hide', 'account']) {
    const detail = page()
    detail.hooks.show[0](); await flush()
    detail.completeReservation({ id: 'r1', status: 'accepted' })
    if (action === 'account') { detail.session.user = { id: 'other' }; await flush() }
    else detail.hooks.hide[0]()
    detail.modals[0].success({ confirm: true }); await flush()
    assert.equal(detail.calls.filter((c) => c.method === 'reservation.complete').length, 0, action)
  }
})

test('预约状态冲突会重新读取商品和预约，页面保留实际失败提示', async () => {
  let reads = 0
  const detail = page({ overrides: {
    'market.get': async () => ({ id: 'sale', ownerId: 'seller', marketType: 'sell', status: ++reads === 1 ? 'active' : 'closed' }),
    'market.getCandidates': async () => ({ items: [{ id: 'r1', status: reads === 1 ? 'pending' : 'cancelled' }], nextCursor: null }),
    'reservation.respond': async () => { const error = new Error('预约状态已变化'); error.code = 'CONFLICT'; throw error }
  } })
  detail.hooks.show[0](); await flush()
  await detail.respondReservation(detail.reservations.value[0], false)
  assert.equal(detail.item.value.status, 'closed')
  assert.equal(detail.reservations.value[0].status, 'cancelled')
  assert.equal(detail.error.value, '预约状态已变化')
})

test('演示详情保留原流程，不调用尚未实现的预约回应接口', async () => {
  const detail = page({ mode: 'mock' })
  detail.hooks.show[0](); await flush()
  await detail.loadReservations()
  await detail.respondReservation({ id: 'r1', status: 'pending' }, true)
  detail.completeReservation({ id: 'r1', status: 'accepted' })
  assert.equal(detail.calls.filter((c) => ['market.getCandidates', 'reservation.respond', 'reservation.complete'].includes(c.method)).length, 0)
  assert.equal(detail.modals.length, 0)
})
