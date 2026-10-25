import test from 'node:test'
import assert from 'node:assert/strict'
import { createGameService } from '../server/landlord/service.mjs'
import { identifyPlay } from '../server/landlord/cards.mjs'

function setup(options = {}) {
  let now = 1_000_000
  let nextId = 0
  let seed = 42
  const service = createGameService({
    clock: () => now,
    random: () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 },
    id: (prefix) => `${prefix}_${++nextId}`,
    ...options
  })
  const visitors = ['阿青', '小米', '豆豆'].map((nickname) => service.dispatch('session.open', { nickname }))
  let operation = 0
  const rpc = (visitor, method, params = {}) => service.dispatch(`landlord.${method}`, params, visitor.token)
  const write = (visitor, method, params = {}) => rpc(visitor, method, { ...params, operationId: `op_${++operation}` })
  const matched = () => {
    visitors.forEach((visitor) => write(visitor, 'joinQueue'))
    return rpc(visitors[0], 'getLobby').roomId
  }
  const current = (roomId) => {
    const first = visitors.find((visitor) => rpc(visitor, 'getLobby').roomId === roomId)
    const view = rpc(first, 'getRoom', { roomId })
    const visitor = visitors.find((value) => value.playerId === view.currentPlayerId)
    return { visitor, view: visitor ? rpc(visitor, 'getRoom', { roomId }) : view }
  }
  const start = () => {
    const roomId = matched()
    const { visitor, view } = current(roomId)
    write(visitor, 'bid', { roomId, score: 3, expectedRevision: view.revision })
    return roomId
  }
  return { service, visitors, rpc, write, matched, current, start, advance: (ms) => { now += ms }, time: () => now }
}

function error(code) {
  return (value) => value.code === code
}

test('landlord sessions are independent and same-token tabs restore one counted visitor', () => {
  const s = setup()
  assert.equal(new Set(s.visitors.map((visitor) => visitor.token)).size, 3)
  for (let index = 0; index < 3; index++) {
    assert.deepEqual(s.service.dispatch('session.open', {}, s.visitors[0].token), s.visitors[0])
    assert.equal(s.rpc(s.visitors[0], 'getLobby').onlineCount, 3)
  }
  assert.throws(() => s.service.dispatch('session.open', { nickname: ' ' }), error('INVALID_ARGUMENT'))
  assert.throws(() => s.service.dispatch('session.open', { nickname: '十三个字十三个字十三个字十' }), error('INVALID_ARGUMENT'))
  assert.throws(() => s.service.dispatch('landlord.getLobby', {}, 'made-up-token'), error('UNAUTHORIZED'))
  assert.throws(() => s.rpc(s.visitors[0], 'getLobby', { playerId: s.visitors[1].playerId }), error('INVALID_ARGUMENT'))
})

test('landlord queue deduplicates tabs, cancels before match and atomically assigns exactly three', () => {
  const s = setup()
  s.write(s.visitors[0], 'joinQueue')
  assert.equal(s.write(s.visitors[0], 'joinQueue').queueCount, 1)
  assert.equal(s.write(s.visitors[0], 'cancelQueue').queueCount, 0)
  const roomId = s.matched()
  assert.ok(roomId)
  assert.ok(s.visitors.every((visitor) => s.rpc(visitor, 'getLobby').roomId === roomId))
  assert.equal(s.rpc(s.visitors[0], 'getLobby').queueCount, 0)
  assert.equal(s.write(s.visitors[0], 'cancelQueue').roomId, roomId)
  assert.equal(s.write(s.visitors[0], 'joinQueue').roomId, roomId)
})

test('landlord stale queue visitors drop out instead of becoming fake online matches', () => {
  const s = setup({ presenceMs: 100 })
  s.write(s.visitors[0], 'joinQueue')
  s.advance(101)
  s.service.tick()
  const view = s.rpc(s.visitors[1], 'getLobby')
  assert.equal(view.queueCount, 0)
  assert.equal(view.onlineCount, 1)
  assert.equal(view.roomId, null)
})

