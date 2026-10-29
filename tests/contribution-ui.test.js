import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { WARDROBE_ITEMS, WARDROBE_SLOTS } from '../src/utils/wardrobe-catalog.js'
import { createSeed } from '../src/mock/seed.js'
import { dispatchWardrobe, grantContributionPearls } from '../src/domain/leisure/wardrobe.js'
import { contentNames, contentUrl, formatTime } from '../src/utils/routes.js'

const flush = async () => { await Vue.nextTick(); await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const snapshot = (pearls, marker = 'current') => ({ pearls, dayKey: '2026-10-27',
  daily: { publish: { awarded: 1, limit: 3 }, helpCompletion: { awarded: 0, limit: 2 } },
  rules: { publish: { pearls: 5 }, helpCompletion: { helperPearls: 15, authorPearls: 5 } },
  recent: Array.from({ length: 5 }, (_, i) => ({ eventId: `${marker}-${i}`, kind: i ? 'publish' : 'help_helper',
    sourceType: 'help', createdAt: '2026-10-27T08:00:00Z', delta: i ? 5 : 15, reason: 'awarded' })) })

// Run the actual script with Vue's real reactive scheduler. Compile the actual
// template to VNodes as well, so buttons are tested through their event handlers.
function subject(t, file, { props: initialProps = {}, session: sharedSession, ...services } = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: file })
  const imported = new Set(Object.keys(compiled.imports))
  const bindings = Object.entries(compiled.bindings)
    .filter(([name, type]) => !imported.has(name) && type !== 'props' && type !== 'props-aliased')
    .map(([name]) => name)
  const script = descriptor.scriptSetup.content.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const props = Vue.reactive(initialProps), session = sharedSession || Vue.reactive({ user: { id: 'a' } })
  const hooks = { mounted: [], unmount: [], show: [], hide: [], unload: [] }, routes = [], events = [], modals = []
  const scope = Vue.effectScope()
  const environment = {
    ...Vue, props, session, WARDROBE_ITEMS, WARDROBE_SLOTS, contentNames, contentUrl, formatTime,
    config: { apiMode: 'http' }, errorText: error => error.message,
    defineProps: () => props, defineEmits: () => (...args) => events.push(args), defineExpose() {},
    onMounted: fn => hooks.mounted.push(fn), onUnmounted: fn => hooks.unmount.push(fn),
    onShow: fn => hooks.show.push(fn), onHide: fn => hooks.hide.push(fn), onUnload: fn => hooks.unload.push(fn),
    demoUsers: () => [], switchDemoUser() {}, resetDemo() {}, openProfile() {}, requestSubscription: async () => ({}),
    idempotencyKey: (() => { let n = 0; return () => `test-operation-${++n}` })(),
    uni: { navigateTo: ({ url }) => routes.push(url), showModal: options => modals.push(options), showToast() {} },
    ...services
  }
  const context = vm.createContext(environment)
  scope.run(() => vm.runInContext(`${script}\nglobalThis.subject = {${bindings.join(',')}}`, context, { filename: file }))
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file,
    compilerOptions: { mode: 'function', isCustomElement: () => true } })
  assert.deepEqual(template.errors, [])
  const render = new Function('Vue', template.code)(Vue)
  const api = context.subject
  const renderContext = Vue.proxyRefs(new Proxy({ ...environment, ...api }, {
    get(target, key) { return key in props ? props[key] : target[key] },
    has(target, key) { return key in props || key in target }
  }))
  let disposed = false
  const unmount = () => {
    if (disposed) return
    disposed = true
    hooks.unmount.forEach(fn => fn())
    scope.stop()
  }
  t.after(unmount)
  return { ...api, props, session, hooks, routes, events, modals, unmount,
    render: () => render(renderContext, []), mount: () => hooks.mounted.forEach(fn => fn()) }
}

function nodes(vnode) {
  if (!vnode || typeof vnode !== 'object') return []
  return [vnode, ...(Array.isArray(vnode.children) ? vnode.children.flatMap(nodes) : [])]
}
const text = vnode => typeof vnode === 'string' ? vnode : typeof vnode?.children === 'string' ? vnode.children
  : Array.isArray(vnode?.children) ? vnode.children.map(text).join(' ') : ''
const button = (component, label) => nodes(component.render()).find(node => node.type === 'button' && text(node).includes(label))
const contributionChild = component => nodes(component.render()).find(node => typeof node.type === 'string' &&
  node.type.replace(/-/g, '').toLowerCase() === 'contributionrewards')

