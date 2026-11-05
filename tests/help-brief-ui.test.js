import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import * as brief from '../src/domain/help/brief.js'
import { contentNames, contentTypes, contentUrl, localToIso, formatTime } from '../src/utils/routes.js'

const flush = async () => { await Vue.nextTick(); await new Promise(resolve => setImmediate(resolve)) }
function component(t, file, { props: initialProps = {}, ...overrides } = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  const { descriptor } = parse(source), compiled = compileScript(descriptor, { id: file })
  const imported = new Set(Object.keys(compiled.imports))
  const names = Object.entries(compiled.bindings).filter(([name, type]) => !imported.has(name) && type !== 'props').map(([name]) => name)
  const script = descriptor.scriptSetup.content.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const props = Vue.reactive(initialProps), session = Vue.reactive({ user: { id: 'me' } })
  const hooks = { load: [], show: [], hide: [], unload: [] }, routes = [], toasts = []
  let guarded
  const scope = Vue.effectScope()
  const environment = { ...Vue, ...brief, contentNames, contentTypes, contentUrl, localToIso, formatTime, session,
    config: { apiMode: 'http' }, errorText: error => error.message,
    defineProps: () => props, useUnsavedChanges: value => { guarded = value },
    onLoad: fn => hooks.load.push(fn), onShow: fn => hooks.show.push(fn), onHide: fn => hooks.hide.push(fn), onUnload: fn => hooks.unload.push(fn),
    uni: { redirectTo: ({ url }) => routes.push(url), navigateTo: ({ url }) => routes.push(url), showToast: options => toasts.push(options) },
    openContent: (type, id) => routes.push(contentUrl(type, id)), openProfile() {},
    ...overrides }
  const context = vm.createContext(environment)
  scope.run(() => vm.runInContext(`${script}\nglobalThis.subject = {${names.join(',')}}`, context, { filename: file }))
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file,
    compilerOptions: { mode: 'function', isCustomElement: () => true } })
  assert.deepEqual(template.errors, [])
  // A DOM is unnecessary: the template's original model-value/event handlers
  // still execute, while element mounting directives have no DOM to attach to.
  const render = new Function('Vue', template.code)({ ...Vue, withDirectives: vnode => vnode })
  const api = context.subject
  const renderContext = Vue.proxyRefs(new Proxy({ ...environment, ...api }, {
    get(target, key) { return key in props ? props[key] : target[key] },
    has(target, key) { return key in props || key in target }
  }))
  t.after(() => { hooks.unload.forEach(fn => fn()); scope.stop() })
  return { ...api, props, session, hooks, routes, toasts, dirty: () => guarded?.value, render: () => render(renderContext, []) }
}
function nodes(vnode) {
  return !vnode || typeof vnode !== 'object' ? [] : [vnode, ...(Array.isArray(vnode.children) ? vnode.children.flatMap(nodes) : [])]
}
const text = vnode => typeof vnode === 'string' ? vnode : typeof vnode?.children === 'string' ? vnode.children
  : Array.isArray(vnode?.children) ? vnode.children.map(text).join(' ') : ''
const button = (page, label) => nodes(page.render()).find(node => node.type === 'button' && text(node).trim() === label)
const input = (page, placeholder) => nodes(page.render()).find(node => node.type === 'input' && node.props?.placeholder === placeholder)
const update = (node, value) => node.props['onUpdate:modelValue'](value)

async function publisher(t, type = 'help', create = async params => ({ ...params, type, id: 'new-content' })) {
  const requests = []
  const page = component(t, 'pages/content/publish.vue', { api: {
    [type === 'lost_found' ? 'lostFound' : type]: { create: async params => { requests.push(structuredClone(params)); return create(params) } }
  } })
  await page.hooks.load[0]({ type })
  return { page, requests }
}
const fillRequired = page => Object.assign(page.form, { title: '校园生活需要帮忙', body: '希望同学一起解决问题', category: '摄影', location: '图书馆' })