test('landlord deals 17 private cards to each visitor and conceals bottom until landlord selected', () => {
  const s = setup()
  const roomId = s.matched()
  const views = s.visitors.map((visitor) => s.rpc(visitor, 'getRoom', { roomId }))
  assert.equal(new Set(views.flatMap((view) => view.hand.map((card) => card.id))).size, 51)
  for (const view of views) {
    assert.equal(view.hand.length, 17)
    assert.deepEqual(view.bottomCards, [])
    assert.equal(view.seats.length, 3)
    for (const seat of view.seats) {
      assert.equal(seat.handCount, 17)
      assert.equal(Object.hasOwn(seat, 'hand'), false)
      assert.equal(Object.hasOwn(seat, 'token'), false)
    }
    for (const other of views.filter((value) => value.selfId !== view.selfId))
      assert.equal(other.hand.some((card) => JSON.stringify(view).includes(`"id":"${card.id}"`)), false)
  }
  const outsider = s.service.dispatch('session.open', { nickname: '围观者' })
  assert.throws(() => s.rpc(outsider, 'getRoom', { roomId }), error('FORBIDDEN'))
})

test('landlord bids validate turn, range and increasing score, then give landlord three bottom cards', () => {
  const s = setup()
  const roomId = s.matched()
  let { visitor, view } = s.current(roomId)
  const other = s.visitors.find((value) => value !== visitor)
  assert.throws(() => s.write(other, 'bid', { roomId, score: 1, expectedRevision: view.revision }), error('FORBIDDEN'))
  assert.throws(() => s.write(visitor, 'bid', { roomId, score: 4, expectedRevision: view.revision }), error('INVALID_ARGUMENT'))
  s.write(visitor, 'bid', { roomId, score: 1, expectedRevision: view.revision })
  ;({ visitor, view } = s.current(roomId))
  assert.throws(() => s.write(visitor, 'bid', { roomId, score: 1, expectedRevision: view.revision }), error('INVALID_ARGUMENT'))
  const final = s.write(visitor, 'bid', { roomId, score: 3, expectedRevision: view.revision })
  assert.equal(final.phase, 'playing')
  assert.equal(final.landlordId, visitor.playerId)
  assert.equal(final.currentPlayerId, visitor.playerId)
  assert.equal(final.hand.length, 20)
  assert.equal(final.bottomCards.length, 3)
  assert.equal(new Set(final.hand.map((card) => card.id)).size, 20)
})

test('landlord all-zero bids redeal and rotate starter without fabricating a winner', () => {
  const s = setup()
  const roomId = s.matched()
  const first = s.current(roomId).view
  for (let turn = 0; turn < 3; turn++) {
    const { visitor, view } = s.current(roomId)
    s.write(visitor, 'bid', { roomId, score: 0, expectedRevision: view.revision })
  }
  const next = s.current(roomId).view
  assert.equal(next.phase, 'bidding')
  assert.equal(next.revision, first.revision + 3)
  assert.notEqual(next.currentPlayerId, first.currentPlayerId)
  assert.equal(next.winnerTeam, null)
  assert.deepEqual(next.bids, [])
  assert.equal(next.hand.length, 17)
})

test('landlord action retry is idempotent and rejects operation reuse and stale revision', () => {
  const s = setup()
  const roomId = s.matched()
  const { visitor, view } = s.current(roomId)
  const params = { roomId, score: 3, operationId: 'same_id', expectedRevision: view.revision }
  const first = s.rpc(visitor, 'bid', params)
  assert.deepEqual(s.rpc(visitor, 'bid', params), first)
  assert.throws(() => s.rpc(visitor, 'bid', { ...params, score: 0 }), error('CONFLICT'))
  assert.throws(() => s.write(visitor, 'setAuto', { roomId, enabled: true, expectedRevision: view.revision }), error('CONFLICT'))
  assert.equal(s.rpc(visitor, 'getRoom', { roomId }).revision, first.revision)
})

