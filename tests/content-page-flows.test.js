import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'
import { contentNames, contentTypes, contentUrl, localToIso, formatTime } from '../src/utils/routes.js'

const source = (file) => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
const stripImports = (code) => code.replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm, '')
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
const flush = async () => { await nextTick(); await new Promise((resolve) => setImmediate(resolve)) }
function page(file, { db = createSeed(), api: overrides = {} } = {}) {
  const hooks = { load: [], show: [], hide: [], unload: [], back: [] }
  const routes = []
  const session = reactive({ user: { id: db.currentUserId } })
  const service = new Proxy({}, {
    get: (_, module) => new Proxy({}, {
      get: (_, method) => overrides[module]?.[method] ||
        (async (params) => dispatch(db, `${module}.${method}`, params))
    })
  })
  let guarded
  const context = vm.createContext({
    ref, reactive, computed, watch, session, api: service,
    config: { apiMode: 'mock' }, contentNames, contentTypes, contentUrl, localToIso, formatTime,
    errorText: (e) => e.message, openProfile() {},
    onLoad: (fn) => hooks.load.push(fn), onShow: (fn) => hooks.show.push(fn),
    onHide: (fn) => hooks.hide.push(fn), onUnload: (fn) => hooks.unload.push(fn),
    useUnsavedChanges: (dirty) => { guarded = dirty },
    uni: { redirectTo: (value) => routes.push(value.url), navigateTo: (value) => routes.push(value.url), showToast() {} }
  })
  const script = source(file).match(/<script setup>([\s\S]*?)<\/script>/)[1]
  const exported = file.endsWith('publish.vue')
    ? 'form, capacity, sourcePlan, ready, editId, date, endDate, startTime, endTime, error, save, loadPlan'
    : 'item, comments, commentsCursor, commentsLoading, commentBody, loadComments, sendComment, editPlan'
  vm.runInContext(`${stripImports(script)}\nglobalThis.page = { ${exported} }`, context)
  return { ...context.page, hooks, db, session, routes, dirty: () => guarded?.value }
}

test('页面编辑满员计划扩容，保留同一计划并重新招募', async () => {
  const db = createSeed()
  const original = db.contents.plan[0]
  db.currentUserId = original.ownerId
  original.memberIds.push('user_demo_b')
  original.status = 'full'
  const editor = page('pages/content/publish.vue', { db })
  await editor.hooks.load[0]({ type: 'plan', id: original.id })
  assert.equal(editor.ready.value, true)
  assert.equal(editor.dirty(), false)
  editor.capacity.value = '3'
  editor.form.location = '图书馆南门'
  assert.equal(editor.dirty(), true)
  await editor.save()
  assert.equal(editor.error.value, '')
  assert.equal(original.id, editor.sourcePlan.value.id)
  const updated = db.contents.plan.find((item) => item.id === original.id)
  assert.equal(updated.capacity, 3)
  assert.equal(updated.status, 'open')
  assert.equal(updated.location, '图书馆南门')
  assert.equal(db.contents.plan.length, 3)
  assert.match(editor.routes[0], /pages\/content\/detail/)
  assert.equal(editor.dirty(), false)
})

test('编辑进行中的计划保留开始时刻原有秒数，不能缩容到成员数以下', async () => {
  const db = createSeed()
  const original = db.contents.plan[0]
  db.currentUserId = original.ownerId
  original.startAt = new Date(Date.now() - 60_000).toISOString()
  original.endAt = new Date(Date.now() + 3_600_000).toISOString()
  original.capacity = 3
  original.memberIds.push('member-b', 'member-c')
  const editor = page('pages/content/publish.vue', { db })
  await editor.hooks.load[0]({ type: 'plan', id: original.id })
  const start = original.startAt
  editor.capacity.value = '2'
  await editor.save()
  assert.match(editor.error.value, /容量不能少于/)
  editor.capacity.value = '4'
  editor.form.body += '，地点见门口公告。'
  await editor.save()
  assert.equal(editor.error.value, '')
  assert.equal(db.contents.plan[0].startAt, start)
  assert.equal(db.contents.plan[0].capacity, 4)
})

test('终态或他人的计划不能从编辑链接提交；换身份的迟到读取不会填入表单', async () => {
  const db = createSeed()
  const original = db.contents.plan[0]
  db.currentUserId = original.ownerId
  original.status = 'closed'
  const terminal = page('pages/content/publish.vue', { db })
  await terminal.hooks.load[0]({ type: 'plan', id: original.id })
  assert.equal(terminal.ready.value, false)
  assert.match(terminal.error.value, /不能再编辑/)
  await terminal.save()
  assert.deepEqual(terminal.routes, [])
  original.status = 'open'
  db.currentUserId = 'user_demo_b'
  const foreign = page('pages/content/publish.vue', { db })
  await foreign.hooks.load[0]({ type: 'plan', id: original.id })
  assert.equal(foreign.ready.value, false)
  assert.match(foreign.error.value, /只能编辑自己/)
  db.currentUserId = original.ownerId
  const pending = deferred()
  const editor = page('pages/content/publish.vue', { db, api: { plan: { get: () => pending.promise } } })
  const loading = editor.hooks.load[0]({ type: 'plan', id: original.id })
  editor.session.user = { id: 'different-user' }
  await nextTick()
  pending.resolve({ ...original, status: 'open' })
  await loading
  assert.equal(editor.sourcePlan.value, null)
  assert.equal(editor.form.title, '')
})

