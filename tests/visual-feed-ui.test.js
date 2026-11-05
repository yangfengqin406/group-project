import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { contentNames, contentUrl, formatTime } from '../src/utils/routes.js'
import { formatHelpBrief, helpProgressLabel } from '../src/domain/help/brief.js'

const flush = async () => { await Vue.nextTick(); await new Promise(resolve => setImmediate(resolve)) }
function subject(t, file, { props: initialProps, ...services }) {
  const { descriptor } = parse(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'))
  const compiled = compileScript(descriptor, { id: file }), imported = new Set(Object.keys(compiled.imports))
  const names = Object.entries(compiled.bindings).filter(([name, type]) => !imported.has(name) && type !== 'props').map(([name]) => name)
  const script = descriptor.scriptSetup.content.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const props = Vue.reactive(initialProps), hooks = { show: [], unmount: [] }, routes = [], profiles = []
  const scope = Vue.effectScope()
  const environment = { ...Vue, contentNames, contentUrl, formatTime, formatHelpBrief, helpProgressLabel,
    errorText: error => error.message, defineProps: () => props,
    onShow: fn => hooks.show.push(fn), onUnmounted: fn => hooks.unmount.push(fn),
    openContent: (type, id) => routes.push(contentUrl(type, id)), openProfile: id => profiles.push(id),
    uni: { navigateTo: ({ url }) => routes.push(url), redirectTo: ({ url }) => routes.push(url) }, ...services }
  const context = vm.createContext(environment)
  scope.run(() => vm.runInContext(`${script}\nglobalThis.subject = {${names.join(',')}}`, context, { filename: file }))
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file,
    compilerOptions: { mode: 'function', isCustomElement: () => true } })
  assert.deepEqual(template.errors, [])
  const render = new Function('Vue', template.code)({ ...Vue, withDirectives: vnode => vnode }), api = context.subject
  const renderContext = Vue.proxyRefs(new Proxy({ ...environment, ...api }, {
    get(target, key) { return key in props ? props[key] : target[key] },
    has(target, key) { return key in props || key in target }
  }))
  t.after(() => { hooks.unmount.forEach(fn => fn()); scope.stop() })
  return { ...api, props, hooks, routes, profiles, render: () => render(renderContext, []) }
}
function nodes(vnode) {
  return !vnode || typeof vnode !== 'object' ? [] : [vnode, ...(Array.isArray(vnode.children) ? vnode.children.flatMap(nodes) : [])]
}
const text = vnode => typeof vnode === 'string' ? vnode : typeof vnode?.children === 'string' ? vnode.children
  : Array.isArray(vnode?.children) ? vnode.children.map(text).join(' ') : ''
const button = (view, label) => nodes(view.render()).find(node => node.type === 'button' && text(node).trim() === label)
const input = (view, placeholder) => nodes(view.render()).find(node => node.type === 'input' && node.props?.placeholder === placeholder)
const stop = { stopPropagation() {}, preventDefault() {} }
function feed(t, type, extra = {}) {
  const requests = []
  const view = subject(t, 'components/FeedList.vue', {
    props: { type, title: contentNames[type], subtitle: '校园生活', showFilters: false, showLostFilters: false,
      categoryOptions: [], statusOptions: [], marketTypeOptions: [], campusOptions: [], ...extra },
    api: { [type === 'lost_found' ? 'lostFound' : type]: { list: async params => {
      requests.push(structuredClone(params)); return { items: [], nextCursor: 'opaque-next-page' }
    } } }
  })
  return { view, requests }
}

test('列表发布按钮说明实际模块，二手求购筛选沿用已有发布参数', async t => {
  for (const [type, label] of [['help', '发布求助'], ['plan', '发布计划'], ['lost_found', '发布失物']]) {
    const { view } = feed(t, type)
    button(view, label).props.onTap()
    assert.deepEqual(view.routes, [`/pages/content/publish?type=${type}`])
  }
  const { view, requests } = feed(t, 'market', { marketTypeOptions: [{ label: '闲置', value: 'sell' }, { label: '求购', value: 'buy' }] })
  button(view, '发布闲置').props.onTap()
  button(view, '求购').props.onTap()
  await flush()
  assert.equal(requests.at(-1).marketType, 'buy')
  button(view, '发布求购').props.onTap()
  assert.deepEqual(view.routes, ['/pages/content/publish?type=market', '/pages/content/publish?type=market&marketType=buy'])
})