test('贡献卡换账号立即清空私有记录，迟到成功与失败都不能污染新账号', async t => {
  const requests = []
  const card = subject(t, 'components/ContributionRewards.vue', { props: { compact: false, refreshKey: 0 },
    rewards: { getState: () => { const pending = deferred(); requests.push(pending); return pending.promise } } })
  card.expanded.value = true
  card.session.user = { id: 'b' }
  await flush()
  assert.equal(requests.length, 2)
  assert.equal(card.state.value, null)
  assert.equal(card.expanded.value, false)
  requests[0].resolve(snapshot(999, 'old-a'))
  await flush()
  assert.equal(card.state.value, null)
  requests[1].resolve(snapshot(20, 'new-b'))
  await flush()
  assert.equal(card.state.value.pearls, 20)
  assert.match(text(card.render()), /20 颗珍珠/)
  const pendingB = card.refresh()
  card.session.user = { id: 'c' }
  await flush()
  requests[3].resolve(snapshot(35, 'new-c'))
  await flush()
  requests[2].reject(new Error('旧账号的私有错误'))
  await pendingB
  assert.equal(card.state.value.pearls, 35)
  assert.equal(card.error.value, '')
  assert.equal(card.loading.value, false)
  assert.ok(card.shownHistory.value.every(entry => entry.eventId.startsWith('new-c')))
})

test('贡献卡刷新和卸载隔离旧结果，记录展开与校园入口由可见按钮触发', async t => {
  const requests = []
  const card = subject(t, 'components/ContributionRewards.vue', { props: { compact: false, refreshKey: 0 },
    rewards: { getState: () => { const pending = deferred(); requests.push(pending); return pending.promise } } })
  requests[0].resolve(snapshot(5))
  await flush()
  assert.equal(card.shownHistory.value.length, 3)
  // Rules and history now start folded; expand the real visible control first.
  button(card, '规则与记录').props.onTap()
  button(card, '查看最近').props.onTap()
  assert.equal(card.shownHistory.value.length, 5)
  for (const label of ['发布求助', '看看谁需要帮助', '发布求购']) button(card, label).props.onTap()
  assert.deepEqual(card.routes, ['/pages/content/publish?type=help', '/pages/help/index', '/pages/content/publish?type=market&marketType=buy'])
  const older = card.refresh(), newer = card.refresh()
  requests[2].resolve(snapshot(30))
  await newer
  requests[1].reject(new Error('较早的刷新失败'))
  await older
  assert.equal(card.state.value.pearls, 30)
  assert.equal(card.error.value, '')
  const leaving = card.refresh()
  card.unmount()
  requests[3].resolve(snapshot(500))
  await leaving
  assert.equal(card.state.value.pearls, 30)
})

test('自己的家每次重新显示都经真实组件prop刷新本人奖励，当前失败不展示旧余额', async t => {
  const session = Vue.reactive({ user: { id: 'a' } }), empty = async () => ({ items: [], nextCursor: null })
  const home = subject(t, 'pages/home/index.vue', { session, user: { getProfile: async () => ({ id: session.user.id }) },
    myContent: { list: empty }, favorite: { list: empty }, auth: {} })
  const child = contributionChild(home)
  assert.ok(child)
  const requests = []
  const card = subject(t, 'components/ContributionRewards.vue', { session,
    props: { compact: false, refreshKey: child.props['refresh-key'] },
    rewards: { getState: () => { const pending = deferred(); requests.push(pending); return pending.promise } } })
  requests[0].resolve(snapshot(5))
  await flush()
  home.hooks.show.forEach(fn => fn())
  card.props.refreshKey = contributionChild(home).props['refresh-key']
  await flush()
  assert.equal(requests.length, 2)
  requests[1].resolve(snapshot(25))
  await flush()
  assert.equal(card.state.value.pearls, 25)
  home.hooks.hide.forEach(fn => fn())
  home.hooks.show.forEach(fn => fn())
  card.props.refreshKey = contributionChild(home).props['refresh-key']
  await flush()
  requests[2].reject(new Error('奖励服务暂时不可用'))
  await flush()
  assert.equal(card.state.value, null)
  assert.match(text(card.render()), /奖励服务暂时不可用/)
  assert.doesNotMatch(text(card.render()), /25 颗珍珠/)
})

