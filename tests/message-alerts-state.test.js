import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('首次全局轮询前标读联系回执仍保留并发文字未读，且不伪造完整快照', () => {
  const source = readFileSync(new URL('../src/services/message-alerts.js', import.meta.url), 'utf8')
    .replace(/^import.*\r?\n/gm, '').replace('export const messageAlerts', 'const messageAlerts')
  const badges = []
  const context = vm.createContext({ reactive: value => value, conversation: {}, session: { user: { id: 'seller' } },
    createMessageMonitor: () => ({ invalidate() {} }), uni: {
      setTabBarBadge: options => badges.push(options.text), removeTabBarBadge: () => badges.push('0') }
  })
  vm.runInContext(`${source}\nglobalThis.subject=messageAlerts`, context)
  const alerts = context.subject
  alerts.acknowledged('c1', 1, { id: 'c1', contentType: 'market', unreadContact: false,
    contactRequest: { id: 'contact-1' }, lastMessage: null })
  assert.equal(alerts.state.total, 1)
  assert.equal(alerts.state.items[0].unreadCount, 1)
  assert.equal(alerts.state.items[0].unreadContact, false)
  assert.equal(alerts.state.hasSnapshot, false)
  assert.equal(alerts.state.hasKnownUnread, true)
  assert.equal(badges.at(-1), '1')
  alerts.acknowledged('c1', 0)
  assert.equal(alerts.state.total, 0)
})
