import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { getHelpProgressLabel } from '../src/domain/help/brief.js'
import { contentNames, contentUrl, formatTime } from '../src/utils/routes.js'

const flush = async () => { await Vue.nextTick(); await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

// Real Vue watches and actual SFC template handlers, with controllable service
// responses. No list ordering, request guards, or navigation logic is copied.
function subject(t, file, { props: initialProps = {}, session: sharedSession, ...services } = {}) {
  const { descriptor } = parse(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'))
  const compiled = compileScript(descriptor, { id: file }), imported = new Set(Object.keys(compiled.imports))
  const names = Object.entries(compiled.bindings).filter(([name, type]) => !imported.has(name) && type !== 'props').map(([name]) => name)
  const script = descriptor.scriptSetup.content.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const props = Vue.reactive(initialProps), session = sharedSession || Vue.reactive({ user: { id: 'me' } })
  const hooks = { show: [], hide: [], unload: [], unmount: [] }, routes = [], scope = Vue.effectScope()
  const environment = { ...Vue, session, contentNames, contentUrl, formatTime, getHelpProgressLabel,
    config: { apiMode: 'http' }, errorText: error => error.message, defineProps: () => props,
    onShow: fn => hooks.show.push(fn), onHide: fn => hooks.hide.push(fn), onUnload: fn => hooks.unload.push(fn), onUnmounted: fn => hooks.unmount.push(fn),
    demoUsers: () => [], switchDemoUser() {}, resetDemo() {}, openProfile() {}, requestSubscription: async () => ({}),
    uni: { navigateTo: ({ url }) => routes.push(url), showToast() {} }, ...services }
  const context = vm.createContext(environment)
  scope.run(() => vm.runInContext(`${script}\nglobalThis.subject = {${names.join(',')}}`, context, { filename: file }))
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file,
    compilerOptions: { mode: 'function', isCustomElement: () => true } })
  assert.deepEqual(template.errors, [])
  const render = new Function('Vue', template.code)(Vue), api = context.subject
  const renderContext = Vue.proxyRefs(new Proxy({ ...environment, ...api }, {
    get(target, key) { return key in props ? props[key] : target[key] },
    has(target, key) { return key in props || key in target }
  }))
  let disposed = false
  const unmount = () => { if (!disposed) { disposed = true; hooks.unmount.forEach(fn => fn()); scope.stop() } }
  t.after(unmount)
  return { ...api, props, session, hooks, routes, unmount, render: () => render(renderContext, []) }
}
function nodes(vnode) {
  return !vnode || typeof vnode !== 'object' ? [] : [vnode, ...(Array.isArray(vnode.children) ? vnode.children.flatMap(nodes) : [])]
}
const text = vnode => typeof vnode === 'string' ? vnode : typeof vnode?.children === 'string' ? vnode.children
  : Array.isArray(vnode?.children) ? vnode.children.map(text).join(' ') : ''
const button = (panel, label) => nodes(panel.render()).find(node => node.type === 'button' && text(node).trim() === label)
const entry = (helpId, changes = {}) => ({ helpId, help: { id: helpId, type: 'help', title: `求助${helpId}` }, application: null,
  role: 'owner', progress: 'waiting', actionRequired: false, actionLabel: '', availability: 'available', updatedAt: '2026-10-28T08:00:00Z', ...changes })

function panel(t, options = {}) {
  const requests = []
  const view = subject(t, 'components/MyHelp.vue', { props: { refreshKey: 0, active: true },
    help: { listMine: params => { const pending = deferred(); requests.push({ ...pending, params: structuredClone(params) }); return pending.promise } }, ...options })
  return { view, requests }
}
const result = (items, nextCursor = null) => ({ items, nextCursor })

test('三个tab向服务提交各自scope，切换即时清空旧记录和游标', async t => {
  const { view, requests } = panel(t)
  assert.equal(requests[0].params.scope, 'todo')
  requests[0].resolve(result([entry('todo-one')], 'todo-page-2'))
  await flush()
  button(view, '我发出的').props.onTap()
  await flush()
  assert.equal(view.scope.value, 'posted')
  assert.equal(view.items.value.length, 0)
  assert.equal(view.cursor.value, null)
  assert.equal(requests[1].params.scope, 'posted')
  assert.equal(requests[1].params.cursor, null)
  assert.equal('userId' in requests[1].params, false)
  requests[1].resolve(result([entry('posted-one')], 'posted-page-2'))
  await flush()
  button(view, '我申请的').props.onTap()
  await flush()
  assert.equal(view.items.value.length, 0)
  assert.equal(view.cursor.value, null)
  assert.equal(requests[2].params.scope, 'applied')
  assert.equal(requests[2].params.cursor, null)
  requests[2].resolve(result([entry('applied-one', { role: 'helper' })]))
  await flush()
  assert.match(text(view.render()), /求助applied-one/)
  assert.doesNotMatch(text(view.render()), /求助todo-one|求助posted-one/)
})

