import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const empty = async () => ({ items: [], nextCursor: null })
const flush = async () => { await Vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick() }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const contact = (id, contentType = 'market') => ({ id, contentType, contentTitle: '测试教材',
  unreadCount: 1, unreadContact: true, contactRequest: { id: `contact-${id}`, senderId: 'buyer', createdAt: '2026-11-13T10:00:00Z' },
  peer: { id: 'buyer', nickname: '联系同学' }, lastMessage: null })
const message = (id, contentType, unreadCount = 1) => ({ id, contentType, contentTitle: id, unreadCount,
  lastMessage: { id: `message-${id}`, body: '这条发布还在吗？', createdAt: '2026-11-13T10:00:01Z' } })

function subject(t, file, services = {}) {
  const { descriptor } = parse(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'))
  const compiled = compileScript(descriptor, { id: file })
  const imports = new Set(Object.keys(compiled.imports))
  const bindings = Object.entries(compiled.bindings)
    .filter(([name, type]) => !imports.has(name) && type !== 'props' && type !== 'props-aliased').map(([name]) => name)
  const script = descriptor.scriptSetup.content.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const hooks = { show: [], hide: [], unload: [] }, scope = Vue.effectScope()
  const messageAlerts = services.messageAlerts || { state: Vue.reactive({
    hasSnapshot: false, items: [], total: 0, banner: null, error: '', revision: 0
  }) }
  const environment = { ...Vue,
    session: Vue.reactive({ user: { id: 'seller' } }), messageAlerts,
    invitation: { list: empty }, notification: { list: empty }, plan: {}, conversation: { list: empty },
    appSystemPushEnabled: false, contentNames: { market: '二手', lost_found: '失物', plan: '搭子', help: '互助' },
    defineProps: () => ({ aboveActions: false }), errorText: error => error.message,
    formatTime: value => value || '', requestSubscription: async () => ({}),
    onShow: fn => hooks.show.push(fn), onHide: fn => hooks.hide.push(fn), onUnload: fn => hooks.unload.push(fn),
    uni: { navigateTo() {} }, ...services }
  const context = vm.createContext(environment)
  scope.run(() => vm.runInContext(`${script}\nglobalThis.api={${bindings.join(',')}}`, context, { filename: file }))
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file,
    compilerOptions: { mode: 'function', isCustomElement: () => true } })
  assert.deepEqual(template.errors, [])
  const render = new Function('Vue', template.code)(Vue)
  const api = context.api
  const renderContext = Vue.proxyRefs({ ...environment, ...api, aboveActions: false })
  t.after(() => { hooks.unload.forEach(fn => fn()); scope.stop() })
  return { ...api, alerts: messageAlerts.state, session: environment.session, hooks,
    render: () => render(renderContext, []), show: () => hooks.show.forEach(fn => fn()), hide: () => hooks.hide.forEach(fn => fn()) }
}
const nodes = vnode => !vnode || typeof vnode !== 'object' ? [] : [vnode,
  ...(Array.isArray(vnode.children) ? vnode.children.flatMap(nodes) : [])]
const text = vnode => typeof vnode === 'string' ? vnode : typeof vnode?.children === 'string' ? vnode.children
  : Array.isArray(vnode?.children) ? vnode.children.map(text).join(' ') : ''
const hasClass = (node, name) => String(node.props?.class || '').split(/\s+/).includes(name)
const findClass = (view, name) => nodes(view.render()).filter(node => hasClass(node, name))
const sourceButton = (view, label) => findClass(view, 'source-tab').find(node => text(node).trim() === label)
const hasDot = button => nodes(button).some(node => hasClass(node, 'source-unread-dot'))