test('衣柜不要求潜水通关即可通过真实兑换按钮换装，缺珠入口前往校园互助', async t => {
  const db = createSeed(), owner = db.currentUserId, purchases = []
  grantContributionPearls(db, owner, 60)
  const panel = subject(t, 'components/pet/WardrobePanel.vue', { props: { appearance: { name: '校园伙伴' } },
    wardrobe: { getState: async () => dispatchWardrobe(db, owner, 'getState'),
      redeem: async params => { purchases.push(params.itemId); return dispatchWardrobe(db, owner, 'redeem', params) } } })
  panel.mount()
  await flush()
  assert.ok(contributionChild(panel))
  assert.equal(panel.showAdventure.value, false)
  assert.equal(button(panel, '去潜水闯关'), undefined)
  panel.selected.value = 'hair'
  await button(panel, '60 珍珠兑换').props.onTap()
  await flush()
  assert.deepEqual(purchases, ['acorn-bob'])
  assert.deepEqual([...panel.state.value.clearedLevels], [])
  assert.equal(panel.state.value.pearls, 0)
  assert.ok(button(panel, '穿戴'))
  button(panel, '去互助').props.onTap()
  assert.deepEqual(panel.routes, ['/pages/help/index'])
})

test('衣柜换账号后的迟到存档和错误不能回填或发出旧账号外观更新', async t => {
  const requests = []
  const panel = subject(t, 'components/pet/WardrobePanel.vue', { props: { appearance: {} },
    wardrobe: { getState: () => { const pending = deferred(); requests.push(pending); return pending.promise } } })
  panel.mount()
  panel.session.user = { id: 'b' }
  await flush()
  assert.equal(requests.length, 2, '换账号后应主动读取新账号衣柜')
  requests[1].resolve({ pearls: 20, owned: [], equipped: {}, clearedLevels: [], catalog: WARDROBE_ITEMS })
  await flush()
  requests[0].resolve({ pearls: 999, owned: [], equipped: { head: 'lily-pad' }, clearedLevels: [1], catalog: WARDROBE_ITEMS })
  await flush()
  assert.equal(panel.state.value.pearls, 20)
  assert.equal(panel.events.filter(([event]) => event === 'change').length, 1)
  const pendingB = panel.refresh()
  panel.session.user = { id: 'c' }
  await flush()
  requests[3].resolve({ pearls: 35, owned: [], equipped: {}, clearedLevels: [], catalog: WARDROBE_ITEMS })
  await flush()
  requests[2].reject(new Error('旧账号衣柜错误'))
  await pendingB
  assert.equal(panel.state.value.pearls, 35)
  assert.equal(panel.error.value, '')
})

test('互助组件换身份清除旧申请，迟到确认、联系与确认框不替新账号执行操作', async t => {
  const reads = [], confirmations = [], contacts = []
  const helpRecord = { id: 'help-1', ownerId: 'owner', status: 'open', visibility: 'public', selectedApplicationId: 'application-1' }
  const application = { id: 'application-1', helpId: 'help-1', ownerId: 'owner', helperId: 'a', status: 'accepted' }
  const cooperation = subject(t, 'pages/content/components/HelpCooperation.vue', {
    session: Vue.reactive({ user: { id: 'owner' } }),
    props: { help: helpRecord, refreshKey: 0, active: true },
    helpService: { listApplications: () => { const pending = deferred(); reads.push(pending); return pending.promise },
      confirmCompletion: params => { const pending = deferred(); confirmations.push({ ...pending, params }); return pending.promise },
      get: async () => helpRecord },
    conversation: { open: () => { const pending = deferred(); contacts.push(pending); return pending.promise } }
  })
  cooperation.session.user = { id: 'a' }
  await flush()
  reads[1].resolve({ items: [application], nextCursor: null })
  await flush()
  reads[0].resolve({ items: [application, { ...application, id: 'other-private-application', helperId: 'someone-else' }], nextCursor: null })
  await flush()
  assert.equal(cooperation.applications.value.length, 1)
  assert.equal(cooperation.applications.value[0].helperId, 'a')
  const pending = cooperation.perform('confirmCompletion', application)
  cooperation.session.user = { id: 'b' }
  await flush()
  reads[2].resolve({ items: [], nextCursor: null })
  await flush()
  confirmations[0].resolve({ application: { ...application, status: 'completed' }, help: { ...helpRecord, status: 'completed' }, reward: { delta: 15 } })
  await pending
  assert.equal(cooperation.events.length, 0)
  assert.equal(cooperation.notice.value, '')
  assert.equal(cooperation.applications.value.length, 0)
  cooperation.session.user = { id: 'a' }
  await flush()
  reads[3].resolve({ items: [application], nextCursor: null })
  await flush()
  cooperation.confirm(application)
  cooperation.session.user = { id: 'owner' }
  await flush()
  reads[4].resolve({ items: [application], nextCursor: null })
  await flush()
  cooperation.modals[0].success({ confirm: true })
  assert.equal(confirmations.length, 1)
  const contacting = button(cooperation, '和这位同学聊聊').props.onTap()
  cooperation.session.user = { id: 'c' }
  await flush()
  contacts[0].resolve({ id: 'private-old-conversation' })
  await contacting
  assert.deepEqual(cooperation.routes, [])
})
