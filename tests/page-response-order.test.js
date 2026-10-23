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
    conversation: { list: async () => ({ items: [], nextCursor: null }) },
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