test('求助说明均可留空，三个沟通按钮与真实输入事件纳入草稿保护', async t => {
  const { page, requests } = await publisher(t)
  assert.equal(page.dirty(), false)
  assert.equal(button(page, '可商量').props['aria-pressed'], true)
  update(input(page, '如周六下午、时间可商量'), '周六下午')
  assert.equal(page.dirty(), true)
  update(input(page, '如周六下午、时间可商量'), '')
  assert.equal(page.dirty(), false)
  update(input(page, '1～480，可留空'), '30')
  assert.equal(page.dirty(), true)
  update(input(page, '1～480，可留空'), '')
  assert.equal(page.dirty(), false)
  button(page, '线上沟通').props.onTap()
  assert.equal(page.dirty(), true)
  assert.equal(button(page, '线上沟通').props['aria-pressed'], true)
  button(page, '线下见面').props.onTap()
  assert.equal(page.helpBrief.meetingMode, 'offline')
  button(page, '可商量').props.onTap()
  assert.equal(page.dirty(), false)
  fillRequired(page)
  await button(page, '保存发布').props.onTap()
  assert.equal(requests.length, 1)
  assert.deepEqual([requests[0].preferredTime, requests[0].estimatedMinutes, requests[0].meetingMode], ['', null, 'flexible'])
  assert.equal(page.dirty(), false)
  assert.equal(page.routes[0], '/pages/content/detail?type=help&id=new-content')
})

test('预计用时非法时不发请求，边界整数及空白正确转换，时间不能超80字', async t => {
  for (const minutes of ['0', '-1', '481', '1.5', '1e2', 'abc', '9007199254740993']) {
    const { page, requests } = await publisher(t)
    fillRequired(page)
    update(input(page, '1～480，可留空'), minutes)
    await page.save()
    assert.equal(requests.length, 0, `不应提交${minutes}分钟`)
    assert.match(page.error.value, /预计用时/)
    assert.equal(page.saving.value, false)
  }
  for (const [raw, expected] of [['1', 1], ['480', 480], [' 30 ', 30], ['   ', null]]) {
    const { page, requests } = await publisher(t)
    fillRequired(page)
    update(input(page, '1～480，可留空'), raw)
    await page.save()
    assert.equal(requests[0].estimatedMinutes, expected)
  }
  const { page, requests } = await publisher(t)
  fillRequired(page)
  page.helpBrief.preferredTime = '时'.repeat(81)
  await page.save()
  assert.equal(requests.length, 0)
  assert.match(page.error.value, /期望时间/)
  page.helpBrief.preferredTime = '时'.repeat(80)
  await page.save()
  assert.equal(requests[0].preferredTime.length, 80)
})

test('求助网络重试复用幂等编号，任一说明变更都会创建新发布意图', async t => {
  const { page, requests } = await publisher(t, 'help', async () => { throw new Error('网络结果不明') })
  fillRequired(page)
  update(input(page, '如周六下午、时间可商量'), ' 周六下午 ')
  update(input(page, '1～480，可留空'), '30')
  button(page, '线上沟通').props.onTap()
  await page.save()
  await page.save()
  assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey)
  assert.deepEqual([requests[0].preferredTime, requests[0].estimatedMinutes, requests[0].meetingMode], ['周六下午', 30, 'online'])
  page.helpBrief.preferredTime = '周日中午'
  await page.save()
  page.helpBrief.estimatedMinutes = '45'
  await page.save()
  button(page, '线下见面').props.onTap()
  await page.save()
  assert.equal(new Set(requests.map(request => request.idempotencyKey)).size, 4)
  assert.equal(page.dirty(), true)
  page.session.user = { id: 'other' }
  await flush()
  await page.save()
  assert.equal(requests.length, 5)
  assert.match(page.error.value, /登录身份已改变/)
})