test('乱序旧成功和旧失败不能回填、报错或解锁仍在等待的新scope请求', async t => {
  const { view, requests } = panel(t)
  button(view, '我发出的').props.onTap()
  await flush()
  button(view, '我申请的').props.onTap()
  await flush()
  requests[0].resolve(result([entry('late-todo')], 'stale-cursor'))
  await flush()
  assert.equal(view.items.value.length, 0)
  assert.equal(view.cursor.value, null)
  assert.equal(view.loading.value, true)
  requests[1].reject(new Error('旧发布列表读取失败'))
  await flush()
  assert.equal(view.error.value, '')
  assert.equal(view.loading.value, true)
  assert.equal(button(view, '刷新').props.disabled, true)
  requests[2].resolve(result([entry('new-applied')]))
  await flush()
  assert.equal(view.items.value[0].helpId, 'new-applied')
  assert.equal(view.loading.value, false)
  view.props.refreshKey++
  await flush()
  button(view, '待我处理').props.onTap()
  await flush()
  requests[3].reject(new Error('先前刷新失败'))
  await flush()
  assert.equal(view.loading.value, true)
  assert.equal(view.error.value, '')
  requests[4].resolve(result([entry('new-todo')]))
  await flush()
  assert.equal(view.items.value[0].helpId, 'new-todo')
})

test('换账号和隐藏清空私有列表，旧失败不结束重新显示后的新读取', async t => {
  const { view, requests } = panel(t)
  requests[0].resolve(result([entry('account-a-private')], 'account-a-cursor'))
  await flush()
  const older = view.load()
  view.session.user = { id: 'other' }
  await flush()
  assert.equal(view.items.value.length, 0)
  assert.equal(view.cursor.value, null)
  requests[1].resolve(result([entry('old-account-response')], 'wrong-cursor'))
  await older
  assert.equal(view.items.value.length, 0)
  assert.equal(view.loading.value, true)
  view.props.active = false
  await flush()
  assert.equal(view.loading.value, false)
  assert.equal(view.items.value.length, 0)
  const count = requests.length
  await view.load()
  assert.equal(requests.length, count)
  view.props.active = true
  await flush()
  requests[2].reject(new Error('隐藏前请求失败'))
  await flush()
  assert.equal(view.loading.value, true)
  assert.equal(view.error.value, '')
  requests[3].resolve(result([entry('other-account-current')]))
  await flush()
  assert.equal(view.items.value[0].helpId, 'other-account-current')
  const leaving = view.load()
  view.unmount()
  requests[4].resolve(result([entry('unmounted-old-data')]))
  await leaving
  assert.equal(view.items.value[0].helpId, 'other-account-current')
})

test('分页发送服务游标、去重追加，失败保留可重试页面，旧分页不能覆盖新tab', async t => {
  const { view, requests } = panel(t)
  requests[0].resolve(result([entry('one'), entry('two')], 'signed-page-2'))
  await flush()
  const reading = button(view, '查看更多互助').props.onTap()
  assert.equal(requests[1].params.cursor, 'signed-page-2')
  assert.equal(requests[1].params.scope, 'todo')
  await view.load(false)
  assert.equal(requests.length, 2, '在途分页不能重复提交')
  requests[1].resolve(result([entry('two'), entry('three')], 'signed-page-3'))
  await reading
  assert.deepEqual([...view.items.value].map(item => item.helpId), ['one', 'two', 'three'])
  const failing = button(view, '查看更多互助').props.onTap()
  requests[2].reject(new Error('后续页面暂不可用'))
  await failing
  assert.equal(view.items.value.length, 3)
  assert.equal(view.cursor.value, 'signed-page-3')
  assert.match(text(view.render()), /后续页面暂不可用/)
  const stale = button(view, '查看更多互助').props.onTap()
  assert.equal(requests[3].params.cursor, 'signed-page-3')
  button(view, '我发出的').props.onTap()
  await flush()
  requests[4].resolve(result([entry('new-posted')]))
  await flush()
  requests[3].resolve(result([entry('late-page-three')], 'late-page-4'))
  await stale
  assert.deepEqual([...view.items.value].map(item => item.helpId), ['new-posted'])
  assert.equal(view.cursor.value, null)
  assert.equal(button(view, '查看更多互助'), undefined)
})

