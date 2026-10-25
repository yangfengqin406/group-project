import { randomBytes, randomInt } from 'node:crypto'
import { findHint, identifyPlay, shuffleDeck, sortCards } from './cards.mjs'

export class GameError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function requireThat(condition, code, message) {
  if (!condition) throw new GameError(code, message)
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function fingerprint(method, params) {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : object(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
  return JSON.stringify([method, canonical(params)])
}

const clone = (value) => structuredClone(value)
const PARAMETERS = {
  'session.open': ['nickname'],
  'landlord.getLobby': [],
  'landlord.joinQueue': ['operationId'],
  'landlord.cancelQueue': ['operationId'],
  'landlord.getRoom': ['roomId'],
  'landlord.hint': ['roomId'],
  'landlord.bid': ['roomId', 'score', 'operationId', 'expectedRevision'],
  'landlord.play': ['roomId', 'cardIds', 'operationId', 'expectedRevision'],
  'landlord.pass': ['roomId', 'operationId', 'expectedRevision'],
  'landlord.setAuto': ['roomId', 'enabled', 'operationId', 'expectedRevision'],
  'landlord.leave': ['roomId', 'operationId']
}

export function createGameService(options = {}) {
  const clock = options.clock || Date.now
  const random = options.random || (() => randomInt(0x100000000) / 0x100000000)
  const id = options.id || ((prefix) => `${prefix}_${randomBytes(12).toString('base64url')}`)
  const turnMs = options.turnMs ?? 20_000
  const autoMs = options.autoMs ?? 800
  const presenceMs = options.presenceMs ?? 45_000
  const sessionMs = options.sessionMs ?? 6 * 60 * 60_000
  const finishedMs = options.finishedMs ?? 10 * 60_000
  const roomMaxMs = options.roomMaxMs ?? 30 * 60_000
  const maxSessions = options.maxSessions ?? 1000
  const sessions = new Map()
  const players = new Map()
  const rooms = new Map()
  const queue = []

  function online(player, now = clock()) {
    return now - player.lastSeen < presenceMs
  }

  function lobby(player) {
    return {
      onlineCount: [...players.values()].filter((value) => online(value)).length,
      queueCount: queue.length,
      roomId: player.roomId,
      matchStatus: player.roomId ? 'matched' : queue.includes(player.id) ? 'queued' : 'idle'
    }
  }

  function snapshot(room, player) {
    return {
      roomId: room.id,
      revision: room.revision,
      phase: room.phase,
      selfId: player.id,
      currentPlayerId: room.phase === 'finished' ? null : room.playerIds[room.turn],
      deadline: room.phase === 'finished' ? null : room.deadline,
      serverTime: clock(),
      landlordId: room.landlordId,
      highestBid: room.highestBid,
      highestBidderId: room.highestBidderId,
      bids: clone(room.bids),
      bottomCards: room.landlordId ? clone(room.bottomCards) : [],
      seats: room.playerIds.map((playerId, seatIndex) => {
        const seated = players.get(playerId)
        return {
          playerId,
          nickname: seated.nickname,
          seatIndex,
          handCount: room.hands[playerId].length,
          auto: room.auto[playerId],
          connected: online(seated),
          role: !room.landlordId ? null : playerId === room.landlordId ? 'landlord' : 'farmer',
          lastAction: clone(room.lastActions[playerId] || null)
        }
      }),
      hand: clone(sortCards(room.hands[player.id])),
      lastPlay: clone(room.lastPlay),
      winnerTeam: room.winnerTeam,
      winnerIds: [...room.winnerIds],
      message: room.message
    }
  }

  function schedule(room, now = clock()) {
    const playerId = room.playerIds[room.turn]
    room.deadline = now + (room.auto[playerId] ? autoMs : turnMs)
  }

  function deal(room, first = false) {
    const cards = shuffleDeck(random)
    room.hands = Object.fromEntries(room.playerIds.map((playerId, index) => [playerId, sortCards(cards.slice(index * 17, (index + 1) * 17))]))
    room.bottomCards = cards.slice(51)
    room.landlordId = null
    room.highestBid = 0
    room.highestBidderId = null
    room.bids = []
    room.lastPlay = null
    room.passCount = 0
    room.phase = 'bidding'
    room.lastActions = {}
    if (!first) room.startSeat = (room.startSeat + 1) % 3
    room.turn = room.startSeat
    room.message = first ? '三位牌友已到齐，开始叫分' : '大家都没有叫地主，重新发牌'
    schedule(room)
  }

  function match() {
    while (queue.length >= 3) {
      const playerIds = queue.splice(0, 3)
      const room = {
        id: id('room'), playerIds, revision: 1, createdAt: clock(), finishedAt: null,
        startSeat: Math.floor(random() * 3), winnerTeam: null, winnerIds: [],
        auto: Object.fromEntries(playerIds.map((playerId) => [playerId, false])),
        left: Object.fromEntries(playerIds.map((playerId) => [playerId, false]))
      }
      deal(room, true)
      rooms.set(room.id, room)
      for (const playerId of playerIds) players.get(playerId).roomId = room.id
    }
  }

  function removeQueued(playerId) {
    const index = queue.indexOf(playerId)
    if (index !== -1) queue.splice(index, 1)
  }

  function selectLandlord(room) {
    room.landlordId = room.highestBidderId
    room.hands[room.landlordId] = sortCards([...room.hands[room.landlordId], ...room.bottomCards])
    room.turn = room.playerIds.indexOf(room.landlordId)
    room.phase = 'playing'
    room.message = `${players.get(room.landlordId).nickname}当地主，开始出牌`
    schedule(room)
  }

  function bid(room, playerId, score) {
    requireThat(room.phase === 'bidding', 'CONFLICT', '当前不在叫分阶段')
    requireThat(room.playerIds[room.turn] === playerId, 'FORBIDDEN', '还没有轮到你叫分')
    requireThat(Number.isInteger(score) && score >= 0 && score <= 3, 'INVALID_ARGUMENT', '叫分只能为0到3')
    requireThat(score === 0 || score > room.highestBid, 'INVALID_ARGUMENT', '叫分必须高于当前分数，也可以不叫')
    room.bids.push({ playerId, score })
    room.lastActions[playerId] = { type: 'bid', score }
    if (score > room.highestBid) {
      room.highestBid = score
      room.highestBidderId = playerId
    }
    if (score === 3 || room.bids.length === 3) {
      if (room.highestBidderId) selectLandlord(room)
      else deal(room)
    } else {
      room.turn = (room.turn + 1) % 3
      room.message = score ? `${players.get(playerId).nickname}叫${score}分` : `${players.get(playerId).nickname}不叫`
      schedule(room)
    }
    room.revision++
  }

  function finish(room, playerId) {
    room.phase = 'finished'
    room.winnerTeam = playerId === room.landlordId ? 'landlord' : 'farmers'
    room.winnerIds = room.playerIds.filter((value) => (value === room.landlordId) === (room.winnerTeam === 'landlord'))
    room.finishedAt = clock()
    room.deadline = null
    room.message = room.winnerTeam === 'landlord' ? '地主获胜，本局结束' : '两位农民共同获胜，本局结束'
    for (const seatedId of room.playerIds) {
      if (room.left[seatedId] && players.get(seatedId)?.roomId === room.id) players.get(seatedId).roomId = null
    }
  }

  function play(room, playerId, cardIds) {
    requireThat(room.phase === 'playing', 'CONFLICT', '当前不在出牌阶段')
    requireThat(room.playerIds[room.turn] === playerId, 'FORBIDDEN', '还没有轮到你出牌')
    requireThat(Array.isArray(cardIds) && cardIds.length > 0 && cardIds.length <= 20 &&
      cardIds.every((value) => typeof value === 'string') && new Set(cardIds).size === cardIds.length,
    'INVALID_ARGUMENT', '请选择不重复的有效手牌')
    const hand = room.hands[playerId]
    const cards = cardIds.map((cardId) => hand.find((card) => card.id === cardId))
    requireThat(cards.every(Boolean), 'FORBIDDEN', '只能打出你手里的牌')
    const value = identifyPlay(cards, room.lastPlay?.pattern)
    requireThat(value, 'INVALID_ARGUMENT', room.lastPlay ? '牌型不符或不能压过上一手' : '这些牌不能组成有效牌型')
    room.hands[playerId] = hand.filter((card) => !cardIds.includes(card.id))
    room.lastPlay = { playerId, cards: sortCards(cards), pattern: value }
    room.lastActions[playerId] = { type: 'play', cards: sortCards(cards) }
    room.passCount = 0
    room.message = `${players.get(playerId).nickname}出了${cards.length}张牌`
    if (!room.hands[playerId].length) finish(room, playerId)
    else {
      room.turn = (room.turn + 1) % 3
      schedule(room)
    }
    room.revision++
  }

  function pass(room, playerId) {
    requireThat(room.phase === 'playing', 'CONFLICT', '当前不在出牌阶段')
    requireThat(room.playerIds[room.turn] === playerId, 'FORBIDDEN', '还没有轮到你出牌')
    requireThat(room.lastPlay && room.lastPlay.playerId !== playerId, 'INVALID_ARGUMENT', '轮到你领出，不能不要')
    room.lastActions[playerId] = { type: 'pass' }
    room.passCount++
    room.message = `${players.get(playerId).nickname}不要`
    if (room.passCount === 2) {
      room.turn = room.playerIds.indexOf(room.lastPlay.playerId)
      room.lastPlay = null
      room.passCount = 0
      room.message = '两位牌友都不要，重新领出'
    } else room.turn = (room.turn + 1) % 3
    room.revision++
    schedule(room)
  }

  function removeRoom(room) {
    rooms.delete(room.id)
    for (const playerId of room.playerIds) {
      if (players.get(playerId)?.roomId === room.id) players.get(playerId).roomId = null
    }
  }

  function tick() {
    const now = clock()
    for (let index = queue.length - 1; index >= 0; index--) {
      const player = players.get(queue[index])
      if (!player || !online(player, now) || player.roomId) queue.splice(index, 1)
    }
    for (const room of rooms.values()) {
      if (room.phase === 'finished') {
        if (now - room.finishedAt >= finishedMs) removeRoom(room)
        continue
      }
      if (now - room.createdAt >= roomMaxMs) {
        // No invented winner: a room's lifetime expiring abandons it.
        removeRoom(room)
        continue
      }
      for (const playerId of room.playerIds) {
        if (!online(players.get(playerId), now) && !room.auto[playerId]) {
          room.auto[playerId] = true
          room.revision++
          if (room.playerIds[room.turn] === playerId) room.deadline = Math.min(room.deadline, now + autoMs)
        }
      }
      if (now < room.deadline) continue
      const playerId = room.playerIds[room.turn]
      if (!room.auto[playerId]) {
        room.auto[playerId] = true
        room.revision++
      }
      if (room.phase === 'bidding') bid(room, playerId, room.highestBid === 0 ? 1 : 0)
      else {
        const cardIds = findHint(room.hands[playerId], room.lastPlay?.pattern)
        if (cardIds.length) play(room, playerId, cardIds)
        else pass(room, playerId)
      }
    }
    for (const [token, playerId] of sessions) {
      const player = players.get(playerId)
      if (player && !player.roomId && now - player.lastSeen >= sessionMs) {
        sessions.delete(token)
        players.delete(playerId)
        removeQueued(playerId)
      }
    }
  }

  function authenticate(token) {
    const playerId = typeof token === 'string' ? sessions.get(token) : null
    const player = playerId ? players.get(playerId) : null
    requireThat(player && (player.roomId || clock() - player.lastSeen < sessionMs), 'UNAUTHORIZED', '访客会话已失效，请重新坐下')
    player.lastSeen = clock()
    return player
  }

  function getRoom(player, roomId) {
    requireThat(typeof roomId === 'string' && roomId.length <= 100, 'INVALID_ARGUMENT', '缺少有效牌桌编号')
    const room = rooms.get(roomId)
    requireThat(room, 'NOT_FOUND', '牌桌已结束或服务已重启，请回亭子重新匹配')
    requireThat(player.roomId === roomId && room.playerIds.includes(player.id), 'FORBIDDEN', '你不在这张牌桌')
    return room
  }

  function action(player, method, params, mutate) {
    requireThat(typeof params.operationId === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(params.operationId), 'INVALID_ARGUMENT', '操作编号无效')
    const key = params.operationId
    const signature = fingerprint(method, params)
    const previous = player.operations.get(key)
    if (previous) {
      requireThat(previous.signature === signature, 'CONFLICT', '同一操作编号不能用于不同操作')
      return clone(previous.result)
    }
    const result = mutate()
    player.operations.set(key, { signature, result: clone(result) })
    while (player.operations.size > 256) player.operations.delete(player.operations.keys().next().value)
    return result
  }

  function dispatch(method, params = {}, token = '') {
    requireThat(typeof method === 'string' && Object.hasOwn(PARAMETERS, method), 'NOT_IMPLEMENTED', '这个牌局接口尚未开放')
    requireThat(object(params) && Object.keys(params).every((key) => PARAMETERS[method].includes(key)), 'INVALID_ARGUMENT', '请求包含无效参数')
    if (method === 'session.open') {
      tick()
      let player
      if (token) player = authenticate(token)
      else {
        requireThat(typeof params.nickname === 'string', 'INVALID_ARGUMENT', '请填写1到12字的昵称')
        const nickname = params.nickname.trim()
        requireThat([...nickname].length >= 1 && [...nickname].length <= 12 && !/[\u0000-\u001f\u007f]/u.test(nickname), 'INVALID_ARGUMENT', '请填写1到12字的昵称')
        requireThat(players.size < maxSessions, 'SERVICE_UNAVAILABLE', '亭子暂时坐满了，请稍后再来')
        token = randomBytes(32).toString('base64url')
        player = { id: id('player'), nickname, lastSeen: clock(), roomId: null, operations: new Map() }
        players.set(player.id, player)
        sessions.set(token, player.id)
      }
      return { token, playerId: player.id, nickname: player.nickname }
    }
    const player = authenticate(token)
    tick()
    if (method === 'landlord.getLobby') return lobby(player)
    if (method === 'landlord.joinQueue' || method === 'landlord.cancelQueue') {
      return action(player, method, params, () => {
        if (!player.roomId) {
          removeQueued(player.id)
          if (method === 'landlord.joinQueue') queue.push(player.id)
        }
        match()
        return lobby(player)
      })
    }
    if (method === 'landlord.leave') {
      return action(player, method, params, () => {
        removeQueued(player.id)
        if (player.roomId) {
          const room = getRoom(player, params.roomId || player.roomId)
          if (room.phase === 'finished') player.roomId = null
          else {
            room.left[player.id] = true
            room.auto[player.id] = true
            room.revision++
            if (room.playerIds[room.turn] === player.id) schedule(room)
          }
        }
        return lobby(player)
      })
    }
    const room = getRoom(player, params.roomId)
    if (method === 'landlord.getRoom') return snapshot(room, player)
    if (method === 'landlord.hint') {
      requireThat(room.phase === 'playing' && room.playerIds[room.turn] === player.id, 'CONFLICT', '轮到你出牌时才能查看提示')
      return { cardIds: findHint(room.hands[player.id], room.lastPlay?.pattern) }
    }
    return action(player, method, params, () => {
      requireThat(Number.isSafeInteger(params.expectedRevision) && params.expectedRevision === room.revision, 'CONFLICT', '牌桌已经更新，请刷新后再操作')
      if (method === 'landlord.bid') bid(room, player.id, params.score)
      else if (method === 'landlord.play') play(room, player.id, params.cardIds)
      else if (method === 'landlord.pass') pass(room, player.id)
      else if (method === 'landlord.setAuto') {
        requireThat(room.phase !== 'finished', 'CONFLICT', '本局已经结束')
        requireThat(typeof params.enabled === 'boolean', 'INVALID_ARGUMENT', '托管状态必须为布尔值')
        room.auto[player.id] = params.enabled
        room.left[player.id] = false
        room.revision++
        if (room.playerIds[room.turn] === player.id) schedule(room)
      }
      return snapshot(room, player)
    })
  }

  return {
    dispatch,
    tick,
    health: () => ({ service: 'campus-landlord', mode: 'lan-guest', persistence: 'memory', rooms: rooms.size })
  }
}