test('直接打开编辑链接先恢复当前身份；新计划支持跨日时间范围', async () => {
  const db = createSeed()
  const original = db.contents.plan[0]
  db.currentUserId = original.ownerId
  let editor
  editor = page('pages/content/publish.vue', { db, api: {
    user: { getProfile: async () => {
      editor.session.user = { id: original.ownerId }
      return editor.session.user
    } }
  } })
  editor.session.user = null
  await nextTick()
  await editor.hooks.load[0]({ type: 'plan', id: original.id })
  assert.equal(editor.ready.value, true)
  const creator = page('pages/content/publish.vue', { db })
  await creator.hooks.load[0]({ type: 'plan' })
  Object.assign(creator.form, { title: '跨日观星', category: '观星', location: '天文台', body: '等一场流星雨。' })
  creator.date.value = original.startAt.slice(0, 10)
  creator.endDate.value = new Date(Date.parse(`${creator.date.value}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
  creator.startTime.value = '23:00'
  creator.endTime.value = '01:00'
  await creator.save()
  assert.equal(creator.error.value, '')
  const created = db.contents.plan.find((entry) => entry.title === '跨日观星')
  assert.equal(Date.parse(created.endAt) - Date.parse(created.startAt), 2 * 3600000)
})

test('失物详情翻过50条评论，继续提交游标且追加去重', async () => {
  const calls = []
  const detail = page('pages/content/detail.vue', { api: {
    comment: { list: async (params) => {
      calls.push(params.cursor)
      return params.cursor
        ? { items: [{ id: 'c49' }, { id: 'c50' }], nextCursor: null }
        : { items: Array.from({ length: 50 }, (_, id) => ({ id: `c${id}` })), nextCursor: '50' }
    } }
  } })
  detail.hooks.load[0]({ type: 'lost_found', id: detail.db.contents.lost_found[0].id })
  detail.hooks.show[0]()
  await flush()
  assert.equal(detail.comments.value.length, 50)
  await detail.loadComments({ reset: false })
  assert.equal(detail.comments.value.length, 51)
  assert.equal(detail.commentsCursor.value, null)
  assert.deepEqual(calls, [null, '50'])
})

test('旧评论请求不能覆盖刷新，发送期间新写的草稿不会被清空', async () => {
  const old = deferred()
  const posted = deferred()
  let reads = 0
  const detail = page('pages/content/detail.vue', { api: {
    comment: {
      list: async () => ++reads === 1 ? old.promise : { items: [{ id: 'new' }], nextCursor: null },
      create: () => posted.promise
    }
  } })
  detail.hooks.load[0]({ type: 'lost_found', id: detail.db.contents.lost_found[0].id })
  detail.hooks.show[0]()
  await flush()
  await detail.loadComments()
  old.resolve({ items: [{ id: 'old' }], nextCursor: '50' })
  await flush()
  assert.equal(detail.comments.value[0].id, 'new')
  detail.commentBody.value = '第一条线索'
  const sending = detail.sendComment()
  detail.commentBody.value = '第二条还没发的线索'
  posted.resolve({ id: 'posted' })
  await sending
  assert.equal(detail.commentBody.value, '第二条还没发的线索')
})

test('离开失物详情后，迟到评论不能回填；切换身份时清空旧评论和草稿', async () => {
  const old = deferred()
  const detail = page('pages/content/detail.vue', { api: {
    comment: { list: () => old.promise }
  } })
  detail.hooks.load[0]({ type: 'lost_found', id: detail.db.contents.lost_found[0].id })
  detail.hooks.show[0]()
  await flush()
  detail.hooks.hide[0]()
  old.resolve({ items: [{ id: 'old-account' }], nextCursor: '50' })
  await flush()
  assert.equal(detail.comments.value.length, 0)
  assert.equal(detail.commentsCursor.value, null)
  detail.commentBody.value = '我的草稿线索'
  detail.session.user = { id: 'another-user' }
  await nextTick()
  assert.equal(detail.commentBody.value, '')
  assert.equal(detail.commentsLoading.value, false)
})

test('发布返回保护：确认前阻止离开，取消保留草稿，确认后放行，卸载清理', () => {
  const dirty = ref(true)
  const hooks = {}
  const listeners = new Map()
  let modal
  let navigations = 0
  let stopped = false
  const context = vm.createContext({
    watch: (_, fn) => { fn(true); return () => { stopped = true } },
    onBackPress: (fn) => { hooks.back = fn }, onUnload: (fn) => { hooks.unload = fn },
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) },
    uni: { showModal: (options) => { modal = options }, navigateBack: () => { navigations++ } },
    dirty
  })
  const helper = stripImports(source('utils/use-unsaved-changes.js')).replace('export function', 'function')
  vm.runInContext(`${helper}\nuseUnsavedChanges(dirty)`, context)
  assert.equal(hooks.back(), true)
  modal.success({ confirm: false }); modal.complete()
  assert.equal(navigations, 0)
  assert.equal(hooks.back(), true)
  modal.success({ confirm: true }); modal.complete()
  assert.equal(navigations, 1)
  assert.equal(hooks.back(), false)
  assert.equal(listeners.has('beforeunload'), true)
  let prevented = false
  const event = { preventDefault() { prevented = true } }
  listeners.get('beforeunload')(event)
  assert.equal(prevented, true)
  assert.equal(event.returnValue, '')
  hooks.unload()
  assert.equal(stopped, true)
  assert.equal(listeners.size, 0)
})
