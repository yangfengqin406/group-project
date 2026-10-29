// The rules live on the server. Clients send card IDs, never a claimed pattern.
const SUITS = [
  ['S', 'spades'],
  ['H', 'hearts'],
  ['C', 'clubs'],
  ['D', 'diamonds']
]
const LABELS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' }

export function createDeck() {
  const cards = SUITS.flatMap(([prefix, suit]) =>
    Array.from({ length: 13 }, (_, index) => {
      const rank = index + 3
      return { id: `${prefix}${rank}`, rank, suit, label: LABELS[rank] || String(rank) }
    })
  )
  return cards.concat([
    { id: 'SJ', rank: 16, suit: 'joker', label: '小王' },
    { id: 'BJ', rank: 17, suit: 'joker', label: '大王' }
  ])
}

export function sortCards(cards) {
  return [...cards].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
}

export function shuffleDeck(random) {
  const cards = createDeck()
  for (let i = cards.length - 1; i > 0; i--) {
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new Error('Shuffle random source must return a number in [0, 1)')
    const j = Math.floor(value * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

function grouped(cards) {
  const groups = new Map()
  for (const card of sortCards(cards)) {
    if (!groups.has(card.rank)) groups.set(card.rank, [])
    groups.get(card.rank).push(card)
  }
  return groups
}

function consecutive(ranks) {
  return ranks.at(-1) <= 14 && ranks.every((rank, i) => i === 0 || rank === ranks[i - 1] + 1)
}

function pattern(type, main, length, size) {
  return { type, main, length, size }
}

export function identifyPatterns(cards) {
  if (!Array.isArray(cards) || !cards.length || cards.length > 20) return []
  const valid = new Map(createDeck().map((card) => [card.id, card]))
  if (new Set(cards.map((card) => card.id)).size !== cards.length ||
      cards.some((card) => !valid.has(card.id) || valid.get(card.id).rank !== card.rank)) return []
  const groups = grouped(cards)
  const ranks = [...groups.keys()]
  const n = cards.length
  const result = []
  if (n === 1) result.push(pattern('single', ranks[0], 1, n))
  if (ranks.length === 1) {
    if (n === 2) result.push(pattern('pair', ranks[0], 1, n))
    if (n === 3) result.push(pattern('triple', ranks[0], 1, n))
    if (n === 4) result.push(pattern('bomb', ranks[0], 1, n))
  }
  if (n === 2 && ranks[0] === 16 && ranks[1] === 17)
    result.push(pattern('rocket', 17, 1, n))
  if (n === 4 || n === 5) {
    const triple = ranks.find((rank) => groups.get(rank).length === 3)
    if (triple !== undefined && (n === 4 || (ranks.length === 2 && groups.get(ranks.find((rank) => rank !== triple)).length === 2)))
      result.push(pattern(n === 4 ? 'triple-single' : 'triple-pair', triple, 1, n))
  }
  if (n >= 5 && ranks.length === n && consecutive(ranks))
    result.push(pattern('straight', ranks.at(-1), n, n))
  if (n >= 6 && n % 2 === 0 && ranks.length === n / 2 &&
      ranks.every((rank) => groups.get(rank).length === 2) && consecutive(ranks))
    result.push(pattern('pair-straight', ranks.at(-1), n / 2, n))
  if (n >= 6 && n % 3 === 0 && ranks.length === n / 3 &&
      ranks.every((rank) => groups.get(rank).length === 3) && consecutive(ranks))
    result.push(pattern('triple-straight', ranks.at(-1), n / 3, n))
  for (const [divisor, type] of [[4, 'airplane-single'], [5, 'airplane-pair']]) {
    if (n % divisor !== 0 || n / divisor < 2) continue
    const length = n / divisor
    for (let start = 3; start + length - 1 <= 14; start++) {
      const body = Array.from({ length }, (_, i) => start + i)
      // Wings cannot be cards of the plane's body rank.
      if (!body.every((rank) => groups.get(rank)?.length === 3)) continue
      const wings = ranks.filter((rank) => !body.includes(rank))
      const validWings = type === 'airplane-single'
        ? wings.reduce((sum, rank) => sum + groups.get(rank).length, 0) === length
        : wings.length === length && wings.every((rank) => groups.get(rank).length === 2)
      if (validWings) result.push(pattern(type, body.at(-1), length, n))
    }
  }
  const quad = ranks.find((rank) => groups.get(rank).length === 4)
  if (quad !== undefined) {
    if (n === 6) result.push(pattern('four-single', quad, 1, n))
    if (n === 8 && ranks.length === 3 && ranks.filter((rank) => rank !== quad).every((rank) => groups.get(rank).length === 2))
      result.push(pattern('four-pair', quad, 1, n))
  }
  return result
}

export function beats(candidate, previous) {
  if (!candidate) return false
  if (!previous) return true
  if (previous.type === 'rocket') return false
  if (candidate.type === 'rocket') return true
  if (candidate.type === 'bomb' && previous.type !== 'bomb') return true
  return candidate.type === previous.type && candidate.size === previous.size &&
    candidate.length === previous.length && candidate.main > previous.main
}

export function identifyPlay(cards, previous = null) {
  return identifyPatterns(cards).find((value) => beats(value, previous)) || null
}

// Enumerate structural candidates instead of all 2^20 card subsets.
export function legalCandidates(hand) {
  const groups = grouped(hand)
  const ranks = [...groups.keys()]
  const candidates = []
  const add = (cards) => {
    for (const value of identifyPatterns(cards))
      candidates.push({ cards: sortCards(cards), pattern: value })
  }
  for (const rank of ranks) {
    const cards = groups.get(rank)
    add(cards.slice(0, 1))
    if (cards.length >= 2) add(cards.slice(0, 2))
    if (cards.length >= 3) {
      add(cards.slice(0, 3))
      for (const other of ranks.filter((value) => value !== rank)) {
        add([...cards.slice(0, 3), ...groups.get(other).slice(0, 1)])
        if (groups.get(other).length >= 2) add([...cards.slice(0, 3), ...groups.get(other).slice(0, 2)])
      }
    }
    if (cards.length === 4) {
      add(cards)
      const remaining = sortCards(hand.filter((card) => card.rank !== rank))
      if (remaining.length >= 2) add([...cards, ...remaining.slice(0, 2)])
      const pairs = ranks.filter((other) => other !== rank && groups.get(other).length >= 2)
      if (pairs.length >= 2) add([...cards, ...groups.get(pairs[0]).slice(0, 2), ...groups.get(pairs[1]).slice(0, 2)])
    }
  }
  if (groups.has(16) && groups.has(17)) add([groups.get(16)[0], groups.get(17)[0]])
  for (let count = 1; count <= 3; count++) {
    const minimum = count === 1 ? 5 : count === 2 ? 3 : 2
    for (let start = 3; start <= 14; start++) {
      for (let length = minimum; start + length - 1 <= 14; length++) {
        const bodyRanks = Array.from({ length }, (_, i) => start + i)
        if (!bodyRanks.every((rank) => (groups.get(rank)?.length || 0) >= count)) break
        const body = bodyRanks.flatMap((rank) => groups.get(rank).slice(0, count))
        add(body)
        if (count !== 3) continue
        const wings = sortCards(hand.filter((card) => !bodyRanks.includes(card.rank)))
        if (wings.length >= length) add([...body, ...wings.slice(0, length)])
        const pairs = ranks.filter((rank) => !bodyRanks.includes(rank) && groups.get(rank).length >= 2)
        if (pairs.length >= length) add([...body, ...pairs.slice(0, length).flatMap((rank) => groups.get(rank).slice(0, 2))])
      }
    }
  }
  return candidates
}

export function findHint(hand, previous = null) {
  const candidates = legalCandidates(hand).filter((candidate) => beats(candidate.pattern, previous))
  candidates.sort((a, b) => {
    const aSpecial = ['bomb', 'rocket'].includes(a.pattern.type) ? 1 : 0
    const bSpecial = ['bomb', 'rocket'].includes(b.pattern.type) ? 1 : 0
    return aSpecial - bSpecial || (previous ? 0 : b.cards.length - a.cards.length) || a.pattern.main - b.pattern.main
  })
  return candidates[0]?.cards.map((card) => card.id) || []
}
