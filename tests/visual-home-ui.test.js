import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { contentNames, contentUrl, formatTime } from '../src/utils/routes.js'
import { getHelpProgressLabel } from '../src/domain/help/brief.js'

const flush = async () => { await Vue.nextTick(); await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const empty = async () => ({ items: [], nextCursor: null })
const snapshot = (pearls = 25, marker = 'current') => ({ pearls,
  daily: { publish: { awarded: 2, limit: 3 }, helpCompletion: { awarded: 1, limit: 2 } },
  rules: { publish: { pearls: 5 }, helpCompletion: { helperPearls: 15, authorPearls: 5 } },
  recent: Array.from({ length: 5 }, (_, i) => ({ eventId: `${marker}-${i}`, kind: 'publish', sourceType: 'help',
    createdAt: '2026-10-28T08:00:00Z', delta: 5, reason: 'awarded' })) })

function subject(t, file, { props: initialProps = {}, session: initialSession, ...services } = {}) {
  const { descriptor } = parse(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'))
  const compiled = compileScript(descriptor, { id: file }), imported = new Set(Object.keys(compiled.imports))
  const bindings = Object.entries(compiled.bindings).filter(([name, type]) => !imported.has(name) && type !== 'props' && type !== 'props-aliased').map(([name]) => name)
  const script = descriptor.scriptSetup.content.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const props = Vue.reactive(initialProps), session = initialSession || Vue.reactive({ user: { id: 'me' } })
  const hooks = { show: [], hide: [], unload: [], unmount: [] }, routes = [], profiles = [], scope = Vue.effectScope()
  const environment = { ...Vue, session, contentNames, contentUrl, formatTime, getHelpProgressLabel,
    defineProps: () => props, defineEmits: () => () => {}, defineExpose() {}, errorText: error => error.message,
    config: { apiMode: 'http' }, demoUsers: () => [], switchDemoUser() {}, resetDemo() {},
    openProfile: id => profiles.push(id), requestSubscription: async () => ({}), idempotencyKey: () => 'operation-key',
    onShow: fn => hooks.show.push(fn), onHide: fn => hooks.hide.push(fn), onUnload: fn => hooks.unload.push(fn), onUnmounted: fn => hooks.unmount.push(fn),
    uni: { navigateTo: ({ url }) => routes.push(url), showToast() {} }, ...services }
  const context = vm.createContext(environment)
  scope.run(() => vm.runInContext(`${script}\nglobalThis.subject={${bindings.join(',')}}`, context, { filename: file }))
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file,
    compilerOptions: { mode: 'function', isCustomElement: () => true } })
  assert.deepEqual(template.errors, [])
  const render = new Function('Vue', template.code)(Vue)
  const api = context.subject
  const renderContext = Vue.proxyRefs(new Proxy({ ...environment, ...api }, {
    get(target, key) { return key in props ? props[key] : target[key] },
    has(target, key) { return key in props || key in target }
  }))
  t.after(() => { hooks.unmount.forEach(fn => fn()); scope.stop() })
  return { ...api, props, session, hooks, routes, profiles, render: () => render(renderContext, []) }
}
const nodes = vnode => !vnode || typeof vnode !== 'object' ? [] : [vnode, ...(Array.isArray(vnode.children) ? vnode.children.flatMap(nodes) : [])]
const text = vnode => typeof vnode === 'string' ? vnode : typeof vnode?.children === 'string' ? vnode.children
  : Array.isArray(vnode?.children) ? vnode.children.map(text).join(' ') : ''
const button = (view, label) => nodes(view.render()).find(node => node.type === 'button' && text(node).trim() === label)
const child = (view, name) => nodes(view.render()).find(node => typeof node.type === 'string' && node.type.toLowerCase() === name.toLowerCase())