test('landlord rejects forged phase, cards, duplicate cards and first-turn pass without removing cards', () => {
  const s = setup()
  const roomId = s.start()
  const { visitor, view } = s.current(roomId)
  assert.throws(() => s.write(visitor, 'pass', { roomId, expectedRevision: view.revision }), error('INVALID_ARGUMENT'))
  assert.throws(() => s.write(visitor, 'play', { roomId, cardIds: ['FAKE'], expectedRevision: view.revision }), error('FORBIDDEN'))
  assert.throws(() => s.write(visitor, 'play', { roomId, cardIds: [view.hand[0].id, view.hand[0].id], expectedRevision: view.revision }), error('INVALID_ARGUMENT'))
  assert.throws(() => s.write(visitor, 'play', { roomId, cardIds: [view.hand[0].id], phase: 'finished', expectedRevision: view.revision }), error('INVALID_ARGUMENT'))
  assert.equal(s.rpc(visitor, 'getRoom', { roomId }).hand.length, 20)
  assert.equal(s.rpc(visitor, 'getRoom', { roomId }).revision, view.revision)
})

test('landlord two passes return lead to prior player and clear the trick', () => {
  const s = setup()
  const roomId = s.start()
  const { visitor, view } = s.current(roomId)
  s.write(visitor, 'play', { roomId, cardIds: [view.hand[0].id], expectedRevision: view.revision })
  for (let turn = 0; turn < 2; turn++) {
    const next = s.current(roomId)
    s.write(next.visitor, 'pass', { roomId, expectedRevision: next.view.revision })
  }
  const next = s.current(roomId).view
  assert.equal(next.currentPlayerId, visitor.playerId)
  assert.equal(next.lastPlay, null)
})

test('landlord turn timeout and disconnect are explicitly labelled automatic, and can reconnect', () => {
  const s = setup({ turnMs: 100, autoMs: 1, presenceMs: 200 })
  const roomId = s.matched()
  const before = s.current(roomId)
  s.advance(101)
  s.service.tick()
  let view = s.rpc(before.visitor, 'getRoom', { roomId })
  assert.equal(view.bids.length, 1)
  assert.equal(view.seats.find((seat) => seat.playerId === before.visitor.playerId).auto, true)
  s.advance(201)
  s.service.tick()
  view = s.rpc(before.visitor, 'getRoom', { roomId })
  assert.equal(view.seats.find((seat) => seat.playerId === before.visitor.playerId).connected, true)
  assert.ok(view.seats.filter((seat) => seat.playerId !== before.visitor.playerId).every((seat) => seat.connected === false && seat.auto))
  const off = s.write(before.visitor, 'setAuto', { roomId, enabled: false, expectedRevision: view.revision })
  assert.equal(off.seats.find((seat) => seat.playerId === before.visitor.playerId).auto, false)
})

test('landlord full human game validates all hinted plays and awards the whole winning team', () => {
  const s = setup()
  const roomId = s.start()
  let final
  for (let turn = 0; turn < 250; turn++) {
    const { visitor, view } = s.current(roomId)
    if (view.phase === 'finished') { final = view; break }
    const hint = s.rpc(visitor, 'hint', { roomId }).cardIds
    if (hint.length) {
      assert.ok(identifyPlay(hint.map((id) => view.hand.find((card) => card.id === id)), view.lastPlay?.pattern))
      s.write(visitor, 'play', { roomId, cardIds: hint, expectedRevision: view.revision })
    } else s.write(visitor, 'pass', { roomId, expectedRevision: view.revision })
  }
  assert.ok(final, 'game must finish')
  assert.equal(final.currentPlayerId, null)
  assert.equal(final.deadline, null)
  assert.ok(['landlord', 'farmers'].includes(final.winnerTeam))
  assert.equal(final.winnerIds.length, final.winnerTeam === 'landlord' ? 1 : 2)
  const departed = s.write(s.visitors[0], 'leave', { roomId })
  assert.equal(departed.roomId, null)
  assert.equal(s.write(s.visitors[0], 'joinQueue').matchStatus, 'queued')
})

