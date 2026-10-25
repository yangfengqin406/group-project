import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCampusServer } from '../backend/campus/server.js'

const imageBytes = readFileSync(new URL('../src/static/tabs/plaza.png', import.meta.url))
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-http-'))
  let server, origin
  const start = async (port = 0) => {
    server = createCampusServer({ dataDir: directory, publicHost: '127.0.0.1' })
    await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done) })
    origin = `http://127.0.0.1:${server.address().port}`
  }
  await start()
  const close = async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)) }
  t.after(async () => { if (server.listening) await close(); rmSync(directory, { recursive: true, force: true }) })
  const rpc = async (method, params = {}, token = '') => {
    const response = await fetch(`${origin}/api/rpc`, { method: 'POST', headers: {
      'Content-Type': 'application/json', Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {})
    }, body: JSON.stringify({ method, params }) })
    return response.json()
  }
  const register = async (name) => {
    const result = await rpc('auth.register', { studentId: name, password: 'A-test-password-429', nickname: name })
    assert.equal(result.code, 'OK', result.message)
    return result.data
  }
  const upload = async (token, usage = 'content') => {
    const data = new FormData()
    data.append('file', new Blob([imageBytes], { type: 'image/png' }), 'photo.png')
    const response = await fetch(`${origin}/api/upload?usage=${usage}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: data })
    const result = await response.json()
    assert.equal(result.code, 'OK', result.message)
    return result.data
  }
  return { rpc, register, upload, get origin() { return origin },
    async restart() { const port = server.address().port; await close(); await start(port) } }
}
const sale = { title: '二手高数教材', body: '教学楼门口交接', category: '教材', marketType: 'sell', priceCents: 3000, condition: '九成新', handoverCampus: '校门口', visibility: 'public' }
const plan = () => ({ title: '一起去看书', body: '自习两小时', category: '学习', location: '图书馆', images: [], capacity: 2,
  startAt: new Date(Date.now() + 86400000).toISOString(), endAt: new Date(Date.now() + 90000000).toISOString() })

test('真实HTTP：独立账号、文件字节、C消息评论通知、A/B持久化与服务重启贯通', async (t) => {
  const f = await fixture(t)
  const alice = await f.register('alice'), bob = await f.register('bob'), stranger = await f.register('stranger')
  assert.equal((await f.rpc('auth.login', { type: 'h5', studentId: 'alice', password: 'Wrong-password-99' })).code, 'UNAUTHENTICATED')
  const photo = await f.upload(alice.token)
  assert.equal((await fetch(photo.url)).status, 404)
  assert.equal((await fetch(photo.url, { headers: { Authorization: `Bearer ${bob.token}` } })).status, 404)
  const ownImage = await fetch(photo.url, { headers: { Cookie: `campus_session=${alice.token}` } })
  assert.equal(ownImage.status, 200); assert.deepEqual(Buffer.from(await ownImage.arrayBuffer()), imageBytes)
  assert.equal((await f.rpc('upload.confirm', { imageId: photo.imageId }, bob.token)).code, 'FORBIDDEN')
  assert.equal((await f.rpc('upload.confirm', { imageId: photo.imageId }, alice.token)).code, 'OK')
  const created = await f.rpc('market.create', { ...sale, imageIds: [photo.imageId] }, alice.token)
  assert.equal(created.code, 'OK', created.message)
  const item = created.data
  assert.equal((await fetch(photo.url)).status, 200)
  const chat = await f.rpc('conversation.open', { contentType: 'market', contentId: item.id, peerUserId: alice.user.id }, bob.token)
  assert.equal(chat.code, 'OK', chat.message)
  const sent = await f.rpc('message.send', { conversationId: chat.data.id, body: '你好，想预约这本教材。', idempotencyKey: 'http-message-1' }, bob.token)
  assert.equal(sent.code, 'OK', sent.message)
  assert.equal((await f.rpc('message.list', { conversationId: chat.data.id }, stranger.token)).code, 'FORBIDDEN')
  const reserved = await f.rpc('market.reserve', { id: item.id }, bob.token)
  assert.equal(reserved.code, 'OK', reserved.message)
  assert.equal((await f.rpc('reservation.respond', { reservationId: reserved.data.id, accept: true }, alice.token)).code, 'OK')
  assert.equal((await f.rpc('reservation.complete', { reservationId: reserved.data.id }, bob.token)).code, 'OK')
  const lost = await f.rpc('lostFound.create', { title: '拾到一把钥匙', body: '请描述钥匙扣', location: '图书馆', lostKind: 'found', category: 'key', images: [photo.url] }, alice.token)
  assert.equal(lost.code, 'OK', lost.message)
  assert.equal((await f.rpc('comment.create', { contentType: 'lost_found', contentId: lost.data.id, body: '我今天在那附近丢了钥匙' }, bob.token)).code, 'OK')
  const p = plan()
  const target = await f.rpc('plan.create', p, alice.token), source = await f.rpc('plan.create', p, bob.token)
  assert.equal(target.code, 'OK', target.message); assert.equal(source.code, 'OK', source.message)
  const invitation = await f.rpc('invitation.create', { targetPlanId: target.data.id, sourcePlanId: source.data.id, idempotencyKey: 'http-invite' }, alice.token)
  assert.equal(invitation.code, 'OK', invitation.message)
  assert.equal((await f.rpc('invitation.respond', { invitationId: invitation.data.id, action: 'accept', idempotencyKey: 'http-accept' }, bob.token)).code, 'OK')
  const profile = await f.rpc('user.getProfile', {}, alice.token)
  assert.equal(profile.code, 'OK'); assert.equal(profile.data.passwordHash, undefined); assert.equal(profile.data.roles, undefined)
  await f.restart()
  assert.equal((await f.rpc('market.get', { id: item.id }, alice.token)).data.status, 'completed')
  assert.equal((await f.rpc('message.list', { conversationId: chat.data.id }, alice.token)).data.items[0].body, sent.data.body)
  assert.equal((await f.rpc('plan.get', { id: target.data.id }, bob.token)).data.memberIds.length, 2)
  assert.ok((await f.rpc('notification.list', {}, alice.token)).data.items.length >= 3)
  assert.equal((await f.rpc('lostFound.get', { id: lost.data.id }, bob.token)).data.images[0], photo.url)
  assert.equal((await fetch(photo.url)).status, 200)
  assert.equal((await f.rpc('auth.logout', {}, alice.token)).code, 'OK')
  assert.equal((await f.rpc('user.getProfile', {}, alice.token)).code, 'UNAUTHENTICATED')
})

test('真实HTTP：私有内容图片不因确认/收藏/指定目标而公开，头像绑定后才公开', async (t) => {
  const f = await fixture(t), a = await f.register('private-a'), b = await f.register('private-b')
  const photo = await f.upload(a.token)
  await f.rpc('upload.confirm', { imageId: photo.imageId }, a.token)
  const privateItem = await f.rpc('market.create', { ...sale, visibility: 'private', imageIds: [photo.imageId] }, a.token)
  assert.equal(privateItem.code, 'OK', privateItem.message)
  assert.equal((await fetch(photo.url)).status, 404)
  assert.equal((await f.rpc('market.get', { id: privateItem.data.id }, b.token)).code, 'FORBIDDEN')
  assert.equal((await f.rpc('user.listPublicContent', { userId: a.user.id }, b.token)).data.items.length, 0)
  assert.equal((await f.rpc('upload.confirm', { imageId: photo.imageId, contentType: 'market', contentId: privateItem.data.id }, b.token)).code, 'FORBIDDEN')
  const avatar = await f.upload(a.token, 'avatar')
  await f.rpc('upload.confirm', { imageId: avatar.imageId }, a.token)
  assert.equal((await fetch(avatar.url)).status, 404)
  assert.equal((await f.rpc('user.updateProfile', { avatarImageId: avatar.imageId }, a.token)).code, 'OK')
  assert.equal((await fetch(avatar.url)).status, 200)
})

test('真实HTTP：拒绝恶意源、伪造文件、无身份上传与未配置微信/订阅，不回退演示成功', async (t) => {
  const f = await fixture(t), a = await f.register('guard-test')
  const hostile = await fetch(`${f.origin}/api/rpc`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(hostile.status, 403)
  assert.equal((await f.rpc('auth.login', { type: 'wechat', code: 'anything' })).code, 'NOT_IMPLEMENTED')
  assert.equal((await f.rpc('subscription.send', {}, a.token)).code, 'NOT_IMPLEMENTED')
  assert.equal((await f.rpc('dive.start', {}, a.token)).code, 'NOT_IMPLEMENTED')
  const body = new FormData(); body.append('file', new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/png' }), 'fake.png')
  const bad = await fetch(`${f.origin}/api/upload?usage=content`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}` }, body })
  assert.equal((await bad.json()).code, 'INVALID_ARGUMENT')
  assert.equal((await (await fetch(`${f.origin}/api/upload?usage=content`, { method: 'POST' })).json()).code, 'UNAUTHENTICATED')
  const prefix = Buffer.from('--campus-test\r\nContent-Disposition: form-data; name="file"; filename="real.png"\r\nContent-Type: image/png\r\n\r\n')
  for (const ending of ['\r\n--campus-test', '\r\n--campus-test--\r\nTRAILING_JUNK']) {
    const response = await fetch(`${f.origin}/api/upload?usage=content`, { method: 'POST', headers: {
      Authorization: `Bearer ${a.token}`, 'Content-Type': 'multipart/form-data; boundary=campus-test'
    }, body: Buffer.concat([prefix, imageBytes, Buffer.from(ending)]) })
    assert.equal((await response.json()).code, 'INVALID_ARGUMENT')
  }
  const invalid = await fetch(`${f.origin}/api/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[]' })
  assert.equal((await invalid.json()).code, 'INVALID_ARGUMENT')
})
