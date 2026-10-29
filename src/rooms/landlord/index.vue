<template>
  <view class="card-room-page">
    <view class="room-topline">
      <button class="back-link" @tap="askLeavePage">‹ 回广场</button>
      <view class="room-title">歇脚亭 · 斗地主</view>
      <text class="guest-caption">三人休闲局</text>
    </view>

    <view v-if="error" class="connection-note" role="alert">
      <text>{{ error }}</text>
      <button v-if="pendingAction" :disabled="busy" @tap="retryAction">确认刚才的操作</button>
      <button v-else-if="setup.configured" :disabled="busy" @tap="reconnect">重新连接</button>
    </view>

    <view v-if="!room" class="pavilion-lobby">
      <view class="lobby-heading">
        <text class="welcome-line">风吹过亭子，正好坐下一局</text>
        <view class="lobby-title">等两位牌友，一起开桌</view>
        <text class="lobby-caption">一人当地主，两人做搭档。先出完手里的牌就赢。</text>
      </view>
      <view class="empty-table" aria-hidden="true">
        <view class="table-seat chair-left"></view>
        <view class="table-seat chair-right"></view>
        <view class="table-seat chair-self"></view>
        <view class="table-felt"><text>♧</text><text>闲来一局</text></view>
      </view>
      <view v-if="!guest" class="guest-form">
        <text class="input-label">让牌友怎么称呼你？</text>
        <input v-model="nickname" maxlength="12" placeholder="1—12字的昵称" :disabled="busy" @confirm="connect" />
        <button class="main-button" :disabled="busy || !setup.configured || !nickname.trim()" @tap="connect">
          {{ busy ? '正在入座…' : '坐下看看' }}
        </button>
        <text class="small-note">使用独立牌桌访客身份，与校园账号分开。</text>
      </view>
      <view v-else class="lobby-ready">
        <text class="greeting">{{ guest.nickname }}，给你留了个座位。</text>
        <view class="lobby-counts" aria-live="polite">
          <text>{{ connected && lobby ? `在线访客 ${lobby.onlineCount} 人` : '正在连接亭子…' }}</text>
          <text v-if="connected && lobby">等待匹配 {{ lobby.queueCount }} 人</text>
        </view>
        <view v-if="lobby?.matchStatus === 'queued'" class="queue-note">
          <view class="queue-title">正在等同一时间来玩的牌友</view>
          <text>凑齐三位就开桌。没有机器人填位，可以随时取消。</text>
        </view>
        <button v-if="lobby?.matchStatus === 'queued'" class="soft-button" :disabled="busy || Boolean(pendingAction)" @tap="submit('cancelQueue')">取消匹配</button>
        <button v-else class="main-button" :disabled="busy || !connected || Boolean(pendingAction)" @tap="submit('joinQueue')">开始三人匹配</button>
      </view>
      <text v-if="notice" class="action-notice" role="status">{{ notice }}</text>
      <view class="lobby-rules">
        <text>叫分选地主 → 轮流出牌 → 地主或农民获胜</text>
        <text>每回合有时限；超时或离开会明确切为托管，可回来接手。</text>
        <text>休闲牌局，不下注，也不扣珍珠和装扮。</text>
      </view>
      <text v-if="!setup.configured" class="unconfigured-note">这里尚未连接牌桌服务。请从主机提供的局域网链接进入，才能和同一 Wi-Fi 下的牌友匹配。</text>
    </view>

    <view v-else class="game-layout">
      <view class="table-meta">
        <text>{{ phaseText }}</text>
        <text v-if="room.phase !== 'finished'" class="turn-clock">{{ currentName }} · {{ remaining }}秒</text>
        <text v-else>这局已结束</text>
      </view>
      <view class="opponents">
        <view v-for="seat in opponents" :key="seat.playerId" class="player-seat" :class="{ 'is-turn': room.currentPlayerId === seat.playerId }">
          <view class="seat-heading"><text class="seat-avatar">{{ seat.nickname.slice(0, 1) }}</text><text class="player-name">{{ seat.nickname }}</text><text class="role-label">{{ roleName(seat.role) }}</text></view>
          <view class="seat-status"><text>剩 {{ seat.handCount }} 张</text><text v-if="seat.auto" class="auto-label">托管中</text><text v-else-if="!seat.connected">暂时离线</text></view>
          <view class="player-action">
            <text v-if="seat.lastAction?.type === 'pass'">不要</text>
            <text v-else-if="seat.lastAction?.type === 'bid'">{{ seat.lastAction.score ? `叫 ${seat.lastAction.score} 分` : '不叫' }}</text>
            <view v-else-if="seat.lastAction?.type === 'play'" class="played-cards">
              <text v-for="card in seat.lastAction.cards" :key="card.id" class="mini-card" :class="{ red: isRed(card) }">{{ card.label }}{{ suitIcon(card) }}</text>
            </view>
            <text v-else>已入座</text>
          </view>
        </view>
      </view>
      <view class="playing-table">
        <view class="bottom-cards">
          <text class="bottom-label">底牌</text>
          <template v-if="room.bottomCards?.length"><text v-for="card in room.bottomCards" :key="card.id" class="mini-card" :class="{ red: isRed(card) }">{{ card.label }}{{ suitIcon(card) }}</text></template>
          <template v-else><text v-for="number in 3" :key="number" class="card-back">✦</text></template>
        </view>
        <view v-if="room.phase === 'bidding'" class="table-announcement">
          <view>好牌到手，谁来当地主？</view>
          <text>{{ room.highestBid ? `当前最高 ${room.highestBid} 分` : '按顺序叫分，最高分当地主' }}</text>
        </view>
        <view v-else-if="room.phase === 'finished'" class="table-announcement result-note">
          <text class="result-symbol">{{ iWon ? '✦' : '♧' }}</text>
          <view>{{ iWon ? '这局赢啦！' : '好牌友，下局再来' }}</view>
          <text>{{ room.winnerTeam === 'landlord' ? '地主先出完了手牌' : '农民搭档赢得了这局' }}</text>
          <button class="main-button" :disabled="busy || Boolean(pendingAction)" @tap="submit('leave')">回亭子再匹配</button>
        </view>
        <view v-else class="table-announcement">
          <view>{{ isMyTurn ? (canPass ? '轮到你，选一手压过它' : '轮到你领出一手牌') : `${currentName}正在想一想` }}</view>
          <view v-if="room.lastPlay" class="last-play"><text class="last-play-name">{{ nameOf(room.lastPlay.playerId) }}出牌</text><view class="played-cards"><text v-for="card in room.lastPlay.cards" :key="card.id" class="mini-card" :class="{ red: isRed(card) }">{{ card.label }}{{ suitIcon(card) }}</text></view></view>
          <text v-else>点选手牌，再点“出牌”。</text>
        </view>
      </view>
      <view class="self-area">
        <view class="self-heading">
          <view><text class="self-name">{{ guest.nickname }}</text><text class="role-label">{{ roleName(selfSeat?.role) }}</text><text v-if="selfSeat?.auto" class="auto-label">托管中</text></view>
          <button v-if="room.phase !== 'finished'" class="auto-button" :disabled="busy || Boolean(pendingAction) || !connected" @tap="submit('setAuto', { enabled: !selfSeat?.auto })">{{ selfSeat?.auto ? '我来接手' : '交给托管' }}</button>
        </view>
        <view v-if="room.phase === 'bidding'" class="turn-actions">
          <button class="soft-button" :disabled="!canAct" @tap="submit('bid', { score: 0 })">不叫</button>
          <button v-for="score in [1, 2, 3]" :key="score" class="main-button bid-button" :disabled="!canAct || score <= room.highestBid" @tap="submit('bid', { score })">{{ score }}分</button>
        </view>
        <view v-else-if="room.phase === 'playing'" class="turn-actions">
          <button class="soft-button" :disabled="!canAct || !canPass" @tap="submit('pass')">不要</button>
          <button class="soft-button" :disabled="!canAct" @tap="showHint">提示</button>
          <button class="soft-button clear-button" :disabled="!selected.length || busy" @tap="selected = []">清选</button>
          <button class="main-button play-button" :disabled="!canAct || !selected.length" @tap="submit('play', { cardIds: [...selected] })">出牌{{ selected.length ? ` ${selected.length} 张` : '' }}</button>
        </view>
        <text v-if="notice" class="action-notice" role="status">{{ notice }}</text>
        <view class="hand-caption"><text>我的手牌 · {{ room.hand.length }} 张</text><text>{{ selfSeat?.auto ? '托管会替你操作，可点击“我来接手”' : '点一下选中，再点一下放回' }}</text></view>
        <view class="hand-grid" :style="{ gridTemplateColumns: `repeat(${handColumns}, minmax(0, 1fr))`, maxWidth: `${handColumns * 80}px` }">
          <button v-for="card in room.hand" :key="card.id" class="hand-card" :class="{ red: isRed(card), selected: selected.includes(card.id), joker: card.rank > 15 }" :aria-label="`${card.label}${suitIcon(card)}${selected.includes(card.id) ? '，已选中' : ''}`" :aria-pressed="selected.includes(card.id)" :disabled="busy || room.phase !== 'playing' || selfSeat?.auto" @tap="toggleCard(card.id)">
            <text class="card-rank">{{ card.label }}</text><text class="card-suit">{{ suitIcon(card) }}</text>
          </button>
        </view>
      </view>
      <text class="table-footnote">牌局由同一主机实时处理；断线后重新连接可回到本桌。休闲局无货币输赢。</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow, onHide, onUnload, onBackPress } from '@dcloudio/uni-app'