test('待办行动和历史卡片都回原求助详情，不可访问占位没有入口或他人资料', async t => {
  const { view, requests } = panel(t)
  const selecting = entry('choose / helper?', { actionRequired: true, actionLabel: '选择帮助者', pendingCount: 2 })
  const confirming = entry('confirm-help', { role: 'helper', actionRequired: true, actionLabel: '确认已解决', progress: 'helping' })
  requests[0].resolve(result([selecting, confirming]))
  await flush()
  button(view, '选择帮助者').props.onTap()
  button(view, '确认已解决').props.onTap()
  assert.deepEqual(view.routes, [contentUrl('help', selecting.helpId), contentUrl('help', confirming.helpId)])
  assert.match(text(view.render()), /2 份申请待选择/)
  button(view, '我申请的').props.onTap()
  await flush()
  const history = entry('completed-help', { role: 'helper', progress: 'resolved' })
  const unavailable = entry('private-help', { help: null, role: 'helper', progress: 'unavailable', availability: 'unavailable',
    application: { id: 'own-application', helperId: 'me', status: 'cancelled' } })
  requests[1].resolve(result([history, unavailable]))
  await flush()
  button(view, '查看进展').props.onTap()
  assert.equal(view.routes.at(-1), contentUrl('help', history.helpId))
  const placeholder = nodes(view.render()).find(node => node.props?.class === 'my-help-entry' && text(node).includes('原求助已不可访问'))
  assert.ok(placeholder)
  assert.match(text(placeholder), /已不可访问/)
  assert.equal(nodes(placeholder).some(node => node.type === 'button' || node.type === 'ServiceImage'), false)
  const navigations = view.routes.length
  view.open(unavailable)
  view.open(entry('mismatched', { help: { id: 'another-help', title: '另一条求助' } }))
  assert.equal(view.routes.length, navigations)
  button(view, '发布求助').props.onTap()
  button(view, '看看谁需要帮助').props.onTap()
  assert.deepEqual(view.routes.slice(-2), ['/pages/content/publish?type=help', '/pages/help/index'])
})

test('home onShow刷新key并激活面板，隐藏清空，重新显示只接收最新私有读取', async t => {
  const session = Vue.reactive({ user: { id: 'me' } }), empty = async () => result([])
  const home = subject(t, 'pages/home/index.vue', { session, user: { getProfile: async () => ({ id: session.user.id }) },
    myContent: { list: empty }, favorite: { list: empty }, auth: {} })
  const childProps = () => nodes(home.render()).find(node => typeof node.type === 'string' && node.type.toLowerCase() === 'myhelp').props
  // The embedded panel now mounts only after its surrounding profile card loads.
  assert.equal(nodes(home.render()).some(node => typeof node.type === 'string' && node.type.toLowerCase() === 'myhelp'), false)
  const { view, requests } = panel(t, { session, props: { active: false, refreshKey: 0, embedded: true } })
  const syncChildProps = () => {
    const next = childProps()
    Object.assign(view.props, { active: next.active, refreshKey: next['refresh-key'] })
  }
  assert.equal(requests.length, 0)
  home.hooks.show.forEach(fn => fn())
  await flush()
  syncChildProps()
  await flush()
  assert.equal(requests.length, 1)
  assert.equal(view.props.active, true)
  const firstKey = view.props.refreshKey
  requests[0].resolve(result([entry('before-background')], 'before-background-cursor'))
  await flush()
  const older = view.load()
  home.hooks.hide.forEach(fn => fn())
  syncChildProps()
  await flush()
  assert.equal(view.props.active, false)
  assert.equal(view.items.value.length, 0)
  assert.equal(view.cursor.value, null)
  home.hooks.show.forEach(fn => fn())
  syncChildProps()
  await flush()
  assert.ok(view.props.refreshKey > firstKey)
  requests[1].reject(new Error('后台旧读取失败'))
  await older
  assert.equal(view.loading.value, true)
  assert.equal(view.error.value, '')
  requests[2].resolve(result([entry('after-foreground')]))
  await flush()
  assert.equal(view.items.value[0].helpId, 'after-foreground')
  home.hooks.unload.forEach(fn => fn())
  syncChildProps()
  await flush()
  assert.equal(view.props.active, false)
  assert.equal(view.items.value.length, 0)
})
