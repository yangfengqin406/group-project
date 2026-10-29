import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { computed, nextTick, reactive, ref, watch } from 'vue'

const source = readFileSync(new URL('../src/pages/content/components/HelpCooperation.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
  .replace(/^import[^\n]+\r?\n/gm, '')
const flush = async () => { await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)); await nextTick() }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const empty = () => ({ items: [], nextCursor: null })
const help = (id = 'help-one') => ({ id, type: 'help', ownerId: 'author', title: '帮忙调试代码', status: 'open', visibility: 'public' })
const application = (changes = {}) => ({ id: 'application-one', helpId: 'help-one', ownerId: 'author', helperId: 'helper',
  status: 'accepted', ownerConfirmedAt: null, helperConfirmedAt: null, ...changes })
const plain = value => JSON.parse(JSON.stringify(value))

// Use Vue's real watchers and reactive props while executing the actual SFC.
// Parent change events replace the help prop as the real detail page does.
function mount(t, { service = {}, conversation = {}, userId = 'helper', initialHelp = help(), updateParent = true } = {}) {
  const props = reactive({ help: initialHelp, active: true, refreshKey: 0 })
  const session = reactive({ user: { id: userId } })
  const events = [], routes = [], stops = [], unmounts = []
  let serial = 0
  const helpService = {
    listApplications: async () => empty(),
    get: async () => plain(props.help),
    ...service
  }
  const context = vm.createContext({
    computed, ref, watch: (...args) => { const stop = watch(...args); stops.push(stop); return stop },
    onUnmounted: fn => unmounts.push(fn), defineProps: () => props,
    defineEmits: () => (name, value) => {
      events.push({ name, value: plain(value) })
      if (updateParent && name === 'change') props.help = value
    }, session, helpService, conversation,
    idempotencyKey: () => `operation-${++serial}`, errorText: error => error.message,
    uni: { navigateTo: ({ url }) => routes.push(url), showModal: () => {} }
  })
  vm.runInContext(`${script}\nglobalThis.component={refresh,perform,contactApplicant,applications,cursor,loading,busy,error,notice,canApply};`, context,
    { filename: 'HelpCooperation.vue' })
  const dispose = () => { for (const fn of unmounts) fn(); for (const stop of stops) stop() }
  t.after(dispose)
  return { ...context.component, props, session, events, routes, dispose }
}

test('互助UI刷新期间不启动联系或写请求，读取结束后联系失败也能继续刷新', async t => {
  const list = deferred()
  let opens = 0, applies = 0
  const ui = mount(t, {
    service: { listApplications: () => list.promise, apply: async () => { applies++ } },
    conversation: { open: async () => { opens++; throw new Error('联系网络暂时失败') } }
  })
  assert.equal(ui.loading.value, true)
  await ui.contactApplicant(application())
  await ui.perform('apply')
  assert.equal(opens, 0)
  assert.equal(applies, 0)
  list.resolve(empty()); await flush()
  assert.equal(ui.loading.value, false)
  await ui.contactApplicant(application())
  assert.equal(opens, 1)
  assert.equal(ui.error.value, '联系网络暂时失败')
  assert.equal(ui.busy.value, false)
  assert.equal(ui.loading.value, false)
  await ui.refresh()
  assert.equal(ui.loading.value, false)
})

test('互助UI网络失败重试保留操作编号，成功后再次操作使用新编号', async t => {
  const requests = []
  const ui = mount(t, { service: {
    apply: async params => {
      requests.push(plain(params))
      if (requests.length === 1) throw new Error('请求超时，结果未知')
      return { application: application({ status: 'pending' }), help: help() }
    }
  } })
  await flush()
  await ui.perform('apply')
  assert.equal(ui.error.value, '请求超时，结果未知')
  assert.equal(ui.busy.value, false)
  await ui.perform('apply'); await flush()
  assert.equal(requests.length, 2)
  assert.equal(requests[1].idempotencyKey, requests[0].idempotencyKey)
  await ui.perform('apply'); await flush()
  assert.equal(requests.length, 3)
  assert.notEqual(requests[2].idempotencyKey, requests[1].idempotencyKey)
  assert.equal(requests[2].helpId, 'help-one')
})

test('互助UI收到旧确认回执后仍读取最新求助和申请，不把旧状态留在父页面', async t => {
  const stale = help()
  stale.selectedApplicationId = 'application-one'
  const latest = { ...stale, status: 'completed' }
  let gets = 0, lists = 0
  const ui = mount(t, { initialHelp: stale, service: {
    listApplications: async () => ({ items: [application({ status: ++lists > 1 ? 'completed' : 'accepted' })], nextCursor: null }),
    confirmCompletion: async () => ({ help: plain(stale), application: application({ helperConfirmedAt: '2026-10-27T10:00:00Z' }) }),
    get: async () => { gets++; return latest }
  } })
  await flush()
  await ui.perform('confirmCompletion', application()); await flush()
  assert.equal(gets, 1)
  assert.equal(ui.props.help.status, 'completed')
  assert.equal(ui.events.at(-1).value.status, 'completed')
  assert.equal(ui.applications.value[0].status, 'completed')
  assert.equal(ui.busy.value, false)
  assert.equal(ui.loading.value, false)
})