import * as landlord from '../../services/landlord.js'
import { errorText } from '../../utils/errors.js'

const setup = landlord.getSetup()
const nickname = ref(''), guest = ref(null), lobby = ref(null), room = ref(null)
const selected = ref([]), error = ref(''), notice = ref(''), busy = ref(false), connected = ref(false)
const pendingAction = ref(null), clock = ref(Date.now()), serverOffset = ref(0)
let active = false, destroyed = false, epoch = 0, timer = null, readingEpoch = null, sequence = 0, stateVersion = 0
let allowBack = false, exitAfterLeave = false
const selfSeat = computed(() => room.value?.seats.find((seat) => seat.playerId === guest.value?.playerId))
const opponents = computed(() => room.value?.seats.filter((seat) => seat.playerId !== guest.value?.playerId) || [])
const isMyTurn = computed(() => Boolean(room.value && room.value.currentPlayerId === guest.value?.playerId))
const canAct = computed(() => connected.value && isMyTurn.value && !busy.value && !pendingAction.value && !selfSeat.value?.auto)
const canPass = computed(() => Boolean(room.value?.lastPlay && room.value.lastPlay.playerId !== guest.value?.playerId))
const currentName = computed(() => nameOf(room.value?.currentPlayerId))
const remaining = computed(() => Math.max(0, Math.ceil(((room.value?.deadline || 0) - clock.value - serverOffset.value) / 1000)))
const phaseText = computed(() => room.value?.phase === 'bidding' ? '叫分选地主' : room.value?.phase === 'playing' ? '牌局进行中' : '一局结束')
const handColumns = computed(() => {
  const count = room.value?.hand.length || 1
  return count > 10 ? Math.ceil(count / 2) : count
})
const iWon = computed(() => Boolean(room.value?.winnerIds?.includes(guest.value?.playerId)))
function nameOf(id) { return room.value?.seats.find((seat) => seat.playerId === id)?.nickname || '牌友' }
function roleName(role) { return role === 'landlord' ? '地主' : role === 'farmer' ? '农民' : '待叫分' }
function isRed(card) { return card.suit === 'hearts' || card.suit === 'diamonds' || card.rank === 17 }
function suitIcon(card) { return ({ spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦', joker: '✦' })[card.suit] || '' }
function operationId() { return `table-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 10)}` }
function valid(scope, playerId = guest.value?.playerId) { return active && !destroyed && scope === epoch && guest.value?.playerId === playerId }
function clearTimer() { if (timer !== null) clearTimeout(timer); timer = null }
function schedule() {
  clearTimer()
  if (active && !destroyed && guest.value) timer = setTimeout(async () => {
    clock.value = Date.now()
    await refresh()
    schedule()
  }, 1000)
}
function failure(cause) {
  error.value = errorText(cause)
  if (cause?.code === 'UNAUTHORIZED') {
    landlord.clearSession(); guest.value = null; lobby.value = null; room.value = null
    pendingAction.value = null; clearTimer(); error.value = '访客会话已失效，请重新入座。'
  }
  if (cause?.code === 'SERVICE_UNAVAILABLE' || cause?.code === 'UNAUTHORIZED') connected.value = false
}
function acceptRoom(value, scope, playerId, version = stateVersion) {
  if (!valid(scope, playerId) || version !== stateVersion || value.selfId !== playerId) return
  if (room.value?.roomId === value.roomId && value.revision < room.value.revision) return
  room.value = value
  selected.value = selected.value.filter((id) => value.hand.some((card) => card.id === id))
  serverOffset.value = value.serverTime - Date.now()
  clock.value = Date.now()
  connected.value = true
}
async function acceptLobby(value, scope, playerId, version = stateVersion) {
  if (!valid(scope, playerId) || version !== stateVersion) return
  lobby.value = value; connected.value = true
  if (value.roomId) {
    const snapshot = await landlord.getRoom({ roomId: value.roomId })
    acceptRoom(snapshot, scope, playerId, version)
  }
}
async function refresh() {
  if (!active || !guest.value || readingEpoch === epoch) return
  const scope = epoch, playerId = guest.value.playerId, version = stateVersion, requestedRoomId = room.value?.roomId
  readingEpoch = scope
  try {
    if (room.value) acceptRoom(await landlord.getRoom({ roomId: room.value.roomId }), scope, playerId, version)
    else await acceptLobby(await landlord.getLobby(), scope, playerId, version)
    if (valid(scope, playerId) && version === stateVersion && !pendingAction.value) error.value = ''
  } catch (cause) {
    if (!valid(scope, playerId) || version !== stateVersion) return
    if (cause?.code === 'NOT_FOUND' && requestedRoomId) {
      try {
        const latest = await landlord.getLobby()
        if (!valid(scope, playerId) || version !== stateVersion) return
        if (latest.roomId !== requestedRoomId) { room.value = null; selected.value = [] }
        await acceptLobby(latest, scope, playerId, version)
        if (valid(scope, playerId) && version === stateVersion) {
          error.value = ''; notice.value = '上一张牌桌已经收起，可以在亭子里重新匹配。'
        }
      } catch (nextCause) { if (valid(scope, playerId) && version === stateVersion) failure(nextCause) }
    } else failure(cause)
  }
  finally { if (readingEpoch === scope) readingEpoch = null }
}
async function connect() {
  const name = nickname.value.trim()
  if (busy.value || !name || !setup.configured) return
  busy.value = true; error.value = ''
  const scope = epoch
  try {
    const value = await landlord.openSession({ nickname: name })
    if (!active || destroyed || scope !== epoch) return
    guest.value = value; nickname.value = value.nickname
    await refresh(); schedule()
  } catch (cause) { if (active && scope === epoch) failure(cause) }
  finally { if (scope === epoch) busy.value = false }
}
async function reconnect() {
  if (busy.value) return
  if (!guest.value) return connect()
  await refresh(); schedule()
}
async function submit(kind, data = {}) {
  if (busy.value || pendingAction.value || !guest.value) return
  const params = { ...data, operationId: operationId() }
  if (room.value) {
    params.roomId = room.value.roomId
    if (kind !== 'leave') params.expectedRevision = room.value.revision
  }
  pendingAction.value = { kind, params }
  await retryAction()
}
async function retryAction() {
  if (busy.value || !pendingAction.value || !guest.value) return
  const action = pendingAction.value, scope = epoch, playerId = guest.value.playerId
  stateVersion++
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const value = await landlord[action.kind](action.params)
    if (!valid(scope, playerId)) return
    const version = ++stateVersion
    pendingAction.value = null
    if (action.kind === 'leave') {
      if (exitAfterLeave) return navigateBack()
      if (!value.roomId) { room.value = null; selected.value = [] }
      await acceptLobby(value, scope, playerId, version)
    } else if (value.roomId && value.phase) acceptRoom(value, scope, playerId, version)
    else await acceptLobby(value, scope, playerId, version)
    if (action.kind === 'play') selected.value = []
    connected.value = true
  } catch (cause) {
    if (!valid(scope, playerId)) return
    if (cause?.code !== 'SERVICE_UNAVAILABLE') pendingAction.value = null
    failure(cause)
    if (pendingAction.value) error.value += ' 刚才的操作结果尚未确认，请点“确认刚才的操作”，不要重复开新操作。'
    else {
      exitAfterLeave = false
      await refresh()
      if (valid(scope, playerId)) { notice.value = errorText(cause); error.value = '' }
    }
  } finally { if (scope === epoch) busy.value = false }
}
async function showHint() {
  if (!canAct.value || !room.value) return
  const scope = epoch, playerId = guest.value.playerId, revision = room.value.revision, roomId = room.value.roomId
  busy.value = true; notice.value = ''
  try {
    const value = await landlord.hint({ roomId })
    if (!valid(scope, playerId) || room.value?.roomId !== roomId || room.value.revision !== revision) return
    selected.value = value.cardIds
    if (!value.cardIds.length) notice.value = '暂时没有能压过的牌，可以选择“不要”。'
  } catch (cause) { if (valid(scope, playerId)) failure(cause) }
  finally { if (scope === epoch) busy.value = false }
}
function toggleCard(id) {
  if (busy.value || room.value?.phase !== 'playing' || selfSeat.value?.auto) return
  selected.value = selected.value.includes(id) ? selected.value.filter((value) => value !== id) : [...selected.value, id]
}
function navigateBack() {
  allowBack = true
  uni.navigateBack({ delta: 1, fail: () => uni.switchTab({ url: '/pages/plaza/index' }) })
}
function askLeavePage() {
  if (busy.value || pendingAction.value) { notice.value = '先确认刚才的操作，再离开牌桌。'; return }
  if (!room.value && lobby.value?.matchStatus !== 'queued') return navigateBack()
  uni.showModal({
    title: room.value?.phase !== 'finished' && room.value ? '离开后交给托管？' : '回广场吗？',
    content: room.value?.phase !== 'finished' && room.value ? '这局会由托管继续。重新进入亭子还可以回到本桌接手。' : '会先退出这次匹配或已结束的牌桌。',
    confirmText: '回广场', cancelText: '继续玩',
    success: (result) => {
      if (!result.confirm || !active) return
      exitAfterLeave = true
      submit('leave')
    }
  })
}
onShow(() => {
  active = true; epoch++; busy.value = false
  if (pendingAction.value) error.value = '刚才的操作结果尚未确认，请点“确认刚才的操作”继续。'
  if (!guest.value) {
    const saved = landlord.getSavedSession()
    if (saved) { guest.value = saved; nickname.value = saved.nickname }
  }
  if (!setup.configured) error.value = '牌桌联机服务尚未配置，暂时不能匹配。'
  else if (guest.value) { refresh(); schedule() }
})
onHide(() => { active = false; epoch++; busy.value = false; clearTimer() })
onUnload(() => {
  active = false; destroyed = true; epoch++; clearTimer()
  if (!allowBack && guest.value && (room.value || lobby.value?.matchStatus === 'queued'))
    landlord.leave({ ...(room.value ? { roomId: room.value.roomId } : {}), operationId: operationId() }).catch(() => {})
})
onBackPress(() => { if (allowBack) return false; askLeavePage(); return true })
</script>

<style scoped>
.card-room-page { box-sizing: border-box; min-height: 100vh; padding: calc(16px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom)); color: #304c3c; background: #e7ecdc; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
.card-room-page button { box-sizing: border-box; line-height: 1.4; margin: 0; font-size: 14px; }
.card-room-page button::after { border: 0; }
.room-topline { max-width: 1000px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.back-link { background: transparent; color: #45634b; padding: 8px 0; min-height: 44px; }
.room-title { font-size: 19px; font-weight: 700; }
.guest-caption { font-size: 12px; color: #677a5f; }
.pavilion-lobby { max-width: 680px; margin: 20px auto 0; padding: 28px 32px; background: #faf5e3; border: 2px solid #b8c4a2; border-radius: 48px 48px 18px 18px; text-align: center; box-shadow: 0 6px 0 #cfdbc0; }
.welcome-line { display: block; color: #718166; font-size: 13px; }
.lobby-title { font-size: 27px; font-weight: 700; margin: 10px 0; }
.lobby-caption { font-size: 13px; line-height: 1.8; color: #6c795f; }
.empty-table { position: relative; width: 220px; height: 200px; margin: 20px auto 8px; }
.table-felt { position: absolute; inset: 24px 26px 38px; border: 11px solid #b8a077; background: #5c8367; border-radius: 50%; box-shadow: 0 8px 0 #8b7959; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #edf3df; font-size: 16px; gap: 4px; }
.table-felt > text:first-child { font-size: 30px; color: #cfdfb8; }
.table-seat { position: absolute; width: 46px; height: 32px; background: #ddcca4; border: 3px solid #aa9871; border-radius: 12px; box-shadow: 0 4px 0 #c3af86; }
.chair-left { left: 0; top: 48px; transform: rotate(-20deg); }
.chair-right { right: 0; top: 48px; transform: rotate(20deg); }
.chair-self { left: 84px; bottom: 12px; }
.guest-form, .lobby-ready { max-width: 400px; margin: 0 auto; }
.input-label { display: block; text-align: left; font-size: 13px; margin-bottom: 8px; }
.guest-form input { box-sizing: border-box; background: #fffdf5; border: 1px solid #bdc9ac; border-radius: 10px; height: 48px; padding: 10px 14px; text-align: left; font-size: 16px; margin-bottom: 12px; }
.main-button, .soft-button { min-height: 44px; padding: 11px 18px; border-radius: 10px; }
.main-button { background: #456f52; color: #fffced; box-shadow: 0 3px 0 #2d5238; }
.soft-button { background: #e8e9d4; color: #405c43; border: 1px solid #bcc8a6; }
.main-button[disabled], .soft-button[disabled], .auto-button[disabled] { background: #dce1d3; color: #8b9885; box-shadow: none; }
.small-note { display: block; font-size: 11px; line-height: 1.8; color: #7b866d; margin-top: 12px; }
.greeting { display: block; font-size: 18px; font-weight: 600; }
.lobby-counts { display: flex; justify-content: center; gap: 20px; font-size: 13px; color: #58724f; margin: 14px 0 18px; }
.queue-note { padding: 14px; margin-bottom: 14px; background: #e5ecd7; border-radius: 10px; font-size: 12px; line-height: 1.8; color: #6b785e; }
.queue-title { font-size: 15px; font-weight: 600; color: #395d41; margin-bottom: 4px; }
.lobby-rules { margin-top: 26px; padding-top: 16px; border-top: 1px dashed #cdd2b7; display: flex; flex-direction: column; gap: 7px; font-size: 12px; color: #748267; line-height: 1.6; }
.unconfigured-note { display: block; padding-top: 14px; font-size: 13px; line-height: 1.8; color: #8b684b; }
.connection-note { box-sizing: border-box; max-width: 1000px; margin: 0 auto 14px; background: #fff4d7; border: 1px solid #d2b989; padding: 12px 14px; border-radius: 8px; display: flex; align-items: center; gap: 12px; font-size: 13px; line-height: 1.7; }
.connection-note > text { flex: 1; min-width: 0; }
.connection-note button { background: #dfcda5; color: #5b4934; min-width: 80px; padding: 8px; flex-shrink: 0; border-radius: 7px; }
.game-layout { max-width: 1000px; margin: 0 auto; }
.table-meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 0 4px 12px; font-size: 14px; }
.turn-clock { color: #607748; }
.opponents { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
.player-seat { min-width: 0; padding: 12px 14px; background: #f5f1df; border: 2px solid transparent; border-radius: 16px 16px 7px 7px; }
.player-seat.is-turn { border-color: #829b60; background: #fcf7de; }
.seat-heading { display: flex; align-items: center; gap: 8px; }
.seat-avatar { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: #d5dfbe; color: #4b6b40; font-size: 16px; }
.player-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 600; }
.role-label { flex-shrink: 0; display: inline-block; background: #e0dbc0; color: #716745; border-radius: 4px; padding: 3px 6px; font-size: 11px; margin-left: 4px; }
.seat-status { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 8px 0; color: #6a785c; font-size: 12px; }
.auto-label { font-size: 11px; background: #dfe8d0; border-radius: 4px; padding: 2px 5px; color: #5e7649; }
.player-action { min-height: 31px; color: #6d7d60; font-size: 12px; line-height: 1.6; }
.played-cards { display: flex; justify-content: center; flex-wrap: wrap; gap: 3px; }
.player-action .played-cards { justify-content: flex-start; }
.mini-card { display: inline-flex; align-items: center; justify-content: center; background: #fffbed; border: 1px solid #d4c8a6; border-radius: 4px; color: #35443c; padding: 3px 4px; font-size: 13px; min-width: 18px; line-height: 1.3; }
.red { color: #b65f55 !important; }
.playing-table { box-sizing: border-box; min-height: 230px; padding: 18px 22px 24px; border: 10px solid #b8a37a; border-radius: 45px; box-shadow: 0 5px 0 #938160; margin: 12px 0 20px; background: #567e63; color: #f6f4df; display: flex; flex-direction: column; align-items: center; }
.bottom-cards { display: flex; align-items: center; gap: 5px; min-height: 32px; }
.bottom-label { font-size: 11px; color: #d2dfc1; margin-right: 4px; }
.card-back { background: #44664f; color: #b0c79a; border: 1px solid #8ca47c; padding: 3px 7px; border-radius: 4px; font-size: 14px; }
.table-announcement { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 14px; font-size: 20px; line-height: 1.6; width: 100%; padding: 16px 0 4px; }
.table-announcement > text { color: #dce5ce; font-size: 13px; }
.last-play { width: 100%; }
.last-play-name { display: block; margin-bottom: 7px; font-size: 11px; color: #d4dec3; }
.result-note { gap: 6px; }
.table-announcement .result-symbol { color: #e6d694; font-size: 32px; line-height: 1; }
.result-note .main-button { margin-top: 10px; background: #e1d8a9; color: #3e5d42; box-shadow: 0 3px 0 #baae7d; font-size: 14px; }
.self-area { background: #f5f2e1; border-radius: 15px; border: 1px solid #cbd3b9; padding: 15px; }
.self-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
.self-name { font-size: 15px; font-weight: 600; }
.auto-button { background: #e3e8d5; color: #536b47; font-size: 12px !important; padding: 7px 10px; border-radius: 7px; min-height: 36px; flex-shrink: 0; }
.turn-actions { display: flex; justify-content: center; gap: 8px; margin-bottom: 15px; }
.turn-actions > button { min-width: 64px; }
.turn-actions .play-button { min-width: 115px; }
.action-notice { display: block; font-size: 12px; color: #8c6d48; margin: 8px 0 12px; line-height: 1.6; }
.hand-caption { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: #7c866e; margin: 6px 0 12px; }
.hand-grid { display: grid; gap: 8px 6px; padding-top: 6px; width: 100%; margin: 0 auto; }
.hand-card { position: relative; min-width: 0; width: 100%; height: 82px; padding: 6px 4px !important; border: 1px solid #cfc3a1; border-bottom: 3px solid #c8ba96; border-radius: 6px; background: #fffdf3; color: #34473c; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; text-align: left; box-shadow: 0 2px 2px #e0dac1; }
.hand-card.selected { transform: translateY(-6px); background: #f5e6b3; border-color: #8d9d61; box-shadow: 0 3px 0 #91a175; }
.card-rank { font-size: 24px; font-weight: 600; line-height: 1; }
.card-suit { font-size: 22px; align-self: flex-end; line-height: 1; }
.joker .card-rank { font-size: 15px; writing-mode: vertical-lr; }
.table-footnote { display: block; color: #748368; font-size: 11px; line-height: 1.7; text-align: center; margin-top: 16px; }
@media (max-width: 560px) {
  .card-room-page { padding-left: 12px; padding-right: 12px; padding-top: calc(10px + env(safe-area-inset-top)); }
  .room-topline { gap: 8px; margin-bottom: 12px; }
  .room-title { font-size: 16px; }
  .guest-caption { display: none; }
  .pavilion-lobby { margin-top: 10px; padding: 25px 18px; border-radius: 35px 35px 16px 16px; }
  .lobby-title { font-size: 23px; }
  .empty-table { margin-top: 10px; margin-bottom: 0; }
  .connection-note { flex-direction: column; align-items: stretch; }
  .opponents { gap: 8px; }
  .player-seat { padding: 10px 8px; }
  .seat-heading { gap: 4px; flex-wrap: wrap; }
  .seat-avatar { width: 25px; height: 25px; font-size: 13px; }
  .player-name { max-width: calc(100% - 34px); font-size: 13px; }
  .role-label { font-size: 10px; padding: 2px 4px; }
  .table-meta { font-size: 12px; }
  .playing-table { min-height: 205px; border-width: 7px; border-radius: 30px; padding: 12px 12px 16px; margin-bottom: 15px; }
  .table-announcement { font-size: 17px; }
  .self-area { padding: 11px 8px; }
  .turn-actions { gap: 6px; }
  .turn-actions > button { min-width: 50px; padding: 10px 9px; font-size: 13px; }
  .turn-actions .play-button { min-width: 94px; }
  .hand-caption { font-size: 10px; }
  .hand-caption > text:last-child { text-align: right; max-width: 60%; }
  .hand-grid { gap: 8px 3px; }
  .hand-card { height: 64px; padding: 5px 2px !important; border-radius: 4px; }
  .card-rank { font-size: 20px; }
  .card-suit { font-size: 18px; }
  .joker .card-rank { font-size: 13px; }
}
@media (max-width: 355px) {
  .turn-actions .clear-button { min-width: 41px; }
  .turn-actions .play-button { min-width: 84px; }
  .turn-actions { gap: 4px; }
  .self-heading { align-items: flex-start; }
}
@media (min-width: 700px) and (max-height: 550px) {
  .room-topline { margin-bottom: 6px; }
  .game-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 8px 18px; }
  .table-meta, .table-footnote { grid-column: 1 / -1; margin: 0; }
  .opponents { grid-column: 1; }
  .playing-table { grid-column: 1; margin: 0; min-height: 170px; }
  .self-area { grid-column: 2; grid-row: 2 / span 2; }
  .hand-card { height: 70px; }
  .pavilion-lobby { margin-top: 0; }
}
@media (prefers-reduced-motion: reduce) { .hand-card { transition: none; } }
</style>
