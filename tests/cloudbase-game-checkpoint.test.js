import test from 'node:test'
import assert from 'node:assert/strict'
import { createGameService } from '../server/landlord/service.mjs'

const error = (code) => (value) => value.code === code

function setup(settings = {}) {
  let now = 1_000_000
  let nextId = 0
  let operationId = 0
  let seed = 42
  const runtime = {
    clock: () => now,
    id: (prefix) => `${prefix}_${++nextId}`,
    random: () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 }
  }
  let service = createGameService({ ...runtime, ...settings })
  const visitors = ['阿青', '小米', '豆豆'].map((nickname) => service.dispatch('session.open', { nickname }))
  const rpc = (visitor, method, params = {}) => service.dispatch(`landlord.${method}`, params, visitor.token)
  const write = (visitor, method, params = {}) => rpc(visitor, method, { ...params, operationId: `checkpoint_${++operationId}` })
  const restart = () => {
    const state = JSON.parse(JSON.stringify(service.checkpoint()))
    // Timing policy is restored without repeating settings; runtime clocks and
    // entropy stay dependency injected, and recovery itself consumes neither.
    service = createGameService({ ...runtime, checkpoint: state })
    return state
  }
  const match = () => {
    visitors.forEach((visitor) => write(visitor, 'joinQueue'))
    return rpc(visitors[0], 'getLobby').roomId
  }
  const current = (roomId) => {
    const view = rpc(visitors[0], 'getRoom', { roomId })
    const visitor = visitors.find((visitor) => visitor.playerId === view.currentPlayerId)
    return { visitor, view: visitor ? rpc(visitor, 'getRoom', { roomId }) : view }
  }
  const start = () => {
    const roomId = match()
    const { visitor, view } = current(roomId)
    write(visitor, 'bid', { roomId, score: 3, expectedRevision: view.revision })
    return roomId
  }
  return {
    get service() { return service }, runtime, visitors, rpc, write, restart, match, start, current,
    advance: (ms) => { now += ms }
  }
}

test('private game checkpoint round-trips tokens, queue order and all internal Maps without issuing IDs', () => {
  const s = setup()
  s.write(s.visitors[1], 'joinQueue')
  s.write(s.visitors[0], 'joinQueue')
  const before = s.service.checkpoint()
  assert.equal(before.format, 'campus-landlord-private')
  assert.equal(before.version, 1)
  assert.deepEqual(before.queue, [s.visitors[1].playerId, s.visitors[0].playerId])
  s.restart()
  assert.deepEqual(s.service.checkpoint(), before)
  for (const visitor of s.visitors) assert.deepEqual(s.service.dispatch('session.open', {}, visitor.token), visitor)
  s.write(s.visitors[2], 'joinQueue')
  const roomId = s.rpc(s.visitors[0], 'getLobby').roomId
  assert.equal(roomId, 'room_4')
  const room = s.rpc(s.visitors[0], 'getRoom', { roomId })
  assert.deepEqual(room.seats.map((value) => value.playerId), [...before.queue, s.visitors[2].playerId])
})

test('bidding recovery preserves all three private hands, concealed bottom, deadline and seat identity', () => {
  const s = setup({ turnMs: 350, autoMs: 12, presenceMs: 500 })
  const roomId = s.match()
  const before = s.visitors.map((visitor) => s.rpc(visitor, 'getRoom', { roomId }))
  const privateState = s.restart()
  assert.equal(privateState.rooms[0].bottomCards.length, 3)
  assert.equal(privateState.rooms[0].playerIds.flatMap((id) => privateState.rooms[0].hands[id]).length, 51)
  assert.deepEqual(s.visitors.map((visitor) => s.rpc(visitor, 'getRoom', { roomId })), before)
  assert.ok(before.every((view) => view.bottomCards.length === 0))
  s.advance(349)
  s.service.tick()
  assert.equal(s.current(roomId).view.revision, 1)
  s.advance(1)
  s.service.tick()
  assert.equal(s.current(roomId).view.bids.length, 1)
})