test('互助UI对方已先确认时保留本次完成奖励提示，并刷新最终状态', async t => {
  const initial = { ...help(), selectedApplicationId: 'application-one' }
  const done = { ...initial, status: 'completed' }
  let gets = 0
  const ui = mount(t, { initialHelp: initial, service: {
    listApplications: async () => ({ items: [application({ status: gets ? 'completed' : 'accepted', ownerConfirmedAt: '2026-10-27T09:00:00Z' })], nextCursor: null }),
    confirmCompletion: async () => ({ help: plain(done), application: application({ status: 'completed' }), reward: { eventId: 'completion', delta: 15, reason: 'awarded' } }),
    get: async () => { gets++; return plain(done) }
  } })
  await flush()
  await ui.perform('confirmCompletion', application()); await flush()
  assert.equal(ui.props.help.status, 'completed')
  assert.equal(ui.applications.value[0].status, 'completed')
  assert.match(ui.notice.value, /获得15颗珍珠/)
  assert.equal(gets, 1)
})

test('互助UI换账号后旧写入响应不发change，也不清除新账号正在提交的状态', async t => {
  const old = deferred(), current = deferred(), requests = []
  const ui = mount(t, { service: { apply: params => { requests.push(plain(params)); return requests.length === 1 ? old.promise : current.promise } } })
  await flush()
  const first = ui.perform('apply')
  ui.session.user = { id: 'another-helper' }; await flush()
  const second = ui.perform('apply')
  assert.equal(ui.busy.value, true)
  old.resolve({ help: help(), application: application({ status: 'pending' }) })
  await first; await flush()
  assert.equal(ui.events.length, 0)
  assert.equal(ui.busy.value, true)
  assert.notEqual(requests[0].idempotencyKey, requests[1].idempotencyKey)
  current.resolve({ help: help(), application: application({ helperId: 'another-helper', status: 'pending' }) })
  await second; await flush()
  assert.ok(ui.events.length > 0)
  assert.equal(ui.busy.value, false)
})

test('互助UI隐藏时不接纳旧列表或跳转，恢复后新列表仍能加载', async t => {
  const oldList = deferred(), contact = deferred()
  let lists = 0
  const ui = mount(t, { userId: 'author', service: { listApplications: () => ++lists === 1 ? oldList.promise : Promise.resolve(empty()) },
    conversation: { open: () => contact.promise } })
  ui.props.active = false; await flush()
  oldList.resolve({ items: [application()], nextCursor: 'old-cursor' }); await flush()
  assert.equal(ui.applications.value.length, 0)
  assert.equal(ui.cursor.value, null)
  assert.equal(ui.loading.value, false)
  ui.props.active = true; await flush()
  const opening = ui.contactApplicant(application())
  ui.props.active = false; await flush()
  contact.resolve({ id: 'late-chat' }); await opening; await flush()
  assert.deepEqual(ui.routes, [])
  assert.equal(ui.busy.value, false)
  ui.props.active = true; await flush()
  assert.equal(ui.loading.value, false)
  assert.equal(lists, 3)
})

test('互助UI隐藏期间旧提交完成不发父页面事件，恢复后的新提交不会被旧finally解除忙碌', async t => {
  const old = deferred(), next = deferred()
  let calls = 0
  const ui = mount(t, { service: { apply: () => ++calls === 1 ? old.promise : next.promise } })
  await flush()
  const first = ui.perform('apply')
  ui.props.active = false; await flush()
  ui.props.active = true; await flush()
  const second = ui.perform('apply')
  assert.equal(ui.busy.value, true)
  old.resolve({ help: help(), application: application({ status: 'pending' }) })
  await first; await flush()
  assert.equal(ui.events.length, 0)
  assert.equal(ui.busy.value, true)
  next.resolve({ help: help(), application: application({ status: 'pending' }) })
  await second; await flush()
  assert.ok(ui.events.length > 0)
  assert.equal(ui.busy.value, false)
})

test('互助UI切换求助后旧联系响应不能导航或干扰新协作；正常链接使用chat?id', async t => {
  const oldContact = deferred(), newContact = deferred(), contactParams = []
  const ui = mount(t, { userId: 'author', conversation: { open: params => {
    contactParams.push(plain(params)); return contactParams.length === 1 ? oldContact.promise : newContact.promise
  } } })
  await flush()
  const first = ui.contactApplicant(application())
  ui.props.help = help('help-two'); await flush()
  const second = ui.contactApplicant(application({ id: 'application-two', helpId: 'help-two', helperId: 'another-helper' }))
  oldContact.resolve({ id: 'old-chat' }); await first; await flush()
  assert.deepEqual(ui.routes, [])
  assert.equal(ui.busy.value, true)
  newContact.resolve({ id: 'chat with / characters?' }); await second; await flush()
  assert.equal(ui.busy.value, false)
  assert.equal(ui.routes[0], '/pages/messages/chat?id=chat%20with%20%2F%20characters%3F')
  assert.equal(contactParams[1].helpId, undefined)
  assert.equal(contactParams[1].contentId, 'help-two')
  assert.equal(contactParams[1].peerUserId, 'another-helper')
})