test('自己的家恢复完整资料和校园记录，新互助与珍珠只嵌入原卡片且原入口可用', async t => {
  let subscriptions = 0, logouts = 0, reads = 0
  const published = { id: 'post-one', type: 'market', title: '我的旧教材', status: 'active', createdAt: '2026-10-28T08:00:00Z' }
  const home = subject(t, 'pages/home/index.vue', {
    user: { getProfile: async () => ({ id: 'me', nickname: '小林', campusName: '主校区', bio: '保留原来的自我介绍', skillTags: ['摄影'] }) },
    myContent: { list: async () => { reads++; return { items: [published], nextCursor: null } } },
    favorite: { list: async () => ({ items: [{ contentType: 'market', contentId: 'favorite-one', content: { title: '收藏的台灯' } }], nextCursor: null }) },
    auth: { logout: async () => { logouts++ } }, requestSubscription: async () => { subscriptions++; return {} }
  })
  home.hooks.show.forEach(fn => fn()); await flush()
  assert.ok(child(home, 'MyHelp'))
  assert.equal(child(home, 'ContributionRewards').props['show-actions'], false)
  assert.equal(Object.hasOwn(child(home, 'VillageHeader').props, 'compact'), false)
  assert.ok(Object.hasOwn(child(home, 'MyHelp').props, 'embedded'))
  assert.ok(Object.hasOwn(child(home, 'ContributionRewards').props, 'embedded'))
  const panels = nodes(home.render()).filter(node => node.type === 'view' && String(node.props?.class || '').split(' ').includes('panel'))
  const profilePanel = panels.find(node => text(node).includes('个人空间'))
  const petPanel = panels.find(node => text(node).includes('我的宠物'))
  assert.ok(nodes(profilePanel).some(node => node.type === 'MyHelp'))
  assert.ok(nodes(petPanel).some(node => node.type === 'ContributionRewards'))
  assert.equal(button(home, '资料与设置'), undefined)
  assert.equal(button(home, '更多校园记录'), undefined)
  assert.match(text(home.render()), /保留原来的自我介绍|个人空间|摄影/)
  for (const label of ['编辑资料', '查看我的公开主页', '接收匹配通知', '账号与隐私', '退出账号']) assert.ok(button(home, label))
  button(home, '编辑资料').props.onTap()
  button(home, '查看我的公开主页').props.onTap()
  await button(home, '接收匹配通知').props.onTap()
  button(home, '账号与隐私').props.onTap()
  await button(home, '退出账号').props.onTap()
  assert.deepEqual(home.routes, ['/pages/profile/edit', '/rooms/settings/index'])
  assert.deepEqual(home.profiles, ['me'])
  assert.equal(subscriptions, 1)
  assert.equal(logouts, 1)
  for (const label of ['发布统计', '收藏的台灯', '近期发布']) assert.ok(text(home.render()).includes(label))
  assert.ok(child(home, 'ContentCard'))
  const favorite = nodes(home.render()).find(node => node.type === 'view' && text(node).trim() === `${contentNames.market} · 收藏的台灯`)
  assert.ok(favorite)
  favorite.props.onTap()
  assert.equal(home.routes.at(-1), contentUrl('market', 'favorite-one'))
  assert.ok(reads > 0)
  button(home, '去搭配').props.onTap()
  assert.equal(home.routes.at(-1), '/pages/pet/index')
})

test('自己的家换账号清除旧资料与记录，迟到请求不能恢复旧身份内容，错误始终可见', async t => {
  const stale = deferred()
  let reads = 0
  const home = subject(t, 'pages/home/index.vue', {
    user: { getProfile: () => ++reads === 2 ? stale.promise : Promise.resolve({ id: reads === 1 ? 'me' : 'other', nickname: reads === 1 ? '原用户' : '新用户' }) },
    myContent: { list: empty }, favorite: { list: empty }, auth: {}
  })
  home.hooks.show.forEach(fn => fn()); await flush()
  const older = home.load()
  home.session.user = { id: 'other' }; await flush()
  stale.resolve({ id: 'me', nickname: '旧请求里的原用户' }); await older; await flush()
  assert.equal(home.profile.value.id, 'other')
  assert.doesNotMatch(text(home.render()), /旧请求里的原用户/)
  home.error.value = '收藏记录暂不可用，请重试'
  assert.match(text(home.render()), /收藏记录暂不可用，请重试/)
})