test('a committed bid whose response was lost replays its exact historical receipt after restart and ticking', () => {
  const s = setup({ turnMs: 100, autoMs: 5, presenceMs: 500 })
  const roomId = s.match()
  const { visitor, view } = s.current(roomId)
  const params = { roomId, score: 3, expectedRevision: view.revision, operationId: 'response_lost' }
  const receipt = s.rpc(visitor, 'bid', params)
  s.restart()
  s.advance(101)
  s.service.tick()
  const advanced = s.rpc(visitor, 'getRoom', { roomId })
  assert.ok(advanced.revision > receipt.revision)
  assert.deepEqual(s.rpc(visitor, 'bid', params), receipt)
  assert.equal(s.rpc(visitor, 'getRoom', { roomId }).revision, advanced.revision)
  assert.throws(() => s.rpc(visitor, 'bid', { ...params, score: 0 }), error('CONFLICT'))
  assert.throws(() => s.rpc(visitor, 'setAuto', { roomId, enabled: false, expectedRevision: view.revision,
    operationId: 'different_stale_operation' }), error('CONFLICT'))
})

test('exporting or importing does not tick, reset deadlines, invoke clocks or consume entropy', () => {
  const s = setup({ turnMs: 100 })
  s.match()
  s.advance(101)
  const state = s.service.checkpoint()
  const forbidden = () => { throw new Error('recovery must be side-effect free') }
  const restored = createGameService({ checkpoint: state, clock: forbidden, random: forbidden, id: forbidden })
  assert.deepEqual(restored.checkpoint(), state)
  assert.equal(state.rooms[0].revision, 1)
  assert.equal(state.rooms[0].deadline, 1_000_100)
})

test('checkpoint export and import are detached from caller-owned objects and receipts', () => {
  const s = setup()
  const roomId = s.start()
  const original = s.service.checkpoint()
  const imported = structuredClone(original)
  const restored = createGameService({ ...s.runtime, checkpoint: imported })
  imported.rooms[0].hands[imported.rooms[0].playerIds[0]].splice(0)
  imported.players[0].operations[0][1].result.onlineCount = 999
  imported.sessions.splice(0)
  original.queue.push('forged_player')
  original.rooms[0].deadline = 0
  const view = restored.dispatch('landlord.getRoom', { roomId }, s.visitors[0].token)
  assert.deepEqual(view, s.rpc(s.visitors[0], 'getRoom', { roomId }))
  const dump = restored.checkpoint()
  dump.players[0].operations[0][1].result.onlineCount = 999
  assert.equal(restored.dispatch('landlord.joinQueue', { operationId: 'checkpoint_1' }, s.visitors[0].token).onlineCount, 3)
})

test('every request can use a fresh service while playing a full human game with hints and exact receipts', () => {
  const s = setup({ finishedMs: 50 })
  const roomId = s.start()
  let finished
  let turns = 0
  for (; turns < 250; turns++) {
    s.restart()
    const { visitor, view } = s.current(roomId)
    if (view.phase === 'finished') { finished = view; break }
    const { cardIds } = s.rpc(visitor, 'hint', { roomId })
    const method = cardIds.length ? 'play' : 'pass'
    const params = { roomId, expectedRevision: view.revision, operationId: `human_${turns}`,
      ...(cardIds.length ? { cardIds } : {}) }
    const receipt = s.rpc(visitor, method, params)
    s.restart()
    assert.deepEqual(s.rpc(visitor, method, params), receipt)
  }
  assert.ok(finished, 'full game must finish with per-request recovery')
  assert.ok(turns > 5)
  assert.equal(finished.deadline, null)
  assert.equal(finished.winnerIds.length, finished.winnerTeam === 'landlord' ? 1 : 2)
  s.restart()
  assert.deepEqual(s.current(roomId).view, finished)
  s.advance(50)
  s.service.tick()
  s.restart()
  assert.equal(s.rpc(s.visitors[0], 'getLobby').roomId, null)
  assert.equal(s.service.health().rooms, 0)
})