test('其他模块不显示或提交求助说明，保留原计划、出售、求购与失物字段', async t => {
  for (const [type, marketType] of [['plan'], ['market', 'sell'], ['market', 'buy'], ['lost_found']]) {
    const { page, requests } = await publisher(t, type)
    fillRequired(page)
    page.helpBrief.preferredTime = '不应进入其他模块'
    page.helpBrief.estimatedMinutes = '非法分钟'
    page.helpBrief.meetingMode = 'online'
    assert.equal(input(page, '1～480，可留空'), undefined)
    if (type === 'market') {
      page.marketType.value = marketType
      page.price.value = '35.50'; page.budget.value = '50.00'
      page.form.condition = '九成新'; page.form.keywords = '教材'
    }
    if (type === 'lost_found') page.form.images = ['https://files.example/test-only.png']
    await page.save()
    assert.equal(requests.length, 1)
    for (const key of ['preferredTime', 'estimatedMinutes', 'meetingMode']) assert.equal(key in requests[0], false)
    if (type === 'plan') assert.equal(requests[0].capacity, 2)
    if (type === 'market') assert.equal(requests[0].marketType, marketType)
    if (type === 'market' && marketType === 'sell') assert.equal(requests[0].priceCents, 3550)
    if (type === 'market' && marketType === 'buy') assert.equal(requests[0].budgetCents, 5000)
    if (type === 'lost_found') assert.equal(requests[0].lostKind, 'lost')
  }
})

test('求助卡片展示服务进度和已填说明，旧记录保守回退且点击仍回原详情', async t => {
  const item = { id: 'help-1', type: 'help', title: '证件照求助', body: '需要同学帮忙拍照', ownerId: 'owner', status: 'open',
    helpProgress: 'awaiting_confirmation', preferredTime: '周六下午', estimatedMinutes: 30, meetingMode: 'online' }
  const card = component(t, 'components/ContentCard.vue', { props: { item } })
  assert.match(text(card.render()), /等待双方确认/)
  assert.match(text(card.render()), /周六下午 · 约30分钟 · 线上沟通/)
  card.render().props.onTap()
  assert.deepEqual(card.routes, ['/pages/content/detail?type=help&id=help-1'])
  for (const [progress, label] of [['waiting', '等待帮助'], ['helping', '已有帮助者'], ['resolved', '已解决'], ['closed', '已结束']]) {
    card.props.item.helpProgress = progress
    await flush()
    assert.match(text(card.render()), new RegExp(label))
  }
  card.props.item = { id: 'old', type: 'help', title: '旧求助', ownerId: 'owner', status: 'open' }
  await flush()
  assert.match(text(card.render()), /等待帮助/)
  assert.equal(card.helpBrief.value, '')
  card.props.item.selectedApplicationId = 'old-selected'
  await flush()
  assert.match(text(card.render()), /已有帮助者/)
  assert.doesNotMatch(text(card.render()), /等待发布者确认|等待帮助者确认|undefined|NaN/)
  card.props.item = { id: 'sale', type: 'market', title: '教材', status: 'active', priceCents: 3550, ...brief.normalizeHelpBrief(item) }
  await flush()
  assert.match(text(card.render()), /35\.50/)
  assert.equal(card.helpBrief.value, '')
  assert.doesNotMatch(text(card.render()), /周六下午|等待双方确认/)
})

test('详情采用服务进度更新公开说明，旧求助不生成预约时间或确认者信息', async t => {
  const help = { id: 'help-1', type: 'help', title: '校园维修求助', ownerId: 'owner', status: 'open', visibility: 'public',
    helpProgress: 'helping', preferredTime: '可商量', estimatedMinutes: 45, meetingMode: 'offline', images: [] }
  const detail = component(t, 'pages/content/detail.vue', { api: { help: { get: async () => help },
    favorite: { list: async () => ({ items: [], nextCursor: null }) } } })
  detail.hooks.load[0]({ type: 'help', id: help.id })
  detail.hooks.show[0]()
  await flush()
  assert.match(text(detail.render()), /已有帮助者/)
  assert.match(text(detail.render()), /可商量 · 约45分钟 · 线下见面/)
  detail.updateHelp({ ...help, helpProgress: 'awaiting_confirmation' })
  assert.match(text(detail.render()), /等待双方确认/)
  detail.updateHelp({ ...help, helpProgress: 'resolved' })
  assert.match(text(detail.render()), /已解决/)
  detail.updateHelp({ id: help.id, type: 'help', title: '旧求助', ownerId: 'owner', status: 'open', images: [] })
  assert.equal(detail.helpBrief.value, '')
  assert.match(text(detail.render()), /等待帮助/)
  assert.doesNotMatch(text(detail.render()), /约undefined|Invalid Date|等待发布者确认|等待帮助者确认/)
})
