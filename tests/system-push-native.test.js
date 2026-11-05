import test from 'node:test'
import assert from 'node:assert/strict'
import { pushPermission, pushClientId, requestPushPermission, openPushSettings } from '../src/platform/system-push.js'

test('Android 13 notification request and high-importance private channel use native APIs', async (t) => {
  const previous = { uni: globalThis.uni, plus: globalThis.plus }, calls = []
  t.after(() => { globalThis.uni = previous.uni; globalThis.plus = previous.plus })
  globalThis.uni = {
    getSystemInfoSync: () => ({ platform: 'android' }), getAppAuthorizeSetting: () => ({ notificationAuthorized: 'denied' }),
    getChannelManager: () => ({ setPushChannel: (p) => calls.push(p) }),
    getPushClientId: (p) => p.success({ cid: 'test-client-id' }), openAppAuthorizeSetting: () => calls.push('settings') }
  globalThis.plus = { android: { importClass: () => ({ SDK_INT: 33 }), requestPermissions: (p, done) => { calls.push(p); done({ granted: p }) } } }
  assert.equal(pushPermission(), false); await requestPushPermission()
  assert.deepEqual(calls[0], ['android.permission.POST_NOTIFICATIONS'])
  assert.equal(await pushClientId(), 'test-client-id')
  assert.equal(calls[1].importance, 4); assert.equal(calls[1].lockscreenVisibility, 0)
  openPushSettings(); assert.equal(calls.at(-1), 'settings')
})

test('iOS manual permission is initiated only by the requested CID operation; absent SDK fails', async (t) => {
  const previous = globalThis.uni; let acquisitions = 0
  t.after(() => { globalThis.uni = previous })
  globalThis.uni = { getSystemInfoSync: () => ({ platform: 'ios' }), getAppAuthorizeSetting: () => ({ notificationAuthorized: 'not determined' }),
    getPushClientId: (p) => { acquisitions++; p.success({ cid: 'test-client-id' }) } }
  assert.equal(pushPermission(), false); assert.equal(acquisitions, 0)
  await requestPushPermission(); assert.equal(acquisitions, 1)
  globalThis.uni.getPushClientId = undefined
  await assert.rejects(pushClientId(), /未包含/)
})
