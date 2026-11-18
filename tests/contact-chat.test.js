import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function chatFixture(markResult = { unreadCount: 0, unreadContact: false }) {
  const text = readFileSync(new URL('../src/pages/messages/chat.vue', import.meta.url), 'utf8')
  const script = text.match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const hooks = {}, marked = [], acknowledged = []
  const context = vm.createContext({ ref: value => ({ value }), watch() {},
    session: { user: { id: 'seller' } }, config: { apiMode: 'http' },
    onLoad: fn => { hooks.load = fn }, onShow: fn => { hooks.show = fn },
    onHide: fn => { hooks.hide = fn }, onUnload() {}, errorText: error => error.message,
    messageAlerts: { state: { foreground: true }, setActive() {},
      acknowledged: (...args) => acknowledged.push(args) },
    conversation: { get: async () => ({ id: 'c1', unreadContact: true, contactRequest: { id: 'contact-1' } }),
      markRead: async params => { marked.push(params); return markResult } },
    message: { list: async () => ({ items: [], nextCursor: null }) }
  })
  vm.runInContext(`${script}\nglobalThis.subject={load,current}`, context)
  return { ...context.subject, hooks, marked, acknowledged }
}
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }

test('实际聊天页打开首次联系的空会话后只确认联系，不要求伪造留言', async () => {
  const f = chatFixture()
  f.hooks.load({ id: 'c1' }); f.hooks.show(); await flush()
  assert.equal(f.marked.length, 1)
  assert.equal(f.marked[0].throughContactId, 'contact-1')
  assert.equal(f.marked[0].throughMessageId, undefined)
  assert.equal(f.acknowledged[0][1], 0)
})

test('确认首次联系时并发到达的新文字仍保留未读数', async () => {
  const f = chatFixture({ unreadCount: 1, unreadContact: false })
  f.hooks.load({ id: 'c1' }); f.hooks.show(); await flush()
  assert.equal(f.acknowledged[0]?.[1], 1)
})