test('来源红点来自全部未读，当前筛选和列表分页不隐藏其他来源提示', async t => {
  const calls = []
  const row = message('visible-market', 'market', 2)
  const alerts = { state: Vue.reactive({ hasSnapshot: true, total: 4, revision: 1,
    items: [row, message('not-on-this-page', 'lost_found'), contact('helper', 'help')], error: '' }) }
  const page = subject(t, 'pages/messages/index.vue', { messageAlerts: alerts,
    conversation: { list: async params => { calls.push(params); return { items: [row], nextCursor: 'more' } } } })
  page.show(); await flush()
  assert.equal(hasDot(sourceButton(page, '全部')), true)
  assert.equal(sourceButton(page, '全部').props['aria-label'], '全部，4 条未读')
  assert.equal(sourceButton(page, '二手').props['aria-label'], '二手，2 条未读')
  assert.equal(hasDot(sourceButton(page, '失物')), true)
  assert.equal(hasDot(sourceButton(page, '互助')), true)
  assert.equal(hasDot(sourceButton(page, '搭子')), false)
  sourceButton(page, '二手').props.onTap(); await flush()
  assert.equal(calls.at(-1).contentType, 'market')
  assert.equal(hasDot(sourceButton(page, '失物')), true)
  assert.equal(sourceButton(page, '全部').props['aria-label'], '全部，4 条未读')

  // Run the page's actual Vue watcher: only the still-unread help remains.
  alerts.state.items = [contact('helper', 'help')]
  alerts.state.total = 1
  alerts.state.revision++
  await flush()
  assert.equal(hasDot(sourceButton(page, '二手')), false)
  assert.equal(hasDot(sourceButton(page, '失物')), false)
  assert.equal(hasDot(sourceButton(page, '互助')), true)
  assert.equal(sourceButton(page, '全部').props['aria-label'], '全部，1 条未读')
})

test('首轮轮询尚未成功时列表未读仍可见，确认已读后旧列表不会复活角标', async t => {
  const rows = [message('text', 'market', 2), contact('first-contact', 'lost_found')]
  const page = subject(t, 'pages/messages/index.vue', { conversation: {
    list: async () => ({ items: rows, nextCursor: null })
  } })
  page.show(); await flush()
  assert.equal(findClass(page, 'unread-badge').length, 2)
  assert.equal(sourceButton(page, '全部').props['aria-label'], '全部，3 条未读')
  assert.equal(hasDot(sourceButton(page, '二手')), true)
  assert.equal(hasDot(sourceButton(page, '失物')), true)
  assert.match(text(page.render()), /对方想联系这条发布/)

  page.alerts.error = '新消息检查暂时失败，正在重试'
  await flush()
  assert.equal(findClass(page, 'unread-badge').length, 2)
  page.alerts.hasSnapshot = true
  page.alerts.items = []
  page.alerts.revision++
  await flush()
  assert.equal(page.conversations.value.length, 2)
  assert.equal(findClass(page, 'unread-badge').length, 0)
  assert.equal(hasDot(sourceButton(page, '全部')), false)
  assert.equal(findClass(page, 'unread-summary').length, 0)
})

test('首次未读检查失败时切换来源，已知的其他来源红点仍保留且账号切换会清空', async t => {
  const rows = [message('text', 'market', 2), contact('first-contact', 'lost_found')]
  const page = subject(t, 'pages/messages/index.vue', { conversation: {
    list: async (params = {}) => ({ items: rows.filter(row => !params.contentType || row.contentType === params.contentType), nextCursor: null })
  } })
  page.show(); await flush()
  page.alerts.error = '新消息检查暂时失败，正在重试'
  sourceButton(page, '二手').props.onTap(); await flush()
  assert.equal(page.conversations.value.length, 1)
  assert.equal(hasDot(sourceButton(page, '失物')), true)
  assert.equal(sourceButton(page, '全部').props['aria-label'], '全部，3 条未读')
  page.hide()
  page.session.user = { id: 'another-seller' }
  await flush()
  assert.equal(hasDot(sourceButton(page, '全部')), false)
})

