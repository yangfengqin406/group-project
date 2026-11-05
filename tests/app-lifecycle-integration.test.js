import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function application(platform) {
  const calls = [], listeners = new Map(), identity = { user: { id: 'first' } }
  let identityChanged
  const document = { hidden: false, addEventListener: (type, callback) => listeners.set(type, callback) }
  let source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
  source = source.replace(/\/\/ #ifdef H5\n([\s\S]*?)\/\/ #endif/g, (_, code) => platform === 'h5' ? code : '')
    .replace(/^import .+\n/gm, '').replace('export default', 'globalThis.application =')
  const context = vm.createContext({
    watch: (_, callback) => { identityChanged = callback }, session: identity,
    restoreIdentity: () => { calls.push('restore'); return Promise.resolve() },
    soundscape: { setVisible: value => calls.push('audio-visible:' + value) },
    messageAlerts: { start: () => calls.push('message-start'), stop: () => calls.push('message-stop'), reset: () => calls.push('message-reset') },
    ...(platform === 'h5' ? { document } : {}),
  })
  vm.runInContext(source, context)
  return { app: context.application, calls, document, hideDocument: () => listeners.get('visibilitychange')(), changeUser() { identity.user = { id: 'second' }; identityChanged() } }
}

test('App切后台同时停音和停消息，后台切账号不能重开轮询，返回前台恢复提醒', () => {
  const { app, calls, changeUser } = application('native')
  app.onLaunch(); app.onShow()
  assert.deepEqual(calls, ['restore', 'message-start'])
  app.onHide(); changeUser()
  assert.deepEqual(calls.slice(2), ['message-stop', 'audio-visible:false', 'message-reset'])
  app.onShow()
  assert.equal(calls.at(-1), 'message-start')
})

test('H5标签隐藏停止声音与消息，身份切换不绕过隐藏判断，返回标签才恢复提醒', () => {
  const { app, calls, document, hideDocument, changeUser } = application('h5')
  app.onLaunch(); app.onShow()
  document.hidden = true; hideDocument(); changeUser()
  assert.deepEqual(calls, ['restore', 'message-start', 'message-stop', 'audio-visible:false', 'message-reset'])
  document.hidden = false; hideDocument()
  assert.equal(calls.at(-1), 'message-start')
})
