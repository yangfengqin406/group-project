import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const flush = async () => { await Vue.nextTick(); await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const connectionState = changes => ({ supported: true, currentOrigin: 'https://current.example',
  defaultOrigin: 'https://default.example', usesOverride: true, ...changes })

function preprocess(source, native) {
  return source.replace(/(?:\/\/|<!--)\s*#ifdef APP-PLUS(?:\s*-->)?\r?\n([\s\S]*?)(?:\/\/|<!--)\s*#endif(?:\s*-->)?/g,
    (_, block) => native ? block : '')
}

// Execute the real SFC setup and compiled template events with Vue's scheduler;
// only external services and the native modal callbacks are controlled here.
function subject(t, file, { native = true, props: initialProps = {}, ...overrides } = {}) {
  const source = preprocess(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), native)
  const { descriptor } = parse(source), compiled = compileScript(descriptor, { id: file })
  const imported = new Set(Object.keys(compiled.imports))
  const names = Object.entries(compiled.bindings).filter(([name, type]) => !imported.has(name) && type !== 'props').map(([name]) => name)
  const script = descriptor.scriptSetup.content.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const props = Vue.reactive({ active: true, disabled: false, ...initialProps })
  const hooks = { show: [], hide: [], unload: [], unmount: [] }, modals = [], events = [], routes = []
  const scope = Vue.effectScope()
  const environment = { ...Vue, props, session: Vue.reactive({ user: null }), config: { apiMode: 'http' },
    connection: { getState: () => connectionState(), switchTo: async () => ({ restarting: true }), restoreDefault: async () => ({ restarting: true }) },
    errorText: error => error.message, defineProps: () => props, defineEmits: () => (...args) => events.push(args),
    onShow: fn => hooks.show.push(fn), onHide: fn => hooks.hide.push(fn), onUnload: fn => hooks.unload.push(fn),
    onUnmounted: fn => hooks.unmount.push(fn),
    uni: { showModal: options => modals.push(options), switchTab: ({ url }) => routes.push(url), reLaunch: ({ url }) => routes.push(url),
      navigateTo: ({ url }) => routes.push(url) },
    ...overrides }
  const context = vm.createContext(environment)
  scope.run(() => vm.runInContext(`${script}\nglobalThis.subject = {${names.join(',')}}`, context, { filename: file }))
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file,
    compilerOptions: { mode: 'function', isCustomElement: () => true } })
  assert.deepEqual(template.errors, [])
  const render = new Function('Vue', template.code)({ ...Vue, withDirectives: vnode => vnode })
  const api = context.subject, renderContext = Vue.proxyRefs(new Proxy({ ...environment, ...api }, {
    get(target, key) { return key in props ? props[key] : target[key] },
    has(target, key) { return key in props || key in target }
  }))
  let disposed = false
  const unmount = () => { if (!disposed) { disposed = true; hooks.unmount.forEach(fn => fn()); scope.stop() } }
  t.after(unmount)
  return { ...api, props, hooks, modals, events, routes, unmount, render: () => render(renderContext, []) }
}
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...(Array.isArray(node.children) ? node.children.flatMap(nodes) : [])]
const text = node => typeof node === 'string' ? node : typeof node?.children === 'string' ? node.children
  : Array.isArray(node?.children) ? node.children.map(text).join(' ') : ''
const button = (view, label) => nodes(view.render()).find(node => node.type === 'button' && text(node).includes(label))
const input = view => nodes(view.render()).find(node => node.type === 'input' && node.props?.placeholder === '粘贴维护者提供的 HTTPS 地址')
const child = view => nodes(view.render()).find(node => typeof node.type === 'string' && node.type.toLowerCase() === 'appconnectionsettings')
const edit = (view, value) => input(view).props['onUpdate:modelValue'](value)
const expand = view => button(view, '测试服务地址').props.onTap()

test('原生可用时默认收起，离线未登录也能打开；不支持的平台完全隐藏', async t => {
  let checks = 0
  const card = subject(t, 'components/AppConnectionSettings.vue', { connection: {
    getState: () => connectionState(), switchTo: async () => { checks++; throw new Error('offline') }, restoreDefault: async () => ({ restarting: true }) } })
  assert.ok(button(card, '测试服务地址'))
  assert.equal(input(card), undefined)
  expand(card)
  assert.equal(input(card).props.value ?? card.originInput.value, 'https://current.example')
  assert.match(text(card.render()), /地址由维护者提供/)
  assert.match(text(card.render()), /重新登录/)
  assert.equal(checks, 0)
  expand(card)
  assert.equal(input(card), undefined)
  const unsupported = subject(t, 'components/AppConnectionSettings.vue', {
    connection: { getState: () => connectionState({ supported: false }) } })
  assert.equal(button(unsupported, '测试服务地址'), undefined)
})

