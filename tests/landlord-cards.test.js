import test from 'node:test'
import assert from 'node:assert/strict'
import { createDeck, shuffleDeck, identifyPatterns, identifyPlay, beats, findHint } from '../server/landlord/cards.mjs'

const deck = createDeck()
const cards = (ranks) => {
  const used = new Set()
  return ranks.map((rank) => {
    const card = deck.find((value) => value.rank === rank && !used.has(value.id))
    assert.ok(card, `rank ${rank} must exist`)
    used.add(card.id)
    return card
  })
}

test('landlord deck has 54 unique cards and a shuffle preserves every card', () => {
  assert.equal(deck.length, 54)
  assert.equal(new Set(deck.map((card) => card.id)).size, 54)
  assert.deepEqual(shuffleDeck(() => 0).map((card) => card.id).sort(), deck.map((card) => card.id).sort())
  assert.throws(() => shuffleDeck(() => 1), /random source/)
})

for (const [type, ranks] of [
  ['single', [3]], ['pair', [4, 4]], ['triple', [5, 5, 5]],
  ['triple-single', [6, 6, 6, 3]], ['triple-pair', [7, 7, 7, 4, 4]],
  ['straight', [3, 4, 5, 6, 7]], ['pair-straight', [3, 3, 4, 4, 5, 5]],
  ['triple-straight', [3, 3, 3, 4, 4, 4]],
  ['airplane-single', [3, 3, 3, 4, 4, 4, 8, 9]],
  ['airplane-single', [3, 3, 3, 4, 4, 4, 8, 8]],
  ['airplane-pair', [3, 3, 3, 4, 4, 4, 8, 8, 9, 9]],
  ['four-single', [5, 5, 5, 5, 8, 9]],
  ['four-single', [5, 5, 5, 5, 8, 8]],
  ['four-pair', [5, 5, 5, 5, 8, 8, 9, 9]],
  ['bomb', [15, 15, 15, 15]], ['rocket', [16, 17]]
]) {
  test(`landlord recognises ${type}: ${ranks.join(',')}`, () => {
    assert.ok(identifyPatterns(cards(ranks)).some((value) => value.type === type))
  })
}

test('landlord rejects malformed and invalid runs, wings and duplicate cards', () => {
  for (const ranks of [
    [10, 11, 12, 13, 14, 15], [14, 14, 15, 15, 16, 17],
    [3, 3, 3, 5, 5, 5], [3, 3, 3, 3, 4, 4, 4, 8],
    [3, 3, 3, 4, 4, 4, 8, 8, 8, 8],
    [3, 3, 3, 3, 4, 4, 4, 4], [3, 4, 6], [3, 3, 4, 4]
  ]) assert.deepEqual(identifyPatterns(cards(ranks)), [], ranks.join(','))
  assert.deepEqual(identifyPatterns([deck[0], deck[0]]), [])
  assert.deepEqual(identifyPatterns([{ ...deck[0], rank: 17 }]), [])
})

test('landlord comparison requires the same shape and length; bombs and rocket override', () => {
  const low = identifyPlay(cards([3, 4, 5, 6, 7]))
  const high = identifyPlay(cards([4, 5, 6, 7, 8]))
  assert.equal(beats(high, low), true)
  assert.equal(beats(low, high), false)
  assert.equal(beats(identifyPlay(cards([4, 5, 6, 7, 8, 9])), low), false)
  assert.equal(beats(identifyPlay(cards([14, 14])), low), false)
  const bomb = identifyPlay(cards([3, 3, 3, 3]))
  const rocket = identifyPlay(cards([16, 17]))
  assert.equal(beats(bomb, high), true)
  assert.equal(beats(rocket, bomb), true)
  assert.equal(beats(bomb, rocket), false)
  assert.equal(beats(rocket, rocket), false)
})

test('landlord hint finds legal attached sequences, preserves hand and passes when impossible', () => {
  const hand = cards([4, 4, 4, 5, 5, 5, 8, 8, 9, 9, 12])
  const before = structuredClone(hand)
  const previous = identifyPlay(cards([3, 3, 3, 4, 4, 4, 6, 6, 7, 7]))
  const hint = findHint(hand, previous)
  assert.equal(hint.length, 10)
  assert.ok(identifyPlay(hint.map((id) => hand.find((card) => card.id === id)), previous))
  assert.deepEqual(hand, before)
  assert.deepEqual(findHint(cards([3, 4]), identifyPlay(cards([15]))), [])
})

test('landlord hint keeps alternative legal interpretations of a four-triple airplane', () => {
  const hand = cards([4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7])
  const previous = { type: 'airplane-single', main: 5, length: 3, size: 12 }
  const hint = findHint(hand, previous)
  assert.equal(hint.length, 12)
  assert.ok(identifyPlay(hint.map((id) => hand.find((card) => card.id === id)), previous))
})
