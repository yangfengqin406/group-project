import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createSeed } from '../src/mock/seed.js'
import { dispatch } from '../src/mock/engine.js'

const at = (day) => `2026-10-${String(day).padStart(2, '0')}T09:00:00.000Z`
function conversation(db, id, contentType = 'market', createdAt = at(1)) {
  return {
    id, contentType, contentId: `${contentType}-${id}`, contentTitle: id,
    participantIds: [db.currentUserId, 'user_demo_b'], createdAt
  }
}

test('会话来源先筛选再分页：超过第一页的失物、搭子和互助不漏掉', () => {
  const db = createSeed()
  db.conversations = Array.from({ length: 26 }, (_, i) => conversation(db, `market-${i}`))
  for (const type of ['lost_found', 'plan', 'help']) {
    db.conversations.push(...Array.from({ length: 3 }, (_, i) => conversation(db, `${type}-${i}`, type)))
    const first = dispatch(db, 'conversation.list', { contentType: type, pageSize: 2 })
    assert.deepEqual(first.items.map((item) => item.id), [`${type}-0`, `${type}-1`])
    assert.equal(first.nextCursor, '2')
    const last = dispatch(db, 'conversation.list', {
      contentType: type, pageSize: 2, cursor: first.nextCursor
    })
    assert.deepEqual(last.items.map((item) => item.id), [`${type}-2`])
    assert.equal(last.nextCursor, null)
  }
})

test('旧会话收到新留言后按活跃时间置顶，保留原内容与对方摘要', () => {
  const db = createSeed()
  db.conversations = [
    conversation(db, 'newer', 'plan', new Date(Date.now() - 1000).toISOString()),
    conversation(db, 'older', 'market', new Date(Date.now() - 2000).toISOString())
  ]
  // New messages require the original to remain public; historical summaries
  // above can still refer to removed originals without leaking their details.
  db.contents.market.push({ id: 'market-older', type: 'market', ownerId: 'user_demo_b', title: 'older', visibility: 'public', status: 'active' })
  dispatch(db, 'message.send', { conversationId: 'older', body: '刚刚收到的留言', idempotencyKey: 'latest' })
  const first = dispatch(db, 'conversation.list', { pageSize: 1 })
  assert.equal(first.items[0].id, 'older')
  assert.equal(first.items[0].lastMessage.body, '刚刚收到的留言')
  assert.equal(first.items[0].contentId, 'market-older')
  assert.equal(first.items[0].peer.id, 'user_demo_b')
  assert.equal(first.nextCursor, '1')
})

test('最近留言按真实时间选取，不能把数组末尾的旧留言当作最新', () => {
  const db = createSeed()
  db.conversations = [conversation(db, 'no-message', 'market', at(20)), conversation(db, 'active', 'plan', at(1))]
  db.messages = [
    { id: 'latest', conversationId: 'active', body: '最新留言', createdAt: at(23) },
    { id: 'older', conversationId: 'active', body: '延迟到达的旧留言', createdAt: at(2) }
  ]
  const items = dispatch(db, 'conversation.list').items
  assert.equal(items[0].id, 'active')
  assert.equal(items[0].lastMessage.id, 'latest')
  assert.equal(items[1].lastMessage, null)
})

test('无留言会话按创建时间倒序，同一活跃时间分页顺序稳定且不泄露他人会话', () => {
  const db = createSeed()
  db.conversations = [
    conversation(db, 'old', 'plan', at(1)),
    conversation(db, 'same-first', 'market', at(20)),
    { ...conversation(db, 'not-mine', 'market', at(24)), participantIds: ['user_demo_b', 'user_demo_c'] },
    conversation(db, 'same-second', 'lost_found', at(20))
  ]
  const first = dispatch(db, 'conversation.list', { pageSize: 1 })
  const second = dispatch(db, 'conversation.list', { pageSize: 1, cursor: first.nextCursor })
  const third = dispatch(db, 'conversation.list', { pageSize: 1, cursor: second.nextCursor })
  assert.deepEqual([first.items[0].id, second.items[0].id, third.items[0].id], ['same-first', 'same-second', 'old'])
  assert.equal(third.nextCursor, null)
  assert.deepEqual(dispatch(db, 'conversation.list').items, dispatch(db, 'conversation.list', { contentType: '' }).items)
})