test('紧凑筛选仍支持自定义技能、状态、关键词组合及服务游标分页，清除后恢复全部', async t => {
  const { view, requests } = feed(t, 'help', { showFilters: true, categoryOptions: ['摄影', '英语'],
    statusOptions: [{ label: '全部状态', value: '' }, { label: '求助中', value: 'open' }, { label: '已完成', value: 'completed' }] })
  view.hooks.show[0]()
  await flush()
  button(view, '摄影').props.onTap()
  await flush()
  assert.equal(requests.at(-1).category, '摄影')
  button(view, '筛选').props.onTap()
  input(view, '也可输入完整类别').props['onUpdate:modelValue']('校园维修')
  input(view, '搜索标题或说明').props['onUpdate:modelValue']('  自行车  ')
  const statusPicker = nodes(view.render()).find(node => node.type === 'picker' && node.props?.range?.some(option => option.value === 'completed'))
  statusPicker.props.onChange({ detail: { value: 1 } })
  await flush()
  await button(view, '应用筛选').props.onTap()
  await flush()
  assert.equal(view.filtersExpanded.value, false)
  const applied = requests.at(-1)
  assert.deepEqual([applied.keyword, applied.category, applied.status, applied.cursor], ['自行车', '校园维修', 'open', null])
  assert.match(text(view.render()), /当前筛选：.*自行车.*校园维修.*求助中/)
  await button(view, '加载更多').props.onTap()
  await flush()
  assert.deepEqual([requests.at(-1).keyword, requests.at(-1).category, requests.at(-1).status, requests.at(-1).cursor],
    ['自行车', '校园维修', 'open', 'opaque-next-page'])
  button(view, '清除筛选').props.onTap()
  await flush()
  assert.deepEqual([requests.at(-1).keyword, requests.at(-1).category, requests.at(-1).status], ['', '', ''])
  button(view, '找搭子').props.onTap()
  assert.equal(view.routes.at(-1), '/pages/partner/index')
})

test('失物分类、丢失拾获和校区筛选仍可操作，错误保留真实重试入口', async t => {
  const { view, requests } = feed(t, 'lost_found', { showLostFilters: true })
  button(view, '钥匙').props.onTap()
  await flush()
  button(view, '筛选').props.onTap()
  button(view, '我拾到的').props.onTap()
  await flush()
  assert.equal(requests.at(-1).category, 'key')
  assert.equal(requests.at(-1).lostKind, 'found')
  const { view: market, requests: marketRequests } = feed(t, 'market', {
    campusOptions: [{ label: '全部校区', value: '' }, { label: '主校区', value: 'north' }] })
  button(market, '筛选').props.onTap()
  nodes(market.render()).find(node => node.type === 'picker').props.onChange({ detail: { value: 1 } })
  await flush()
  assert.equal(marketRequests.at(-1).campusId, 'north')
  view.error.value = '校园服务暂不可用'
  assert.match(text(view.render()), /校园服务暂不可用/)
  const before = requests.length
  await button(view, '重新读取').props.onTap()
  await flush()
  assert.equal(requests.length, before + 1)
})

test('内容卡片独立显示公开状态，照片失败可重试，作者与整卡仍分别回原入口', async t => {
  const item = { id: 'help-1', type: 'help', ownerId: 'owner-1', owner: { nickname: '校园同学' }, title: '帮忙检修自行车',
    status: 'open', helpProgress: 'awaiting_confirmation', preferredTime: '周六下午', estimatedMinutes: 30, meetingMode: 'offline',
    images: ['https://files.example/bike.png'], pendingCount: 9, ownerConfirmedAt: 'private-confirmation' }
  const card = subject(t, 'components/ContentCard.vue', { props: { item } })
  assert.match(text(card.render()), /等待双方确认/)
  assert.match(text(card.render()), /周六下午 · 约30分钟 · 线下见面/)
  assert.doesNotMatch(text(card.render()), /9 份申请|private-confirmation/)
  const photo = nodes(card.render()).find(node => node.type === 'ServiceImage')
  photo.props.onError()
  await flush()
  assert.match(text(card.render()), /图片未加载/)
  button(card, '重试').props.onTap(stop)
  await flush()
  assert.equal(nodes(card.render()).find(node => node.type === 'ServiceImage').props.src, item.images[0])
  assert.equal(card.routes.length, 0)
  nodes(card.render()).find(node => node.props?.role === 'link').props.onTap(stop)
  assert.deepEqual(card.profiles, ['owner-1'])
  assert.equal(card.routes.length, 0)
  card.render().props.onTap()
  assert.deepEqual(card.routes, [contentUrl('help', 'help-1')])
  card.props.item = { id: 'buy-1', type: 'market', marketType: 'buy', title: '求购教材', budgetCents: 5000, status: 'active' }
  await flush()
  assert.match(text(card.render()), /预算\s*¥50\.00/)
  assert.doesNotMatch(text(card.render()), /等待双方确认/)
})