test('嵌入珍珠默认只露余额与规则入口，次数流水展开可读且不改变业务状态', async t => {
  const card = subject(t, 'components/ContributionRewards.vue', { props: { compact: false, refreshKey: 0, showActions: false, embedded: true },
    rewards: { getState: async () => snapshot() } })
  await flush()
  assert.match(text(card.render()), /25 颗珍珠/)
  assert.doesNotMatch(text(card.render()), /今日发布奖励|今日互助完成奖励|帮助者 15|最近的校园贡献|重复内容不重复奖励/)
  assert.equal(button(card, '发布求助'), undefined)
  const toggle = button(card, '规则与记录')
  assert.equal(toggle.props['aria-expanded'], false)
  toggle.props.onTap()
  assert.equal(button(card, '收起规则与记录').props['aria-expanded'], true)
  assert.match(text(card.render()), /今日发布奖励 2\/3|今日互助完成奖励 1\/2/)
  assert.match(text(card.render()), /帮助者 15|发布者 5|最近的校园贡献/)
  button(card, '查看最近 5 条').props.onTap()
  assert.equal(card.shownHistory.value.length, 5)
  button(card, '收起规则与记录').props.onTap()
  assert.doesNotMatch(text(card.render()), /最近的校园贡献|帮助者 15/)
  assert.equal(card.state.value.pearls, 25)
  assert.equal(card.state.value.recent.length, 5)
})

test('珍珠卡默认入口仍兼容衣柜，读取失败始终显示错误而非零余额，换账号收起私有记录', async t => {
  const requests = []
  const card = subject(t, 'components/ContributionRewards.vue', { props: { compact: false, refreshKey: 0 },
    rewards: { getState: () => { const pending = deferred(); requests.push(pending); return pending.promise } } })
  requests[0].resolve(snapshot(17)); await flush()
  for (const label of ['发布求助', '看看谁需要帮助', '发布求购']) button(card, label).props.onTap()
  assert.deepEqual(card.routes, ['/pages/content/publish?type=help', '/pages/help/index', '/pages/content/publish?type=market&marketType=buy'])
  const failed = card.refresh()
  requests[1].reject(new Error('奖励读取失败'))
  await failed
  assert.match(text(card.render()), /奖励读取失败/)
  assert.doesNotMatch(text(card.render()), /17 颗珍珠|0 颗珍珠/)
  button(card, '规则与记录').props.onTap()
  const retry = card.refresh()
  card.session.user = { id: 'other' }; await flush()
  assert.equal(card.detailsExpanded.value, false)
  requests[2].resolve(snapshot(999, 'old')); await retry
  assert.equal(card.state.value, null)
  requests[3].resolve(snapshot(8, 'other')); await flush()
  assert.match(text(card.render()), /8 颗珍珠/)
  assert.doesNotMatch(text(card.render()), /最近的校园贡献|999/)
  card.props.compact = true
  assert.match(text(card.render()), /8 颗珍珠/)
})

test('我的互助轻标签仍可切换，待办和历史行动、发布入口都保持可达', async t => {
  const requests = []
  const panel = subject(t, 'components/MyHelp.vue', { props: { active: true, refreshKey: 0 },
    help: { listMine: async params => { requests.push(params.scope); return { items: [{ helpId: 'help-one', help: { id: 'help-one', title: '一起看一道题' },
      role: 'helper', actionRequired: params.scope === 'todo', actionLabel: '确认已解决', availability: 'available', progress: 'helping', updatedAt: '2026-10-28T08:00:00Z' }], nextCursor: null } } } })
  await flush()
  assert.equal(button(panel, '待我处理').props['aria-pressed'], true)
  button(panel, '确认已解决').props.onTap()
  button(panel, '我申请的').props.onTap(); await flush()
  assert.equal(button(panel, '我申请的').props['aria-pressed'], true)
  button(panel, '查看进展').props.onTap()
  button(panel, '发布求助').props.onTap(); button(panel, '看看谁需要帮助').props.onTap()
  assert.deepEqual(requests, ['todo', 'applied'])
  assert.deepEqual(panel.routes, [contentUrl('help', 'help-one'), contentUrl('help', 'help-one'), '/pages/content/publish?type=help', '/pages/help/index'])
})