test('不支持的会话来源明确拒绝，不会静默返回全部会话', () => {
  const db = createSeed()
  for (const contentType of ['unknown', 'lostFound', null, {}]) {
    assert.throws(() => dispatch(db, 'conversation.list', { contentType }), { code: 'INVALID_ARGUMENT' })
  }
})

// Execute the real message page and the tab's actual template handler with
// deferred service responses, rather than reproducing its filtering logic.
function inbox() {
  const source = fs.readFileSync(new URL('../src/pages/messages/index.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const tabHandler = source.match(/:class="\{ selected: source === option.value \}"\s*@tap="([^"]+)"/)[1]
  const hooks = {}, requests = [], watches = []
  const session = { user: { id: 'user_demo_a' } }
  const empty = async () => ({ items: [], nextCursor: null })
  const context = vm.createContext({
    ref: (value) => ({ value }), computed: (fn) => ({ get value() { return fn() } }),
    watch: (getter, fn) => watches.push(fn),
    onShow: (fn) => { hooks.show = fn }, onHide: (fn) => { hooks.hide = fn },
    onUnload: (fn) => { hooks.unload = fn }, session, uni: {},
    invitation: { list: empty }, notification: { list: empty }, plan: {},
    messageAlerts: { state: { items: [] } },
    conversation: { list: (params) => new Promise((resolve, reject) => requests.push({ params, resolve, reject })) },
    errorText: (error) => error.message
  })
  vm.runInContext(`${script}\nglobalThis.api={conversations,conversationCursor,loading,load,moreConversations};globalThis.chooseSource=(value)=>{const option={value};${tabHandler.replace(/\bsource\s*=/g, 'source.value =')}}`, context)
  return { ...context.api, chooseSource: context.chooseSource, hooks, requests, session, watches }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('点击会话来源重新向服务筛选，慢到的全部列表不会覆盖最新来源', async () => {
  const page = inbox()
  page.hooks.show(); await tick()
  page.chooseSource('lost_found'); await tick()
  assert.equal(page.requests.length, 2)
  assert.equal(page.requests[1].params.contentType, 'lost_found')
  page.requests[1].resolve({ items: [{ id: 'found', contentType: 'lost_found' }], nextCursor: '20' })
  await tick()
  page.requests[0].resolve({ items: [{ id: 'old-market', contentType: 'market' }], nextCursor: '99' })
  await tick()
  assert.equal(page.conversations.value[0].id, 'found')
  assert.equal(page.conversationCursor.value, '20')
  assert.equal(page.loading.value, false)
})

test('更多会话沿用当前来源，切换后旧分页不会插入新来源列表', async () => {
  const page = inbox()
  page.hooks.show(); await tick()
  page.requests[0].resolve({ items: [], nextCursor: null }); await tick()
  page.chooseSource('market'); await tick()
  assert.equal(page.requests.length, 2)
  page.requests[1].resolve({ items: [{ id: 'market-1', contentType: 'market' }], nextCursor: '20' }); await tick()
  page.moreConversations(); await tick()
  assert.equal(page.requests[2].params.contentType, 'market')
  assert.equal(page.requests[2].params.cursor, '20')
  page.chooseSource('plan'); await tick()
  page.requests[3].resolve({ items: [{ id: 'plan-1', contentType: 'plan' }], nextCursor: null }); await tick()
  page.requests[2].resolve({ items: [{ id: 'stale-market', contentType: 'market' }], nextCursor: '40' }); await tick()
  assert.deepEqual(Array.from(page.conversations.value, (item) => item.id), ['plan-1'])
  assert.equal(page.conversationCursor.value, null)
})

test('换身份及离开页面时，旧会话响应不回写或恢复加载状态', async () => {
  const page = inbox()
  page.hooks.show(); await tick()
  page.session.user = { id: 'user_demo_c' }
  page.watches[0](); await tick()
  page.requests[1].resolve({ items: [{ id: 'new-account' }], nextCursor: null }); await tick()
  page.requests[0].resolve({ items: [{ id: 'private-old-account' }], nextCursor: '20' }); await tick()
  assert.equal(page.conversations.value[0].id, 'new-account')
  const refresh = page.load(); await tick()
  page.hooks.hide()
  page.requests[2].resolve({ items: [{ id: 'hidden-response' }], nextCursor: '20' })
  await refresh
  assert.equal(page.conversations.value[0].id, 'new-account')
  assert.equal(page.loading.value, false)
})