test('较旧的全局空快照不能遮掉较新列表响应，列表读取票据在请求前捕获并交给共享提醒', async t => {
  const list = deferred(), sequence = [], observed = []
  const ticket = { account: 'seller', generation: 1, tick: 1 }
  const alerts = { state: Vue.reactive({ hasSnapshot: true, hasKnownUnread: false,
    total: 0, items: [], revision: 1, error: '' }),
  captureRead() { sequence.push('capture'); return ticket },
  observeConversations(rows, receivedTicket) {
    observed.push({ rows, ticket: receivedTicket })
    alerts.state.items = rows
    alerts.state.total = 1
    alerts.state.hasKnownUnread = true
    alerts.state.revision++
  } }
  const page = subject(t, 'pages/messages/index.vue', { messageAlerts: alerts,
    conversation: { list: () => { sequence.push('list'); return list.promise } } })
  page.show(); await flush()
  assert.deepEqual(sequence, ['capture', 'list'])
  assert.equal(hasDot(sourceButton(page, '二手')), false)
  list.resolve({ items: [contact('newer-list')], nextCursor: null })
  await flush()
  assert.equal(observed.length, 1)
  assert.equal(observed[0].ticket, ticket)
  assert.equal(observed[0].rows[0].id, 'newer-list')
  assert.equal(hasDot(sourceButton(page, '二手')), true)
  assert.equal(findClass(page, 'unread-badge').length, 1)
})

test('更多会话也将当前票据与响应交给共享提醒，已知未读优先于本页回退', async t => {
  const tickets = [], observed = []
  const alerts = { state: Vue.reactive({ hasSnapshot: false, hasKnownUnread: false,
    total: 0, items: [], revision: 0, error: '' }),
  captureRead() { const ticket = { index: tickets.length }; tickets.push(ticket); return ticket },
  observeConversations(rows, ticket) {
    observed.push(ticket)
    const byId = new Map(alerts.state.items.map(row => [row.id, row]))
    for (const row of rows) byId.set(row.id, row)
    alerts.state.items = [...byId.values()]
    alerts.state.hasKnownUnread = true
    alerts.state.total = alerts.state.items.length
    alerts.state.revision++
  } }
  const page = subject(t, 'pages/messages/index.vue', { messageAlerts: alerts, conversation: {
    list: async (params = {}) => params.cursor ? { items: [contact('second-page', 'lost_found')], nextCursor: null }
      : { items: [contact('first-page')], nextCursor: 'more' }
  } })
  page.show(); await flush()
  page.moreConversations(); await flush()
  assert.equal(tickets.length, 2)
  assert.equal(observed.length, 2)
  assert.equal(observed[1], tickets[1])
  assert.equal(page.alerts.hasSnapshot, false)
  assert.equal(page.alerts.hasKnownUnread, true)
  assert.equal(sourceButton(page, '全部').props['aria-label'], '全部，2 条未读')
  assert.equal(hasDot(sourceButton(page, '失物')), true)
  assert.equal(page.fallbackUnread.value.length, 0)
})

test('首次联系和文字提示使用不同标题与预览，显示/隐藏和点击沿用真实组件钩子', async t => {
  const opened = []
  const alerts = { state: Vue.reactive({ banner: contact('chat'), total: 1 }),
    open: id => opened.push(id), dismiss: () => { alerts.state.banner = null } }
  const notice = subject(t, 'components/MessageNotice.vue', { messageAlerts: alerts })
  assert.equal(findClass(notice, 'message-notice').length, 0)
  notice.show(); await flush()
  assert.match(text(notice.render()), /联系同学.*发起了联系/)
  assert.match(text(notice.render()), /关于「测试教材」的新联系/)
  assert.doesNotMatch(text(notice.render()), /你发布的/)
  findClass(notice, 'message-notice-open')[0].props.onTap({ stopPropagation() {} })
  assert.deepEqual(opened, ['chat'])
  findClass(notice, 'message-notice-close')[0].props.onTap({ stopPropagation() {} })
  await flush()
  assert.equal(alerts.state.total, 1)
  assert.equal(findClass(notice, 'message-notice').length, 0)

  alerts.state.banner = { ...contact('chat'), ...message('chat', 'market') }
  await flush()
  assert.match(text(notice.render()), /发来新私信/)
  assert.match(text(notice.render()), /这条发布还在吗/)
  assert.doesNotMatch(text(notice.render()), /的新联系/)
  notice.hide(); await flush()
  assert.equal(findClass(notice, 'message-notice').length, 0)
  notice.show(); await flush()
  assert.equal(findClass(notice, 'message-notice').length, 1)
})
