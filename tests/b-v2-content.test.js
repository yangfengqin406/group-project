import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'
import * as routes from '../src/utils/routes.js'

const flush = async () => { await nextTick(); await new Promise((done) => setImmediate(done)) }
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
function page(kind, overrides = {}) {
  const db = createSeed()
  const hooks = { load: [], show: [], hide: [], unload: [] }
  const session = reactive({ user: { id: db.currentUserId } })
  const api = new Proxy({}, { get: (_, module) => new Proxy({}, {
    get: (_, method) => overrides[module]?.[method] || (async (p) => dispatch(db, `${module}.${method}`, p))
  }) })
  const context = vm.createContext({
    ref, reactive, computed, watch, session, api, ...routes, config: { apiMode: 'mock' },
    errorText: (e) => e.message, useUnsavedChanges() {},
    onLoad: (fn) => hooks.load.push(fn), onShow: (fn) => hooks.show.push(fn),
    onHide: (fn) => hooks.hide.push(fn), onUnload: (fn) => hooks.unload.push(fn),
    uni: { redirectTo() {}, showToast() {} }
  })
  const source = fs.readFileSync(new URL(`../src/pages/content/${kind}.vue`, import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm, '')
  const names = kind === 'publish'
    ? 'form,imageIds,appraisal,appraising,estimate,useEstimatePrice,price,marketType'
    : 'item,matches,loadMatches,error'
  vm.runInContext(`${script}\nglobalThis.page={${names}}`, context)
  return { ...context.page, db, hooks, session }
}
const quote = { minCents: 1000, maxCents: 2000, basis: { category: '教材', condition: '九成新', rule: '类别+成色示例估价' }, note: '参考估价，仅供参考，最终价格由发布者决定' }

test('浏览他人公开求购不调用仅发布者可用的匹配接口', async () => {
  let calls = 0
  const detail = page('detail', { market: {
    get: async () => ({ id: 'foreign', ownerId: 'other', marketType: 'buy' }),
    matchCandidates: async () => { calls++; throw Error('无权匹配') }
  } })
  detail.hooks.load[0]({ type: 'market', id: 'foreign' })
  detail.hooks.show[0]()
  await flush()
  assert.equal(calls, 0)
  assert.equal(detail.error.value, '')
})

test('匹配读取离开或换账号后不能回填旧结果', async () => {
  for (const action of ['hide', 'account']) {
    const request = deferred()
    const detail = page('detail', { market: { get: async () => ({ id: 'own', ownerId: 'user_demo_a', marketType: 'buy' }), matchCandidates: () => request.promise } })
    detail.hooks.load[0]({ type: 'market', id: 'own' })
    detail.hooks.show[0]()
    await flush()
    if (action === 'hide') detail.hooks.hide[0]()
    else { detail.session.user = { id: 'other' }; await flush() }
    request.resolve({ items: [{ id: 'old-account-candidate' }], nextCursor: null })
    await flush()
    assert.equal(detail.matches.value.length, 0, action)
  }
})

test('本人匹配支持超过第一页，追加去重并保留游标', async () => {
  const cursors = []
  const detail = page('detail', { market: {
    get: async () => ({ id: 'own', ownerId: 'user_demo_a', marketType: 'buy' }),
    matchCandidates: async (p) => { cursors.push(p.cursor); return p.cursor ? { items: [{ id: 'a' }, { id: 'b' }], nextCursor: null } : { items: [{ id: 'a' }], nextCursor: '20' } }
  } })
  detail.hooks.load[0]({ type: 'market', id: 'own' })
  detail.hooks.show[0]()
  await flush()
  await detail.loadMatches({ reset: false })
  assert.deepEqual(cursors, [null, '20'])
  assert.equal(detail.matches.value.map((m) => m.id).join(','), 'a,b')
})

test('估价中更换照片或类别或类型或账号，迟到结果不得沿用', async () => {
  for (const change of ['photo', 'category', 'type', 'account', 'unload']) {
    const request = deferred()
    const editor = page('publish', { appraisal: { estimate: () => request.promise } })
    await editor.hooks.load[0]({ type: 'market' })
    editor.imageIds.value = ['photo-1']
    editor.form.category = '教材'
    await flush()
    const running = editor.estimate()
    if (change === 'photo') editor.imageIds.value = ['photo-2']
    if (change === 'category') editor.form.category = '数码'
    if (change === 'type') editor.marketType.value = 'buy'
    if (change === 'account') editor.session.user = { id: 'other' }
    if (change === 'unload') editor.hooks.unload.forEach((fn) => fn())
    await flush()
    request.resolve(quote)
    await running
    assert.equal(editor.appraisal.value, null, change)
    editor.useEstimatePrice()
    assert.equal(editor.price.value, '', change)
  }
})

test('已取得估价在成色改变后失效；手填价格保持不变', async () => {
  const editor = page('publish', { appraisal: { estimate: async () => quote } })
  await editor.hooks.load[0]({ type: 'market' })
  editor.imageIds.value = ['photo-1']
  editor.form.category = '教材'
  await flush()
  await editor.estimate()
  editor.useEstimatePrice()
  assert.equal(editor.price.value, '15.00')
  editor.form.condition = '七成新'
  await flush()
  assert.equal(editor.appraisal.value, null)
  assert.equal(editor.price.value, '15.00')
})