test('嵌入互助默认一行真实提醒，展开仍有三栏和行动，收起重新读取todo而非拿历史空列表推断', async t => {
  const requests = []
  const panel = subject(t, 'components/MyHelp.vue', { props: { active: true, refreshKey: 0, embedded: true },
    help: { listMine: params => { const pending = deferred(); requests.push({ ...pending, scope: params.scope }); return pending.promise } } })
  assert.match(text(panel.render()), /我的互助|读取中/)
  assert.equal(button(panel, '查看').props['aria-expanded'], false)
  assert.equal(button(panel, '待我处理'), undefined)
  assert.doesNotMatch(text(panel.render()), /暂无待处理/)
  const todo = { helpId: 'todo-one', help: { id: 'todo-one', title: '待办原帖标题' }, role: 'owner',
    actionRequired: true, actionLabel: '选择帮助者', availability: 'available', pendingCount: 2, progress: 'waiting', updatedAt: '2026-10-28T08:00:00Z' }
  requests[0].resolve({ items: [todo], nextCursor: null }); await flush()
  assert.match(text(panel.render()), /有事项待处理/)
  assert.doesNotMatch(text(panel.render()), /待办原帖标题|2 份申请待选择/)
  button(panel, '查看').props.onTap()
  assert.equal(button(panel, '收起').props['aria-expanded'], true)
  for (const label of ['待我处理', '我发出的', '我申请的', '选择帮助者', '发布求助', '看看谁需要帮助']) assert.ok(button(panel, label))
  button(panel, '选择帮助者').props.onTap()
  assert.equal(panel.routes[0], contentUrl('help', 'todo-one'))
  button(panel, '我申请的').props.onTap(); await flush()
  requests[1].resolve({ items: [], nextCursor: null }); await flush()
  assert.doesNotMatch(text(panel.render()), /暂无待处理/)
  button(panel, '收起').props.onTap(); await flush()
  assert.equal(requests[2].scope, 'todo')
  assert.match(text(panel.render()), /读取中/)
  assert.doesNotMatch(text(panel.render()), /暂无待处理/)
  requests[2].resolve({ items: [todo], nextCursor: null }); await flush()
  assert.match(text(panel.render()), /有事项待处理/)
  assert.equal(button(panel, '待我处理'), undefined)
})

test('嵌入互助折叠时错误仍可重试，旧scope及旧账号请求不能篡改待办提示', async t => {
  const requests = []
  const panel = subject(t, 'components/MyHelp.vue', { props: { active: true, refreshKey: 0, embedded: true },
    help: { listMine: params => { const pending = deferred(); requests.push({ ...pending, scope: params.scope }); return pending.promise } } })
  requests[0].resolve({ items: [], nextCursor: null }); await flush()
  assert.match(text(panel.render()), /暂无待处理/)
  button(panel, '查看').props.onTap()
  button(panel, '我申请的').props.onTap(); await flush()
  button(panel, '收起').props.onTap(); await flush()
  requests[1].resolve({ items: [], nextCursor: null }); await flush()
  assert.equal(panel.loading.value, true)
  assert.doesNotMatch(text(panel.render()), /暂无待处理/)
  requests[2].reject(new Error('互助读取失败，请重试')); await flush()
  assert.equal(panel.panelExpanded.value, false)
  assert.match(text(panel.render()), /互助读取失败，请重试|读取未成功/)
  assert.doesNotMatch(text(panel.render()), /暂无待处理/)
  assert.equal(button(panel, '刷新').props.disabled, false)
  button(panel, '查看').props.onTap()
  button(panel, '我申请的').props.onTap(); await flush()
  requests[3].resolve({ items: [{ helpId: 'old', help: { id: 'old', title: '旧账号参与的私有标题' }, role: 'helper',
    availability: 'available', actionRequired: false, progress: 'helping', updatedAt: '2026-10-28T08:00:00Z' }], nextCursor: null }); await flush()
  const oldReading = panel.load()
  panel.session.user = { id: 'new-account' }; await flush()
  assert.equal(panel.panelExpanded.value, false)
  assert.equal(panel.scope.value, 'todo')
  assert.equal(requests[5].scope, 'todo')
  requests[4].resolve({ items: [{ helpId: 'old-late', help: { id: 'old-late', title: '迟到的旧账号标题' } }], nextCursor: null })
  await oldReading
  assert.equal(panel.loading.value, true)
  assert.doesNotMatch(text(panel.render()), /旧账号参与|迟到的旧账号|暂无待处理/)
  requests[5].resolve({ items: [], nextCursor: null }); await flush()
  assert.match(text(panel.render()), /暂无待处理/)
  assert.equal(panel.items.value.length, 0)
})