test('recovered unattended rooms advance by the original legal timeout actions and finish', () => {
  const s = setup({ turnMs: 1, autoMs: 1, presenceMs: 2 })
  const roomId = s.match()
  let finished
  for (let turn = 0; turn < 350; turn++) {
    s.restart()
    s.advance(2)
    s.service.tick()
    const view = s.rpc(s.visitors[0], 'getRoom', { roomId })
    if (view.phase === 'finished') { finished = view; break }
  }
  assert.ok(finished, 'unattended game must finish after recovery')
  assert.ok(finished.seats.every((value) => value.auto))
})

test('recovery preserves a departed player as auto, reconnect behavior, queue expiry and session expiry', () => {
  const s = setup({ turnMs: 100, autoMs: 5, presenceMs: 20, sessionMs: 200, roomMaxMs: 150 })
  const roomId = s.start()
  const visitor = s.visitors[0]
  const receipt = s.write(visitor, 'leave', { roomId })
  s.restart()
  assert.equal(s.write(visitor, 'joinQueue').roomId, roomId)
  assert.equal(s.rpc(visitor, 'getRoom', { roomId }).seats.find((value) => value.playerId === visitor.playerId).auto, true)
  assert.deepEqual(s.rpc(visitor, 'leave', { roomId, operationId: 'checkpoint_5' }), receipt)
  s.advance(151)
  s.restart()
  s.service.tick()
  assert.equal(s.rpc(visitor, 'getLobby').roomId, null)
  assert.equal(s.service.checkpoint().rooms.length, 0)
  s.write(visitor, 'joinQueue')
  s.restart()
  s.advance(21)
  s.service.tick()
  assert.equal(s.service.checkpoint().queue.length, 0)
  s.advance(200)
  s.restart()
  s.service.tick()
  assert.throws(() => s.rpc(visitor, 'getLobby'), error('UNAUTHORIZED'))
  assert.equal(s.service.checkpoint().players.length, 0)
})

test('operation eviction keeps the 256-entry insertion order across JSON recovery', () => {
  const s = setup()
  const visitor = s.visitors[0]
  for (let index = 0; index < 258; index++) s.rpc(visitor, 'cancelQueue', { operationId: `evict_${index}` })
  const state = s.restart()
  assert.equal(state.players[0].operations.length, 256)
  assert.equal(state.players[0].operations[0][0], 'evict_2')
  assert.throws(() => s.rpc(visitor, 'joinQueue', { operationId: 'evict_2' }), error('CONFLICT'))
  assert.equal(s.rpc(visitor, 'joinQueue', { operationId: 'evict_0' }).matchStatus, 'queued')
})

test('recovery accepts every previously successful idle-leave signature, including an unused long roomId', () => {
  for (const queued of [false, true]) {
    const s = setup()
    const visitor = s.visitors[0]
    if (queued) s.write(visitor, 'joinQueue')
    // The established protocol ignores roomId while the visitor has no room.
    // A private persistence validator cannot newly reject that accepted request.
    const params = { operationId: 'legacy_long_unused_room', roomId: 'x'.repeat(4200) }
    const receipt = s.rpc(visitor, 'leave', params)
    const cached = s.service.checkpoint().players[0].operations.find(([id]) => id === params.operationId)
    assert.ok(cached[1].signature.length > 4096)
    s.restart()
    assert.deepEqual(s.rpc(visitor, 'leave', params), receipt)
  }
})

test('three zero bids can recover between turns, then redeal with the original rotated starter', () => {
  const s = setup()
  const roomId = s.match()
  const first = s.current(roomId).view
  for (let turn = 0; turn < 3; turn++) {
    s.restart()
    const { visitor, view } = s.current(roomId)
    s.write(visitor, 'bid', { roomId, score: 0, expectedRevision: view.revision })
  }
  s.restart()
  const next = s.current(roomId).view
  assert.notEqual(next.currentPlayerId, first.currentPlayerId)
  assert.equal(next.phase, 'bidding')
  assert.deepEqual(next.bids, [])
  assert.equal(next.revision, first.revision + 3)
  assert.equal(next.hand.length, 17)
})

