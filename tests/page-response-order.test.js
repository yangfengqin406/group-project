import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

// Execute the real page script with controllable service promises. This checks
// observable response ordering without copying the implementation into a test.
function page(file, services, names) {
  const source = fs.readFileSync(new URL(`../src/pages/${file}.vue`, import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const hooks = {}
  const session = { user: { id: 'a' } }
  const context = vm.createContext({
    ref: (value) => ({ value }), watch: () => {}, reactive: (value) => value,
    messageAlerts: { state: { items: [], foreground: true }, setActive() {}, acknowledged() {} },
    computed: (getter) => ({ get value() { return getter() } }),
    onShow: (fn) => { hooks.show = fn }, onHide: (fn) => { hooks.hide = fn },
    onUnload: () => {}, onLoad: () => {}, config: { apiMode: 'mock' }, session,
    demoUsers: () => [], switchDemoUser: () => {}, resetDemo: () => {},
    errorText: (e) => e.message, uni: {}, idempotencyKey: () => 'send-key',
    ...services
  })
  vm.runInContext(`${script}\nglobalThis.api={${names.join(',')}}`, context, { filename: file })
  return { ...context.api, hooks, session }
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

test('聊天链接只读取指定会话；换身份后的迟到会话摘要不能回填', async () => {
  let finish, lists = 0
  const chat = page('messages/chat', {
    conversation: {
      get: ({ id }) => new Promise((resolve) => { assert.equal(id, 'direct-chat'); finish = resolve }),
      list: async () => { lists++; return { items: [], nextCursor: null } }
    }, message: { list: async () => ({ items: [], nextCursor: null }) }
  }, ['id', 'current'])
  chat.id.value = 'direct-chat'
  chat.hooks.show()
  await flush()
  chat.session.user = { id: 'other' }
  finish({ id: 'direct-chat', peer: { nickname: '旧账号联系人' } })
  await flush()
  assert.equal(chat.current.value, null)
  assert.equal(lists, 0)
})

test('通知成功标读后立即更新，联系通知进会话，旧通知仍进原内容', async () => {
  const routes = []
  const empty = async () => ({ items: [], nextCursor: null })
  const inbox = page('messages/index', {
    conversation: { list: empty }, invitation: { list: empty }, plan: {},
    notification: { list: empty, markRead: async () => ({ read: true }) },
    uni: { navigateTo: ({ url }) => routes.push(url) },
    openContent: (type, id) => routes.push(`${type}:${id}`)
  }, ['read'])
  inbox.hooks.show(); await flush()
  const note = { id: 'note', read: false, conversationId: 'chat-1', contentType: 'market', contentId: 'item-1' }
  await inbox.read(note)
  assert.equal(note.read, true)
  assert.match(routes[0], /messages\/chat\?id=chat-1$/)
  await inbox.read({ id: 'old', contentType: 'plan', contentId: 'plan-1' })
  assert.equal(routes[1], 'plan:plan-1')
})

test('通知标读未完成时离开消息页，迟到结果不能触发跳转', async () => {
  let finish
  const routes = []
  const empty = async () => ({ items: [], nextCursor: null })
  const inbox = page('messages/index', {
    conversation: { list: empty }, invitation: { list: empty }, plan: {},
    notification: { list: empty, markRead: () => new Promise((resolve) => { finish = resolve }) },
    uni: { navigateTo: ({ url }) => routes.push(url) }, openContent: () => routes.push('content')
  }, ['read'])
  inbox.hooks.show(); await flush()
  const reading = inbox.read({ id: 'late', conversationId: 'chat-1' })
  inbox.hooks.hide()
  finish({ read: true }); await reading
  assert.deepEqual(routes, [])
})

test('小屋快速切换筛选：慢到的旧列表不能覆盖最新筛选', async () => {
  const requests = []
  const home = page('home/index', {
    user: { getProfile: async () => ({ id: 'a' }) },
    myContent: { list: (params) => new Promise((resolve) => requests.push({ params, resolve })) }
  }, ['setFilter', 'items', 'contentType', 'loading'])
  home.setFilter('market'); await flush()
  home.setFilter('plan'); await flush()
  requests[1].resolve({ items: [{ id: 'plan-new', contentType: 'plan' }], nextCursor: null })
  await flush()
  requests[0].resolve({ items: [{ id: 'market-old', contentType: 'market' }], nextCursor: null })
  await flush()
  assert.equal(home.contentType.value, 'plan')
  assert.equal(home.items.value[0].contentType, 'plan')
  assert.equal(home.loading.value, false)
})

test('刷新期间发送留言：发送后的新列表生效，旧响应不能抹掉新留言', async () => {
  const requests = []
  const chat = page('messages/chat', {
    conversation: { get: async () => { throw new Error('会话不存在') } },
    message: {
      list: () => new Promise((resolve) => requests.push(resolve)),
      send: async (params) => ({ id: 'new', body: params.body })
    }
  }, ['id', 'body', 'items', 'current', 'load', 'send'])
  chat.id.value = 'conversation-1'
  // Mark the page visible without starting a second initialization request.
  chat.hooks.show()
  await flush()
  chat.current.value = { id: 'conversation-1' }
  chat.body.value = 'new message'
  const oldList = chat.load(true)
  await flush()
  const sent = chat.send()
  await flush()
  assert.equal(requests.length, 2)
  requests[1]({ items: [{ id: 'new', body: 'new message' }], nextCursor: null })
  await sent
  requests[0]({ items: [{ id: 'old', body: 'old message' }], nextCursor: null })
  await oldList
  assert.equal(chat.body.value, '')
  assert.equal(chat.items.value[0].body, 'new message')
})

test('小屋离开后，未完成的读取不会恢复已隐藏页内容', async () => {
  let finish
  const home = page('home/index', {
    user: { getProfile: async () => ({ id: 'a' }) },
    myContent: { list: () => new Promise((resolve) => { finish = resolve }) }
  }, ['load', 'items'])
  const loading = home.load()
  home.hooks.hide()
  finish({ items: [{ id: 'late' }], nextCursor: null })
  await loading
  assert.equal(home.items.value.length, 0)
})

test('接受确认框期间换身份，不会向新账号提交旧邀请意图', async () => {
  let modal
  let submissions = 0
  const empty = async () => ({ items: [], nextCursor: null })
  const inbox = page('messages/index', {
    invitation: { list: empty, respond: async () => { submissions++ } },
    conversation: { list: empty }, notification: { list: empty }, plan: {},
    runInvitationOperation: (_, request) => request(),
    uni: { showModal: (options) => { modal = options } }
  }, ['respond'])
  inbox.hooks.show(); await flush()
  const responding = inbox.respond({ id: 'old-invite', status: 'pending' }, 'accept')
  inbox.session.user = { id: 'b' }
  modal.success({ confirm: true })
  await responding
  assert.equal(submissions, 0)
})

test('头像选择器打开后换身份，不上传旧账号选中的文件', async () => {
  let picker
  let uploads = 0
  const profile = page('profile/edit', {
    user: { getProfile: async () => ({ id: 'a', nickname: '原昵称', skillTags: [] }) },
    upload: { create: async () => { uploads++; return { imageId: 'wrong' } } },
    useUnsavedChanges: () => {},
    uni: { chooseImage: (options) => { picker = options } }
  }, ['load', 'chooseAvatar', 'form'])
  await profile.load()
  profile.chooseAvatar()
  profile.session.user = { id: 'b' }
  await picker.success({ tempFilePaths: ['old-account-photo.png'] })
  assert.equal(uploads, 0)
  assert.equal(profile.form.avatarImageId, '')
})

test('会话权限读取完成前，即使填了文字也不能发送', async () => {
  let sends = 0
  const chat = page('messages/chat', {
    conversation: {}, message: { send: async () => { sends++ } }
  }, ['body', 'send'])
  chat.body.value = '提前输入'
  await chat.send()
  assert.equal(sends, 0)
  assert.equal(chat.body.value, '提前输入')
})

test('聊天自动更新保留草稿和已加载历史，只标读实际获取的新消息', async () => {
  const reads = []
  const m1 = { id: 'm1', body: '第一条', createdAt: '2026-10-29T00:00:00Z' }
  const m2 = { id: 'm2', body: '第二条', createdAt: '2026-10-29T00:00:01Z' }
  let latest = [m1]
  const chat = page('messages/chat', {
    conversation: { get: async () => ({ id: 'chat' }), markRead: async (params) => { reads.push(params); return { unreadCount: 0 } } },
    message: { list: async () => ({ items: [...latest], nextCursor: 'page-2' }) }
  }, ['id', 'body', 'items', 'cursor', 'load'])
  chat.id.value = 'chat'; chat.hooks.show(); await flush()
  chat.body.value = '尚未发送的草稿'
  chat.items.value.push({ id: 'history', body: '历史留言', createdAt: '2026-10-28T00:00:00Z' })
  chat.cursor.value = 'history-page-3'
  latest = [m2, m1]
  await chat.load(true, { background: true })
  assert.deepEqual(Array.from(chat.items.value, (m) => m.id), ['m2', 'm1', 'history'])
  assert.equal(chat.body.value, '尚未发送的草稿')
  assert.equal(chat.cursor.value, 'history-page-3')
  assert.equal(reads.at(-1).throughMessageId, 'm2')
  assert.equal(reads.at(-1).conversationId, 'chat')
})

test('自动读取期间离开聊天，迟到的新消息不能被标为已读', async () => {
  let finish, reads = 0, delayed = false
  const chat = page('messages/chat', {
    conversation: { get: async () => ({ id: 'chat' }), markRead: async () => { reads++; return { unreadCount: 0 } } },
    message: { list: () => delayed ? new Promise((resolve) => { finish = resolve }) : Promise.resolve({ items: [], nextCursor: null }) }
  }, ['id', 'load', 'items'])
  chat.id.value = 'chat'; chat.hooks.show(); await flush()
  delayed = true
  const poll = chat.load(true, { background: true }); await flush()
  chat.hooks.hide()
  finish({ items: [{ id: 'late', createdAt: '2026-10-29T00:00:00Z' }], nextCursor: null }); await poll
  assert.equal(reads, 0)
  assert.equal(chat.items.value.length, 0)
})