test('嵌入珍珠读取失败在收起行外显示且可刷新，换账号收起规则并丢弃旧钱包', async t => {
  const requests = []
  const card = subject(t, 'components/ContributionRewards.vue', { props: { embedded: true, showActions: false, refreshKey: 0 },
    rewards: { getState: () => { const pending = deferred(); requests.push(pending); return pending.promise } } })
  assert.ok(button(card, '规则与记录'))
  requests[0].reject(new Error('珍珠余额读取失败')); await flush()
  assert.equal(card.detailsExpanded.value, false)
  assert.match(text(card.render()), /珍珠余额读取失败/)
  assert.doesNotMatch(text(card.render()), /0 颗珍珠|今日发布奖励/)
  assert.equal(button(card, '刷新').props.disabled, false)
  button(card, '规则与记录').props.onTap()
  const retry = button(card, '刷新').props.onTap()
  card.session.user = { id: 'new-account' }; await flush()
  assert.equal(card.detailsExpanded.value, false)
  requests[1].resolve(snapshot(999, 'old')); await retry
  assert.equal(card.state.value, null)
  requests[2].resolve(snapshot(9, 'new')); await flush()
  assert.match(text(card.render()), /9 颗珍珠/)
  assert.doesNotMatch(text(card.render()), /999|今日发布奖励|最近的校园贡献/)
})

test('求助协作规则默认收起，错误和申请常显，换身份或求助收起并隔离旧读取', async t => {
  const requests = []
  const view = subject(t, 'pages/content/components/HelpCooperation.vue', { props: { active: true, refreshKey: 0,
    help: { id: 'help-one', ownerId: 'author', status: 'open', visibility: 'public' } },
    helpService: { listApplications: () => { const pending = deferred(); requests.push(pending); return pending.promise } }, conversation: {} })
  requests[0].reject(new Error('申请列表暂不可用')); await flush()
  assert.ok(button(view, '我来帮忙'))
  assert.match(text(view.render()), /申请列表暂不可用/)
  assert.doesNotMatch(text(view.render()), /帮助者15颗|每天最多两次/)
  button(view, '互助规则').props.onTap()
  assert.equal(button(view, '收起互助规则').props['aria-expanded'], true)
  assert.match(text(view.render()), /帮助者15颗|发布者5颗|每天最多两次/)
  const old = view.refresh()
  view.session.user = { id: 'another-helper' }; await flush()
  assert.equal(view.rulesOpen.value, false)
  requests[1].resolve({ items: [{ id: 'old-application', helperId: 'me', status: 'pending' }], nextCursor: 'old' })
  await old
  assert.equal(view.applications.value.length, 0)
  assert.equal(view.loading.value, true)
  requests[2].resolve({ items: [], nextCursor: null }); await flush()
  button(view, '互助规则').props.onTap()
  view.props.help = { id: 'help-two', ownerId: 'author', status: 'open', visibility: 'public' }; await flush()
  assert.equal(view.rulesOpen.value, false)
  requests[3].resolve({ items: [], nextCursor: null }); await flush()
  assert.ok(button(view, '我来帮忙'))
  assert.doesNotMatch(text(view.render()), /帮助者15颗/)
})