test('finished room history can coexist with the same visitors playing a new room', () => {
  const s = setup()
  const firstId = s.start()
  for (let turn = 0; turn < 250; turn++) {
    const { visitor, view } = s.current(firstId)
    if (view.phase === 'finished') break
    const { cardIds } = s.rpc(visitor, 'hint', { roomId: firstId })
    s.write(visitor, cardIds.length ? 'play' : 'pass', { roomId: firstId, expectedRevision: view.revision,
      ...(cardIds.length ? { cardIds } : {}) })
  }
  assert.equal(s.current(firstId).view.phase, 'finished')
  s.visitors.forEach((visitor) => s.write(visitor, 'leave', { roomId: firstId }))
  const secondId = s.start()
  const before = s.service.checkpoint()
  assert.notEqual(secondId, firstId)
  assert.equal(before.rooms.length, 2)
  s.restart()
  assert.deepEqual(s.service.checkpoint(), before)
  assert.equal(s.current(secondId).view.phase, 'playing')
})

test('checkpoint remains server-private and recovered public views never include other hands or tokens', () => {
  const s = setup()
  const roomId = s.match()
  s.restart()
  for (const method of ['checkpoint', 'landlord.checkpoint', 'landlord.exportState'])
    assert.throws(() => s.service.dispatch(method, {}, s.visitors[0].token), error('NOT_IMPLEMENTED'))
  assert.throws(() => s.rpc(s.visitors[0], 'getLobby', { checkpoint: {} }), error('INVALID_ARGUMENT'))
  const privateState = s.service.checkpoint()
  const view = s.rpc(s.visitors[0], 'getRoom', { roomId })
  const wire = JSON.stringify({ view, health: s.service.health(), lobby: s.rpc(s.visitors[0], 'getLobby') })
  assert.ok(!wire.includes(privateState.format))
  assert.ok(privateState.sessions.every(([token]) => !wire.includes(token)))
  const otherCards = privateState.rooms[0].playerIds.slice(1).flatMap((id) => privateState.rooms[0].hands[id])
  assert.ok(otherCards.every((card) => !wire.includes(`"id":"${card.id}"`)))
  const outsider = s.service.dispatch('session.open', { nickname: '旁观者' })
  assert.throws(() => s.rpc(outsider, 'getRoom', { roomId }), error('FORBIDDEN'))
})

test('malformed private checkpoints fail closed, including forged cards and public cached-result expansion', () => {
  const s = setup()
  s.start()
  const original = s.service.checkpoint()
  const corruptions = [
    (value) => { value.version = 2 },
    (value) => { value.format = 'client-room' },
    (value) => { value.queue.push('missing_player') },
    (value) => { value.players[0].roomId = 'missing_room' },
    (value) => { value.players[0].operations[0][1].result.sessions = value.sessions },
    (value) => { value.players[0].operations.push(value.players[0].operations[0]) },
    (value) => { value.sessions[1][0] = value.sessions[0][0] },
    (value) => { value.sessions[1][1] = value.sessions[0][1] },
    (value) => { value.rooms[0].hands[value.rooms[0].playerIds[0]][0].rank = 99 },
    (value) => { value.rooms[0].auto = {} },
    (value) => { value.rooms[0].deadline = null },
    (value) => { value.settings.autoMs = Infinity },
    (value) => { value.players[0].operations = new Map(value.players[0].operations) },
    (value) => { Object.setPrototypeOf(value.queue, { every: () => { throw new Error('untrusted array prototype') } }) },
    (value) => { value.extra = 'unexpected' },
    (value) => { value.loop = value }
  ]
  for (const corrupt of corruptions) {
    const checkpoint = structuredClone(original)
    corrupt(checkpoint)
    assert.throws(() => createGameService({ checkpoint }), error('SERVICE_UNAVAILABLE'), corrupt.toString())
  }
  let accessed = false
  const accessor = structuredClone(original)
  Object.defineProperty(accessor, 'queue', { enumerable: true, get: () => { accessed = true; return [] } })
  assert.throws(() => createGameService({ checkpoint: accessor }), error('SERVICE_UNAVAILABLE'))
  assert.equal(accessed, false)
  assert.deepEqual(s.service.checkpoint(), original)
  for (const checkpoint of [null, {}, [], 'private-state'])
    assert.throws(() => createGameService({ checkpoint }), error('SERVICE_UNAVAILABLE'))
})