test('确认取消不检查也不保存；等待确认期间拒绝重复点击并通知父页禁用登录', async t => {
  const calls = []
  const card = subject(t, 'components/AppConnectionSettings.vue', { connection: {
    getState: () => connectionState(), switchTo: async (...args) => { calls.push(args); return { restarting: true } }, restoreDefault: async () => ({ restarting: true }) } })
  expand(card); edit(card, 'https://next.example')
  const switchButton = button(card, '检查并切换')
  const pending = switchButton.props.onTap()
  await switchButton.props.onTap()
  assert.equal(card.modals.length, 1)
  assert.equal(button(card, '正在处理').props.disabled, true)
  assert.deepEqual(card.events[0], ['busy', true])
  assert.match(card.modals[0].content, /重新登录/)
  card.modals[0].success({ confirm: false })
  await pending
  assert.equal(calls.length, 0)
  assert.equal(card.busy.value, false)
  assert.deepEqual(card.events.at(-1), ['busy', false])
  assert.equal(card.originInput.value, 'https://next.example')
})

test('切换失败保留输入与当前地址、显示服务错误并允许重试', async t => {
  const calls = [], response = deferred()
  const card = subject(t, 'components/AppConnectionSettings.vue', { connection: {
    getState: () => connectionState(), switchTo: origin => { calls.push(origin); return response.promise }, restoreDefault: async () => ({ restarting: true }) } })
  expand(card); edit(card, 'https://next.example')
  const pending = button(card, '检查并切换').props.onTap()
  card.modals[0].success({ confirm: true }); await flush()
  assert.deepEqual(calls, ['https://next.example'])
  assert.equal(input(card).props.disabled, true)
  response.reject(new Error('无法连接此服务，请核对维护者提供的地址'))
  await pending
  assert.match(text(card.render()), /无法连接此服务/)
  assert.equal(card.originInput.value, 'https://next.example')
  assert.equal(card.state.value.currentOrigin, 'https://current.example')
  assert.equal(button(card, '检查并切换').props.disabled, false)
})

test('恢复默认同样先确认，成功后保持禁用直到重启，不发送表单或账号密码', async t => {
  const calls = []
  const card = subject(t, 'components/AppConnectionSettings.vue', { connection: {
    getState: () => connectionState(), switchTo: async origin => { calls.push(origin); return { restarting: true } },
    restoreDefault: async (...args) => { calls.push(args); return { restarting: true } } } })
  expand(card); edit(card, 'https://unused.example')
  const pending = button(card, '恢复默认地址').props.onTap()
  assert.equal(calls.length, 0)
  card.modals[0].success({ confirm: true }); await pending
  assert.equal(calls.length, 1)
  assert.equal(calls[0].length, 1)
  assert.equal(typeof calls[0][0].current, 'function')
  assert.equal(calls[0][0].current(), true)
  assert.equal(card.busy.value, true)
  assert.match(text(card.render()), /正在重新打开/)
})

test('隐藏前的确认和请求不能污染重新显示的页面，也不能发起重复切换', async t => {
  const calls = [], response = deferred()
  const card = subject(t, 'components/AppConnectionSettings.vue', { connection: {
    getState: () => connectionState(), switchTo: origin => { calls.push(origin); return response.promise }, restoreDefault: async () => ({ restarting: true }) } })
  expand(card); edit(card, 'https://next.example')
  const beforeConfirm = button(card, '检查并切换').props.onTap()
  card.props.active = false; await flush()
  card.modals[0].success({ confirm: true }); await beforeConfirm
  assert.equal(calls.length, 0)
  card.props.active = true; await flush(); expand(card)
  const switchButton = button(card, '检查并切换')
  const beforeHide = switchButton.props.onTap()
  card.modals[1].success({ confirm: true }); await flush()
  card.props.active = false; await flush(); card.props.active = true; await flush()
  assert.equal(button(card, '测试服务地址').props.disabled, true)
  await switchButton.props.onTap()
  assert.equal(calls.length, 1)
  response.reject(new Error('旧页面的网络错误'))
  await beforeHide
  assert.doesNotMatch(text(card.render()), /旧页面的网络错误/)
  assert.equal(card.error.value, '')
  assert.equal(card.busy.value, false)
  expand(card)
  const leaving = button(card, '检查并切换').props.onTap()
  card.unmount(); card.modals[2].success({ confirm: true }); await leaving
  assert.equal(calls.length, 1)
})