test('landlord leaving a live game marks auto and cannot match into a second game', () => {
  const s = setup()
  const roomId = s.start()
  const visitor = s.visitors[0]
  assert.equal(s.write(visitor, 'leave', { roomId }).roomId, roomId)
  assert.equal(s.rpc(visitor, 'getRoom', { roomId }).seats.find((seat) => seat.playerId === visitor.playerId).auto, true)
  assert.equal(s.write(visitor, 'joinQueue').matchStatus, 'matched')
  assert.equal(s.rpc(visitor, 'getLobby').queueCount, 0)
})

test('landlord full unattended game completes by legal server-side auto actions', () => {
  const s = setup({ turnMs: 1, autoMs: 1, presenceMs: 2 })
  const roomId = s.matched()
  let final
  for (let turn = 0; turn < 350; turn++) {
    s.advance(2)
    s.service.tick()
    const view = s.rpc(s.visitors[0], 'getRoom', { roomId })
    if (view.phase === 'finished') { final = view; break }
  }
  assert.ok(final, 'unattended game must finish')
  assert.ok(final.seats.every((seat) => seat.auto))
})

test('landlord abandoned rooms and expired visitor sessions are cleaned without declaring a win', () => {
  const s = setup({ roomMaxMs: 100, sessionMs: 150, presenceMs: 50 })
  const roomId = s.matched()
  s.advance(101)
  s.service.tick()
  assert.equal(s.rpc(s.visitors[0], 'getLobby').roomId, null)
  assert.throws(() => s.rpc(s.visitors[0], 'getRoom', { roomId }), error('NOT_FOUND'))
  s.advance(151)
  s.service.tick()
  assert.throws(() => s.rpc(s.visitors[0], 'getLobby'), error('UNAUTHORIZED'))
})

test('landlord returned snapshots cannot mutate authoritative hands, queue or revisions', () => {
  const s = setup()
  const roomId = s.start()
  const { visitor, view } = s.current(roomId)
  const original = structuredClone(view)
  view.hand.splice(0)
  view.revision = 10_000
  view.seats[0].auto = true
  view.bottomCards[0].rank = 99
  assert.deepEqual(s.rpc(visitor, 'getRoom', { roomId }), original)
  const next = s.write(visitor, 'play', { roomId, cardIds: [original.hand[0].id], expectedRevision: original.revision })
  assert.equal(next.hand.length, original.hand.length - 1)
})

test('landlord varied complete deals can finish with either team and clean finished rooms', () => {
  const winners = new Set()
  for (let sample = 1; sample <= 20; sample++) {
    let seed = sample
    const s = setup({
      finishedMs: 100,
      random: () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 }
    })
    const roomId = s.start()
    let final
    for (let turn = 0; turn < 250; turn++) {
      const { visitor, view } = s.current(roomId)
      if (view.phase === 'finished') { final = view; break }
      const hint = s.rpc(visitor, 'hint', { roomId }).cardIds
      s.write(visitor, hint.length ? 'play' : 'pass', {
        roomId, ...(hint.length ? { cardIds: hint } : {}), expectedRevision: view.revision
      })
    }
    assert.ok(final, `deal ${sample} must finish`)
    winners.add(final.winnerTeam)
    assert.equal(final.winnerIds.length, final.winnerTeam === 'landlord' ? 1 : 2)
    assert.ok(final.winnerIds.every((value) => final.winnerTeam === 'landlord' ? value === final.landlordId : value !== final.landlordId))
    s.advance(101)
    s.service.tick()
    assert.equal(s.rpc(s.visitors[0], 'getLobby').roomId, null)
    assert.throws(() => s.rpc(s.visitors[0], 'getRoom', { roomId }), error('NOT_FOUND'))
  }
  assert.deepEqual(winners, new Set(['landlord', 'farmers']))
})
