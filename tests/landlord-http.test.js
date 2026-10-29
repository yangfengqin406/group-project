import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { once } from 'node:events'
import { createLandlordServer } from '../server/landlord/index.mjs'

async function serverTest(t) {
  const directory = await mkdtemp(join(tmpdir(), 'campus-landlord-'))
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>LAN test</title>')
  const server = createLandlordServer({ staticRoot: directory })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { await new Promise((done) => server.close(done)); await rm(directory, { recursive: true, force: true }) })
  const rpc = async (method, params = {}, token = '') => {
    const response = await fetch(`${base}/game/rpc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ method, params })
    })
    return { status: response.status, ...(await response.json()) }
  }
  return { base, rpc }
}

test('landlord HTTP serves H5 and health and keeps the game RPC independently authenticated', async (t) => {
  const { base, rpc } = await serverTest(t)
  const page = await fetch(`${base}/`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /LAN test/)
  assert.match(page.headers.get('content-type'), /text\/html/)
  const health = await (await fetch(`${base}/game/health`)).json()
  assert.equal(health.code, 'OK')
  assert.equal(health.data.mode, 'lan-guest')
  assert.equal(health.data.persistence, 'memory')
  const denied = await rpc('landlord.getLobby')
  assert.equal(denied.status, 401)
  assert.equal(denied.code, 'UNAUTHORIZED')
  const opened = await rpc('session.open', { nickname: '局域网同学' })
  assert.equal(opened.code, 'OK')
  const lobby = await rpc('landlord.getLobby', {}, opened.data.token)
  assert.equal(lobby.code, 'OK')
  assert.equal(lobby.data.onlineCount, 1)
})

test('landlord HTTP connects three independent sessions to one real shared room', async (t) => {
  const { rpc } = await serverTest(t)
  const visitors = []
  for (const nickname of ['甲', '乙', '丙']) visitors.push((await rpc('session.open', { nickname })).data)
  await Promise.all(visitors.map((visitor, index) => rpc('landlord.joinQueue', { operationId: `join_${index}` }, visitor.token)))
  const lobbies = await Promise.all(visitors.map((visitor) => rpc('landlord.getLobby', {}, visitor.token)))
  assert.equal(new Set(lobbies.map((value) => value.data.roomId)).size, 1)
  const roomId = lobbies[0].data.roomId
  assert.ok(roomId)
  const rooms = await Promise.all(visitors.map((visitor) => rpc('landlord.getRoom', { roomId }, visitor.token)))
  assert.ok(rooms.every((value) => value.code === 'OK' && value.data.hand.length === 17))
  assert.equal(new Set(rooms.flatMap((value) => value.data.hand.map((card) => card.id))).size, 51)
})

test('landlord HTTP refuses cross-origin writes, invalid envelopes and public filesystem access', async (t) => {
  const { base, rpc } = await serverTest(t)
  const cross = await fetch(`${base}/game/rpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://not-the-game.example' },
    body: JSON.stringify({ method: 'session.open', params: { nickname: '跨域' } })
  })
  assert.equal(cross.status, 403)
  for (const path of ['/.env', '/server/landlord/service.mjs', '/%2e%2e%5cpackage.json'])
    assert.equal((await fetch(`${base}${path}`)).status, 404)
  const invalid = await fetch(`${base}/game/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
  assert.equal((await invalid.json()).code, 'INVALID_ARGUMENT')
  const extra = await fetch(`${base}/game/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'session.open', params: { nickname: '甲' }, playerId: 'fake' }) })
  assert.equal((await extra.json()).code, 'INVALID_ARGUMENT')
  const oversized = await rpc('session.open', { nickname: 'x'.repeat(35_000) })
  assert.equal(oversized.code, 'INVALID_ARGUMENT')
})