test('偏好损坏错误可见且仍可恢复默认，隐藏后传给服务的提交保护立即失效', async t => {
  const response = deferred(), calls = [], restores = []
  const card = subject(t, 'components/AppConnectionSettings.vue', { connection: {
    getState: () => connectionState({ usesOverride: false, error: '本机保存的测试地址损坏，请恢复默认地址' }),
    switchTo: (origin, options) => { calls.push({ origin, options }); return response.promise },
    restoreDefault: async options => { restores.push(options); return { restarting: true } } } })
  expand(card)
  assert.match(text(card.render()), /本机保存的测试地址损坏/)
  assert.equal(button(card, '恢复默认地址').props.disabled, false)
  edit(card, 'https://next.example')
  const pending = button(card, '检查并切换').props.onTap()
  card.modals[0].success({ confirm: true }); await flush()
  assert.equal(calls[0].options.current(), true)
  card.props.active = false
  assert.equal(calls[0].options.current(), false)
  await flush(); card.props.active = true; await flush()
  assert.equal(calls[0].options.current(), false)
  response.reject(new Error('旧地址检查结果'))
  await pending
  assert.doesNotMatch(card.error.value, /旧地址检查结果/)
  expand(card)
  const restoring = button(card, '恢复默认地址').props.onTap()
  card.modals[1].success({ confirm: true })
  await restoring
  assert.equal(restores.length, 1, '损坏偏好在未启用override时也须能提交恢复')
  assert.equal(restores[0].current(), true)
})

test('登录/设置与离线home均可进入原生连接设置，H5/微信移除，忙时阻止账号动作', async t => {
  const logins = [], unblocks = []
  const login = subject(t, 'rooms/account/index.vue', { auth: { login: async params => logins.push(params) } })
  login.studentId.value = 'student.one'; login.password.value = 'local-secret'
  const entry = child(login)
  assert.ok(entry)
  assert.equal(Object.values(entry.props).includes('local-secret'), false)
  entry.props.onBusy(true)
  assert.equal(button(login, '登录小镇').props.disabled, true)
  await login.submit()
  assert.equal(logins.length, 0)
  entry.props.onBusy(false)
  await login.submit()
  assert.equal(logins.length, 1)
  assert.equal(logins[0].password, 'local-secret')
  assert.equal(Object.keys(logins[0]).includes('origin'), false)
  const settings = subject(t, 'rooms/settings/index.vue', {
    session: Vue.reactive({ user: { id: 'me' } }),
    user: { listBlocked: async () => ({ items: [] }), unblock: async value => unblocks.push(value) }, auth: {} })
  assert.ok(child(settings))
  settings.blocked.value = [{ userId: 'peer', nickname: '同学' }]
  child(settings).props.onBusy(true)
  assert.equal(button(settings, '解除屏蔽').props.disabled, true)
  await settings.unblock({ userId: 'peer' })
  assert.equal(unblocks.length, 0)
  for (const page of [login, settings]) {
    page.hooks.hide.forEach(fn => fn())
    assert.equal(child(page).props.active, false)
    page.hooks.show.forEach(fn => fn())
    assert.equal(child(page).props.active, true)
  }
  const home = subject(t, 'pages/home/index.vue', {
    session: Vue.reactive({ user: { id: 'saved-session' } }),
    user: { getProfile: async () => { throw new Error('网络连接失败') } },
    myContent: { list: async () => ({ items: [], nextCursor: null }) }, favorite: {}, auth: {} })
  await home.load()
  assert.equal(home.profile.value, null)
  assert.match(text(home.render()), /网络连接失败/)
  button(home, '测试服务地址').props.onTap()
  assert.deepEqual(home.routes, ['/rooms/settings/index'])
  home.profile.value = { id: 'saved-session', nickname: '同学', skillTags: [] }
  assert.equal(button(home, '测试服务地址'), undefined)
  for (const file of ['rooms/account/index.vue', 'rooms/settings/index.vue', 'pages/home/index.vue']) {
    const nonNative = subject(t, file, { native: false, auth: {}, user: {} })
    assert.equal(child(nonNative), undefined)
    assert.equal(button(nonNative, '测试服务地址'), undefined)
  }
})
