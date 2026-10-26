<template>
  <view class="dive-overlay">
    <view
      class="dive-panel"
      role="dialog"
      aria-modal="true"
      aria-label="泡泡潜水冒险"
      :class="{ 'less-motion': reducedMotion }"
    >
      <view class="dive-header">
        <view>
          <view class="dive-title">泡泡潜水冒险</view>
          <text class="dive-subtitle">带上伙伴，去水下捡一束星光。</text>
        </view>
        <view class="dive-header-actions">
          <button class="shore-button dive-sound-button" :aria-pressed="soundState.effects" aria-label="切换水下音效" @tap="soundscape.toggleEffects()">{{ soundState.effects ? '水声开' : '水声关' }}</button>
          <button class="shore-button" @tap="askClose">{{ gameState?.status === 'playing' ? '离开冒险' : '回岸边' }}</button>
        </view>
      </view>
      <view v-if="error" class="dive-error" role="alert">
        {{ error }}
        <button :disabled="Boolean(busy)" @tap="retryRequest">重试</button>
      </view>
      <view v-if="soundState.message" class="dive-error" role="status">{{ soundState.message }}</view>

      <scroll-view v-if="!gameState" class="level-scroll" scroll-y>
        <view class="dive-intro">
          <view v-if="appearance" class="intro-pet">
            <PetAvatar :appearance="appearance" :wardrobe="equipment" />
          </view>
          <view>
            <view class="intro-title">小小冒险，慢慢探索</view>
            <text>躲开珊瑚，用泡泡推开怪鱼。捡齐珍珠，就能打开出口。</text>
          </view>
        </view>
        <view class="level-list">
          <button
            v-for="level in DIVE_LEVELS"
            :key="level.id"
            class="level-card"
            :class="'level-' + level.id"
            :disabled="
              Boolean(busy) || !progress || level.id > progress.unlockedLevel
            "
            @tap="startLevel(level.id)"
          >
            <view class="level-icon" aria-hidden="true">
              <view></view>
              <view></view>
              <view></view>
            </view>
            <view class="level-copy">
              <view class="level-name">{{ level.name }}</view>
              <view class="level-target">
                {{ level.requiredPearls }} 颗珍珠 ·
                {{ level.oxygenSeconds }} 秒氧气
              </view>
              <view class="level-prize">
                {{
                  progress?.clearedLevels.includes(level.id)
                    ? '已通关 · 重游 ' + replayPearls[level.id] + ' 珍珠'
                    : firstPrizes[level.id]
                }}
              </view>
            </view>
            <text class="level-state">
              {{
                !progress
                  ? '读取中'
                  : level.id > progress.unlockedLevel
                    ? '待解锁'
                    : busy === 'start' && selectedLevel === level.id
                      ? '准备中'
                      : '出发'
              }}
            </text>
          </button>
        </view>
        <view class="adventure-rules">
          每关3颗爱心。缺氧先扣1心，之后每5秒再扣1心；还有机会返航。每颗珍珠是1枚待带回收获，静止长按返航2秒可收好它们；生命归零只丢本局收获，已有珍珠与装扮保留。真正通关另得首通礼物或重游奖金。
        </view>
      </scroll-view>

      <template v-else>
        <view class="dive-hud">
          <view
            class="heart-group"
            :aria-label="gameState.player.hearts + '颗爱心'"
          >
            <text
              v-for="heart in [1, 2, 3]"
              :key="heart"
              :class="{ empty: heart > gameState.player.hearts }"
            >
              ♥
            </text>
          </view>
          <view class="oxygen-group">
            <text v-if="gameState.oxygenTicks > 0">氧气 {{ Math.ceil(gameState.oxygenTicks / 20) }}秒</text>
            <text v-else class="hypoxia-warning">缺氧 · {{ Math.ceil((gameState.oxygenDamageTicks || 0) / 20) }}秒后扣心</text>
            <view class="oxygen-track">
              <view :style="{ width: oxygenPercent + '%' }"></view>
            </view>
          </view>
          <view class="pearl-count">
            待带回 {{ gameState.pearlsCollected }} 珍珠
            <text>出口目标 {{ gameState.pearlsCollected }}/{{ gameState.requiredPearls }}</text>
          </view>
          <button
            class="pause-button"
            :disabled="Boolean(busy) || gameState.status !== 'playing'"
            @tap="togglePause"
          >
            {{ paused ? '继续' : '暂停' }}
          </button>
        </view>
        <view class="play-layout">
          <view class="board-wrap">
            <view
              class="dive-water"
              :class="'depth-' + gameState.levelId"
              :style="{ width: boardWidth + 'px' }"
              @touchstart.stop.prevent="beginDrag"
              @touchmove.stop.prevent="dragSwim"
              @touchend.stop.prevent="endDrag"
              @touchcancel.stop.prevent="endDrag"
              @mousedown.prevent="beginMouseDrag"
              @mousemove="mouseDrag"
              @mouseup="endDrag"
              @mouseleave="endDrag"
            >
              <view class="water-ratio">
                <view class="water-light light-one"></view>
                <view class="water-light light-two"></view>
                <view class="seaweed weed-one">
                  <view></view>
                  <view></view>
                  <view></view>
                </view>
                <view class="seaweed weed-two">
                  <view></view>
                  <view></view>
                  <view></view>
                </view>
                <view
                  v-for="wall in gameState.obstacles"
                  :key="wall.id"
                  class="dive-coral"
                  :data-id="wall.id"
                  :style="wallStyle(wall)"
                >
                  <view></view>
                  <view></view>
                </view>
                <view
                  v-for="pearl in gameState.pearls.filter(
                    (item) => !item.collected
                  )"
                  :key="pearl.id"
                  class="dive-pearl"
                  :data-id="pearl.id"
                  :style="entityStyle(pearl, 3.4)"
                >
                  <view></view>
                </view>
                <view
                  class="dive-exit"
                  :class="{
                    'is-open':
                      gameState.pearlsCollected === gameState.requiredPearls
                  }"
                  :style="entityStyle(gameState.exit, 10)"
                >
                  <view></view>
                  <text>出口</text>
                </view>
                <view
                  v-for="enemy in gameState.enemies"
                  :key="enemy.id"
                  class="dive-enemy"
                  :class="[
                    'enemy-' + enemy.type,
                    { 'is-stunned': enemy.stunnedTicks > 0 }
                  ]"
                  :data-id="enemy.id"
                  :style="entityStyle(enemy, enemy.radius * 2.2)"
                >
                  <view class="piranha-fin"><view></view><view></view><view></view></view>
                  <view class="enemy-tail"></view>
                  <view class="piranha-scales"><view></view><view></view><view></view></view>
                  <view class="enemy-eye eye-left"></view>
                  <view class="piranha-gill"></view>
                  <view class="enemy-mouth">
                    <view class="piranha-teeth teeth-upper"><view></view><view></view><view></view></view>
                    <view class="piranha-teeth teeth-lower"><view></view><view></view><view></view></view>
                  </view>
                  <view class="piranha-side-fin"></view>
                  <text v-if="enemy.stunnedTicks">○</text>
                </view>
                <view
                  v-for="bubble in gameState.bubbles"
                  :key="bubble.id"
                  class="dive-bubble"
                  :style="entityStyle(bubble, 3)"
                ></view>
                <view
                  class="dive-player"
                  :class="{
                    'is-invulnerable': gameState.player.invulnerableTicks > 0
                  }"
                  :data-x="gameState.player.x"
                  :data-y="gameState.player.y"
                  :style="{
                    left: gameState.player.x + '%',
                    top: (gameState.player.y / 64) * 100 + '%'
                  }"
                >
                  <PetAvatar
                    v-if="appearance"
                    :appearance="appearance"
                    :wardrobe="equipment"
                    :facing="
                      appearance.species === 'custom'
                        ? 1
                        : gameState.player.facing
                    "
                  />
                  <view class="player-air-bubble"></view>
                </view>
                <view
                  v-if="paused && gameState.status === 'playing'"
                  class="water-cover"
                >
                  <view class="pause-caption">在水里歇一会儿</view>
                  <text>氧气暂停消耗，准备好再继续。</text>
                  <button :disabled="Boolean(busy) || !active" @tap="resume">
                    继续探索
                  </button>
                  <button
                    class="quiet-water-button"
                    :disabled="Boolean(busy)"
                    @tap="backToLevels"
                  >
                    选择关卡
                  </button>
                </view>
                <view
                  v-if="gameState.status !== 'playing'"
                  class="water-cover result-cover"
                  role="status"
                  aria-live="polite"
                >
                  <view class="result-symbol">
                    {{ gameState.status === 'cleared' ? '✦' : gameState.status === 'returned' ? '⌂' : '♡' }}
                  </view>
                  <view class="pause-caption">
                    {{
                      gameState.status === 'cleared'
                        ? '找到出口啦！'
                        : gameState.status === 'returned' ? '回到岸边啦' : '本次冒险结束'
                    }}
                  </view>
                  <text>
                    {{
                      gameState.status === 'failed'
                        ? gameState.reason + ' · 本局' + gameState.pearlsCollected + '枚未带回的珍珠遗失，已有余额和装扮保留。'
                        : busy === 'finish'
                          ? '正在收好这次冒险的收获…'
                          : settled?.reward
                            ? '已收好 +' + settled.reward.pearls + ' 珍珠' + (gameState.status === 'returned' ? '，休息后可以再次出发。' : '')
                            : '收获需读取成功后才会保存'
                    }}
                  </text>
                  <view
                    v-if="settled?.reward?.items.length"
                    class="earned-items"
                  >
                    首通礼物：{{ earnedNames }}
                  </view>
                </view>
              </view>
            </view>
          </view>
          <view v-if="gameState.status === 'playing'" class="game-controls">
            <view class="direction-pad" aria-label="按住方向游动">
              <button
                v-for="direction in directions"
                :key="direction.id"
                :class="'direction-' + direction.id"
                :aria-label="direction.label"
                :disabled="!canPlay"
                @touchstart.stop.prevent="pressDirection(direction.id, $event)"
                @touchend.stop.prevent="releaseDirection(direction.id, $event)"
                @touchcancel.stop.prevent="releaseDirection(direction.id, $event)"
                @mousedown.prevent="pressDirection(direction.id)"
                @mouseup="releaseDirection(direction.id)"
                @mouseleave="releaseDirection(direction.id)"
              >
                {{ direction.symbol }}
              </button>
              <view class="pad-center"></view>
            </view>
            <button
              class="bubble-button"
              :disabled="!canPlay"
              @touchstart.stop.prevent="pressFire"
              @touchend.stop.prevent="releaseFire"
              @touchcancel.stop.prevent="releaseFire"
              @mousedown.prevent="pressFire"
              @mouseup="releaseFire"
              @mouseleave="releaseFire"
              @tap="pulseFire"
            >
              <view></view>
              <text>发射泡泡</text>
            </button>
            <button
              class="return-button"
              :class="{ 'is-returning': gameState.returningTicks > 0 }"
              :disabled="!canPlay"
              @touchstart.stop.prevent="pressReturn"
              @touchend.stop.prevent="releaseReturn"
              @touchcancel.stop.prevent="releaseReturn"
              @mousedown.prevent="pressReturn"
              @mouseup="releaseReturn"
              @mouseleave="releaseReturn"
            >
              <text>{{ gameState.returningTicks ? '返航 ' + Math.ceil((40 - gameState.returningTicks) / 20) + '秒' : '长按返航' }}</text>
              <text class="return-note">静止2秒 · 受伤打断</text>
            </button>
          </view>
          <view v-else class="result-actions">
            <button
              class="dive-primary"
              :disabled="Boolean(busy)"
              @tap="startLevel(selectedLevel)"
            >
              再试一次
            </button>
            <button
              v-if="settled?.status === 'cleared' && selectedLevel < 3"
              class="dive-primary"
              :disabled="Boolean(busy)"
              @tap="startLevel(selectedLevel + 1)"
            >
              去下一关
            </button>
            <button
              class="dive-secondary"
              :disabled="Boolean(busy)"
              @tap="backToLevels"
            >
              选择关卡
            </button>
          </view>
        </view>
        <view class="control-hint">
          方向或拖动水面游动，用泡泡推开食人鱼；捡齐珍珠去出口，低血时静止长按返航收好收获。
          <text class="keyboard-hint">方向键 / WASD，空格发泡泡，按住R返航。</text>
        </view>
      </template>
      <view class="dive-footnote">
        {{
          config.apiMode === 'mock'
            ? '本机演示 · 收获只保存在当前演示身份'
            : '奖励由当前账号服务核验后保存'
        }}
      </view>
    </view>
  </view>
</template>

<script setup>
import {
  computed,
  getCurrentInstance,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch
} from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { dive, wardrobe } from '../../services/index.js'
import { soundscape } from '../../services/soundscape.js'
import { config } from '../../config/index.js'
import { errorText } from '../../utils/errors.js'
import { session } from '../../utils/session.js'
import {
  createDiveGame,
  DIVE_LEVELS,
  DIVE_RULES_VERSION,
  DIVE_STEP_MS
} from '../../utils/dive-game.js'
import { WARDROBE_ITEMS } from '../../utils/wardrobe-catalog.js'
import PetAvatar from '../pet/PetAvatar.vue'

const props = defineProps({
  appearance: { type: Object, default: null },
  wardrobe: { type: Object, default: null }
})
const emit = defineEmits(['close', 'reward'])
const instance = getCurrentInstance()
const soundState = soundscape.state
const progress = ref(null),
  gameState = ref(null),
  selectedLevel = ref(1),
  paused = ref(false),
  busy = ref(''),
  error = ref(''),
  active = ref(true),
  settled = ref(null),
  viewport = ref({ width: 390, height: 760 }),
  reducedMotion = ref(false)
const equipment = computed(() => props.wardrobe?.equipped || props.wardrobe)
const canPlay = computed(
  () =>
    active.value &&
    !paused.value &&
    !busy.value &&
    runUserId === session.user?.id &&
    gameState.value?.status === 'playing'
)
const oxygenPercent = computed(() =>
  gameState.value
    ? (gameState.value.oxygenTicks /
        (DIVE_LEVELS[selectedLevel.value - 1].oxygenSeconds * 20)) *
      100
    : 100
)
const boardWidth = computed(() => {
  const { width, height } = viewport.value
  return Math.max(
    180,
    width >= 620 && width > height
      ? Math.min(width - 240, ((height - 176) * 100) / 64, 900)
      : Math.min(width - 32, ((height - 310) * 100) / 64, 700)
  )
})
const prizeLabel = (ids, pearls) =>
  `首通：${ids.map((id) => WARDROBE_ITEMS.find((item) => item.id === id)?.name || id).join('、')} ＋${pearls}珍珠`
const firstPrizes = {
  1: prizeLabel(['sailor-shirt', 'shell-shoes'], 30),
  2: prizeLabel(['cloud-bun', 'shell-pouch'], 45),
  3: prizeLabel(['shell-crown', 'star-wand', 'pearl-badge'], 60)
}
const replayPearls = { 1: 8, 2: 12, 3: 18 }
const earnedNames = computed(() =>
  (settled.value?.reward?.items || [])
    .map(
      (id) =>
        (settled.value.wardrobe?.catalog || WARDROBE_ITEMS).find(
          (item) => item.id === id
        )?.name ||
        id
    )
    .join('、')
)
const directions = [
  { id: 'up', label: '向上游', symbol: '↑' },
  { id: 'left', label: '向左游', symbol: '←' },
  { id: 'right', label: '向右游', symbol: '→' },
  { id: 'down', label: '向下游', symbol: '↓' }
]
let game = null,
  issued = null,
  runUserId = null,
  pendingFinish = null,
  trace = [],
  lastInput = { dx: 0, dy: 0, fire: false },
  clock = null,
  revision = 0,
  mounted = false,
  closed = false,
  heldDirection = '',
  heldFire = false,
  heldReturn = false,
  returnTouchId = null,
  firePulse = 0,
  dragPoint = null,
  dragTouchId = null,
  fireTouchId = null,
  directionTouchId = null,
  boardRect = null,
  mouseHeld = false
let breakReturnOnResume = false
const heldKeys = new Set()
const entityStyle = (point, diameter) => ({
  left: `${point.x}%`,
  top: `${(point.y / 64) * 100}%`,
  width: `${diameter}%`,
  height: `${(diameter / 64) * 100}%`
})
const wallStyle = (wall) => ({
  left: `${wall.x}%`,
  top: `${(wall.y / 64) * 100}%`,
  width: `${wall.width}%`,
  height: `${(wall.height / 64) * 100}%`
})

function stopClock() {
  if (clock !== null) clearInterval(clock)
  clock = null
}
function clearInput() {
  heldKeys.clear()
  heldDirection = ''
  heldFire = false
  heldReturn = false
  returnTouchId = null
  firePulse = 0
  dragPoint = null
  dragTouchId = null
  fireTouchId = null
  directionTouchId = null
  mouseHeld = false
}
function pause() {
  if (gameState.value?.returningTicks > 0) breakReturnOnResume = true
  paused.value = true
  soundscape.setPaused(true)
  stopClock()
  clearInput()
}
async function request(kind, action, apply) {
  if (busy.value || !active.value || closed) return
  const current = ++revision
  const userId = session.user?.id
  const isCurrent = () =>
    current === revision && mounted && !closed && active.value &&
    userId === session.user?.id
  busy.value = kind
  error.value = ''
  try {
    const value = await action()
    if (isCurrent()) return apply(value)
  } catch (failure) {
    if (isCurrent()) error.value = errorText(failure)
  } finally {
    if (current === revision) busy.value = ''
  }
}
function loadProgress() {
  const runId = issued?.id
  const finishing = pendingFinish
  return request(
    'loading',
    async () => {
      // A foreground read must observe the finish that was already in flight.
      // Finishing an unknown result again could only conflict, never grant twice.
      if (finishing && finishing.runId === runId &&
          finishing.userId === session.user?.id)
        await finishing.promise
      const state = await dive.getState()
      const receipt = state.lastSettlement
      let recoveredWardrobe = null
      let wardrobeError = ''
      if (receipt && receipt.runId === runId &&
          receipt.levelId === issued?.levelId && receipt.rulesVersion === issued?.rulesVersion &&
          gameState.value?.status !== 'playing' && !settled.value?.wardrobe) {
        try {
          recoveredWardrobe = await wardrobe.getState()
        } catch (failure) {
          wardrobeError = errorText(failure)
        }
      }
      return { state, recoveredWardrobe, wardrobeError }
    },
    ({ state, recoveredWardrobe, wardrobeError }) => {
      progress.value = state
      if (!issued || issued.id !== runId) return state
      const receipt = state.lastSettlement
      if (receipt && receipt.runId === runId &&
          receipt.levelId === issued.levelId && receipt.rulesVersion === issued.rulesVersion &&
          gameState.value?.status !== 'playing') {
        if (!settled.value) {
          settled.value = { ...receipt, wardrobe: recoveredWardrobe, state }
          if (recoveredWardrobe) emit('reward', recoveredWardrobe)
        } else if (!settled.value.wardrobe && recoveredWardrobe) {
          settled.value = { ...settled.value, wardrobe: recoveredWardrobe, state }
          emit('reward', recoveredWardrobe)
        }
        if (wardrobeError)
          error.value = `收获已保存，衣柜暂时未能刷新：${wardrobeError}`
      } else if (!settled.value && state.activeRun?.id !== runId) {
        resetRun()
        error.value = '这次潜水已结束或过期，请重新出发'
      }
      return state
    }
  )
}
function startLevel(levelId) {
  if (busy.value || !progress.value || levelId > progress.value.unlockedLevel)
    return
  soundscape.unlock()
  pause()
  selectedLevel.value = levelId
  return request(
    'start',
    () => dive.start({ levelId }),
    (run) => {
      if (run.rulesVersion !== DIVE_RULES_VERSION) {
        error.value = '潜水服务规则版本尚未更新，请稍后再试。'
        return
      }
      issued = run
      runUserId = session.user?.id
      game = createDiveGame(levelId, { seed: run.seed })
      gameState.value = game.getState()
      trace = []
      lastInput = { dx: 0, dy: 0, fire: false }
      settled.value = null
      breakReturnOnResume = false
      paused.value = false
      soundscape.setScene('dive')
      nextTick(() => {
        measureBoard()
        startClock()
      })
    }
  )
}
function currentInput() {
  let dx =
    (heldKeys.has('arrowright') ||
    heldKeys.has('d') ||
    heldDirection === 'right'
      ? 1
      : 0) -
    (heldKeys.has('arrowleft') || heldKeys.has('a') || heldDirection === 'left'
      ? 1
      : 0)
  let dy =
    (heldKeys.has('arrowdown') || heldKeys.has('s') || heldDirection === 'down'
      ? 1
      : 0) -
    (heldKeys.has('arrowup') || heldKeys.has('w') || heldDirection === 'up'
      ? 1
      : 0)
  if (dragPoint && gameState.value) {
    dx =
      Math.abs(dragPoint.x - gameState.value.player.x) > 0.7
        ? Math.sign(dragPoint.x - gameState.value.player.x)
        : 0
    dy =
      Math.abs(dragPoint.y - gameState.value.player.y) > 0.7
        ? Math.sign(dragPoint.y - gameState.value.player.y)
        : 0
  }
  const fire = heldFire || heldKeys.has(' ') || firePulse > 0
  if (firePulse > 0) firePulse--
  return heldReturn || heldKeys.has('r') ? { dx, dy, fire, returning: true } : { dx, dy, fire }
}
function startClock() {
  stopClock()
  if (
    !mounted ||
    closed ||
    !active.value ||
    paused.value ||
    !game ||
    gameState.value?.status !== 'playing'
  )
    return
  clock = setInterval(() => {
    if (!canPlay.value) return
    const input = currentInput()
    if (breakReturnOnResume) {
      delete input.returning
      breakReturnOnResume = false
    }
    if (
      input.dx !== lastInput.dx ||
      input.dy !== lastInput.dy ||
      input.fire !== lastInput.fire || Boolean(input.returning) !== Boolean(lastInput.returning)
    )
      trace.push({ tick: gameState.value.tick, ...input })
    lastInput = input
    game.setInput(input)
    const previous = gameState.value
    gameState.value = game.step()
    if (gameState.value.bubbles.some((bubble) => !previous.bubbles.some((old) => old.id === bubble.id))) soundscape.effect('bubble')
    if (gameState.value.pearlsCollected > previous.pearlsCollected) soundscape.effect('pearl')
    if (gameState.value.player.hearts < previous.player.hearts) soundscape.effect('hurt')
    if (gameState.value.status !== 'playing') {
      soundscape.setScene('dive-result')
      stopClock()
      clearInput()
      finishRun()
    }
  }, DIVE_STEP_MS)
}
function finishRun() {
  if (!issued || runUserId !== session.user?.id || !gameState.value ||
      gameState.value.status === 'playing' || settled.value || busy.value)
    return
  if (pendingFinish?.runId === issued.id) return pendingFinish.promise
  const proof = {
    runId: issued.id,
    ticks: gameState.value.tick,
    trace: trace.map((item) => ({ ...item }))
  }
  const finishing = { runId: issued.id, userId: runUserId, promise: null }
  pendingFinish = finishing
  finishing.promise = request(
    'finish',
    () => dive.finish(proof),
    (value) => {
      if (value.rulesVersion !== issued?.rulesVersion)
        throw new Error('结算规则版本不一致，请重新读取本局回执。')
      settled.value = { ...value, runId: proof.runId }
      soundscape.effect(value.status === 'cleared' ? 'clear' : value.status === 'returned' ? 'return' : 'fail')
      progress.value = value.state
      emit('reward', value.wardrobe)
    }
  ).finally(() => {
    if (pendingFinish === finishing) pendingFinish = null
  })
  return finishing.promise
}
async function retryRequest() {
  if (gameState.value?.status && gameState.value.status !== 'playing') {
    const state = await loadProgress()
    if (state?.activeRun?.id === issued?.id && !settled.value &&
        runUserId === session.user?.id) return finishRun()
    return
  }
  return gameState.value ? startLevel(selectedLevel.value) : loadProgress()
}
function resume() {
  if (!active.value || busy.value) return
  if (!issued || Date.now() > issued.expiresAt) {
    error.value = '这次潜水已经过期，请重新出发'
    return
  }
  paused.value = false
  soundscape.unlock()
  soundscape.setScene('dive')
  error.value = ''
  measureBoard()
  startClock()
}
function togglePause() {
  if (!gameState.value || gameState.value.status !== 'playing') return
  paused.value ? resume() : pause()
}
function resetRun() {
  pause()
  game = null
  issued = null
  runUserId = null
  gameState.value = null
  settled.value = null
  soundscape.setScene('dive-menu')
}
function backToLevels() {
  confirmAbandon(() => {
    resetRun()
    error.value = ''
    loadProgress()
  })
}
function close() {
  closed = true
  revision++
  stopClock()
  clearInput()
  soundscape.setScene('plaza')
  emit('close')
}
function askClose() {
  confirmAbandon(close)
}
function confirmAbandon(action) {
  if (!gameState.value || gameState.value.status !== 'playing') return action()
  const wasPaused = paused.value
  pause()
  const current = revision
  uni.showModal({
    title: '放弃本局收获？',
    content: '直接离开不保存本局收获；要带回珍珠，请继续探索后静止长按返航2秒。已有珍珠和装扮保留。',
    confirmText: '放弃并离开',
    cancelText: '继续探索',
    success(result) {
      if (closed || !mounted || current !== revision) return
      if (result.confirm) action()
      else if (!wasPaused && active.value) resume()
    }
  })
}
const isTouchEvent = (event) => Boolean(event?.touches || event?.changedTouches)
const changedTouch = (event) => event?.changedTouches?.[0]
const endedTouch = (event, identifier) =>
  Array.from(event?.changedTouches || []).some(
    (point) => point.identifier === identifier
  )
function pressDirection(direction, event) {
  if (!canPlay.value || directionTouchId !== null) return
  if (isTouchEvent(event))
    directionTouchId = changedTouch(event)?.identifier ?? null
  heldDirection = direction
}
function releaseDirection(direction, event) {
  if (directionTouchId !== null && !endedTouch(event, directionTouchId)) return
  if (heldDirection === direction) heldDirection = ''
  directionTouchId = null
}
function pressFire(event) {
  if (canPlay.value && fireTouchId === null) {
    if (isTouchEvent(event))
      fireTouchId = changedTouch(event)?.identifier ?? null
    heldFire = true
    firePulse = 2
  }
}
function releaseFire(event) {
  if (fireTouchId !== null && !endedTouch(event, fireTouchId)) return
  heldFire = false
  fireTouchId = null
  firePulse = 0
}
function pulseFire() {
  if (canPlay.value) firePulse = 2
}
function pressReturn(event) {
  if (!canPlay.value || returnTouchId !== null) return
  clearInput()
  if (isTouchEvent(event)) returnTouchId = changedTouch(event)?.identifier ?? null
  heldReturn = true
}
function releaseReturn(event) {
  if (returnTouchId !== null && !endedTouch(event, returnTouchId)) return
  heldReturn = false
  returnTouchId = null
}
function measureBoard() {
  if (!mounted || !gameState.value) return
  uni
    .createSelectorQuery()
    .in(instance.proxy)
    .select('.dive-water')
    .boundingClientRect((rect) => {
      if (mounted && rect?.width > 0) boardRect = rect
    })
    .exec()
}
function pointer(point) {
  if (!point) return null
  const x = point.clientX ?? point.pageX,
    y = point.clientY ?? point.pageY
  if (!boardRect || !Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    x: Math.max(
      0,
      Math.min(100, ((x - boardRect.left) / boardRect.width) * 100)
    ),
    y: Math.max(0, Math.min(64, ((y - boardRect.top) / boardRect.height) * 64))
  }
}
function beginDrag(event) {
  if (!canPlay.value || dragTouchId !== null) return
  const point = changedTouch(event)
  if (point?.identifier == null) return
  dragTouchId = point.identifier
  measureBoard()
  dragPoint = pointer(point)
}
function dragSwim(event) {
  if (!canPlay.value || dragTouchId === null) return
  const point = Array.from(event.touches || []).find(
    (item) => item.identifier === dragTouchId
  )
  if (point) dragPoint = pointer(point)
}
function endDrag(event) {
  if (dragTouchId !== null && !endedTouch(event, dragTouchId)) return
  dragPoint = null
  dragTouchId = null
  mouseHeld = false
}
function beginMouseDrag(event) {
  if ((event.button == null || event.button === 0) && canPlay.value) {
    if (dragTouchId !== null) return
    mouseHeld = true
    measureBoard()
    dragPoint = pointer(event)
  }
}
function mouseDrag(event) {
  if (mouseHeld && canPlay.value) dragPoint = pointer(event)
}
function readViewport() {
  const info =
    typeof uni.getWindowInfo === 'function'
      ? uni.getWindowInfo()
      : uni.getSystemInfoSync()
  viewport.value = { width: info.windowWidth, height: info.windowHeight }
  nextTick(measureBoard)
}
// #ifdef H5
function keyDown(event) {
  const key = event.key.toLowerCase()
  if (key === 'escape') {
    event.preventDefault()
    togglePause()
    return
  }
  if (
    !canPlay.value ||
    ![
      'arrowup',
      'arrowdown',
      'arrowleft',
      'arrowright',
      'w',
      'a',
      's',
      'd',
      ' ',
      'r'
    ].includes(key) ||
    /^(INPUT|TEXTAREA)$/.test(event.target?.tagName)
  )
    return
  event.preventDefault()
  heldKeys.add(key)
}
function keyUp(event) {
  heldKeys.delete(event.key.toLowerCase())
}
function blur() {
  if (gameState.value?.status === 'playing') pause()
  clearInput()
}
function visibility() {
  if (globalThis.document.hidden) blur()
}
// #endif
onMounted(() => {
  mounted = true
  readViewport()
  uni.onWindowResize?.(readViewport)
  // #ifdef H5
  reducedMotion.value = Boolean(
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
  globalThis.addEventListener('keydown', keyDown)
  globalThis.addEventListener('keyup', keyUp)
  globalThis.addEventListener('blur', blur)
  globalThis.document.addEventListener('visibilitychange', visibility)
  // #endif
  loadProgress()
})
onHide(() => {
  active.value = false
  revision++
  busy.value = ''
  pause()
})
onShow(() => {
  if (!mounted || closed) return
  active.value = true
  readViewport()
  loadProgress()
})
watch(() => session.user?.id, () => {
  revision++
  busy.value = ''
  pendingFinish = null
  resetRun()
  progress.value = null
  error.value = ''
  if (mounted && active.value && !closed) loadProgress()
})
onUnmounted(() => {
  mounted = false
  closed = true
  revision++
  stopClock()
  clearInput()
  uni.offWindowResize?.(readViewport)
  // #ifdef H5
  globalThis.removeEventListener('keydown', keyDown)
  globalThis.removeEventListener('keyup', keyUp)
  globalThis.removeEventListener('blur', blur)
  globalThis.document.removeEventListener('visibilitychange', visibility)
  // #endif
})
</script>

<style scoped>
.dive-overlay {
  position: fixed;
  inset: 0;
  z-index: 3500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  color: #ebf4dc;
  background: #102e47df;
}
.dive-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  max-width: 1160px;
  max-height: 860px;
  border: 3px solid #78b8b2;
  border-radius: 22px;
  background: #1b4e62;
  overflow: hidden;
  box-shadow: 0 16px 60px #071e3c77;
}
button {
  min-height: 44px;
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
}
button::after {
  border: 0;
}
button[disabled] {
  opacity: 0.5;
}
button:focus-visible {
  outline: 3px solid #ffe7ad;
  outline-offset: 3px;
}
.dive-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px 10px;
  flex-shrink: 0;
}
.dive-header > view:first-child { flex: 1; min-width: 0; }
.dive-header-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.dive-sound-button { padding: 8px; font-size: 12px; }
.dive-title {
  font-size: 23px;
  font-weight: 700;
}
.dive-subtitle {
  display: block;
  font-size: 12px;
  line-height: 1.6;
  margin-top: 4px;
  color: #b8d9cc;
}
.shore-button {
  color: #e4f1d9;
  background: #366b77;
  padding: 10px 14px;
  border-radius: 22px;
  flex-shrink: 0;
}
.level-scroll {
  height: 0;
  flex: 1;
  min-height: 0;
}
.dive-intro {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 20px;
  background: #215d6d;
}
.intro-pet {
  width: 85px;
  height: 95px;
  flex-shrink: 0;
}
.intro-title {
  font-size: 18px;
  font-weight: 650;
  margin-bottom: 8px;
}
.dive-intro text {
  display: block;
  max-width: 330px;
  font-size: 13px;
  line-height: 1.8;
  color: #beddd0;
}
.level-list {
  display: flex;
  gap: 14px;
  padding: 24px 20px;
}
.level-card {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 24px 12px 18px;
  color: #ecf6df;
  background: #2c6c76;
  border: 1px solid #58918e;
  border-radius: 16px;
  text-align: center;
}
.level-2 {
  background: #38687a;
}
.level-3 {
  background: #4b6280;
}
.level-name {
  font-size: 19px;
  font-weight: 650;
}
.level-target {
  font-size: 12px;
  color: #bcdace;
  margin: 6px 0;
}
.level-prize {
  font-size: 11px;
  line-height: 1.8;
  color: #ecdfb8;
}
.level-state {
  padding: 7px 24px;
  border-radius: 20px;
  color: #284c57;
  background: #d9e8c6;
  font-size: 13px;
}
.level-icon {
  position: relative;
  width: 64px;
  height: 52px;
  border-radius: 50%;
  background: #22576b;
}
.level-icon view {
  position: absolute;
  bottom: 10px;
  width: 9px;
  height: 27px;
  border-radius: 10px 10px 3px 3px;
  background: #a7c9a1;
  transform: rotate(-18deg);
}
.level-icon view:first-child {
  left: 14px;
}
.level-icon view:nth-child(2) {
  left: 29px;
  height: 38px;
  transform: rotate(9deg);
  background: #c5d5ac;
}
.level-icon view:nth-child(3) {
  right: 13px;
  height: 23px;
  transform: rotate(22deg);
}
.level-2 .level-icon view {
  background: #d6a4a0;
}
.level-3 .level-icon view {
  background: #abafe0;
}
.adventure-rules {
  max-width: 640px;
  margin: 0 auto;
  padding: 0 20px 20px;
  color: #b9d5cd;
  font-size: 12px;
  line-height: 1.9;
  text-align: center;
}
.dive-footnote {
  flex-shrink: 0;
  text-align: center;
  padding: 8px 12px 11px;
  color: #a3c7c1;
  font-size: 10px;
  line-height: 1.6;
}
.dive-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 16px 8px;
  padding: 7px 12px;
  border: 1px solid #d3a99b;
  border-radius: 10px;
  color: #ffe1cb;
  background: #685c65;
  font-size: 12px;
  line-height: 1.7;
  flex-shrink: 0;
}
.dive-error button {
  flex-shrink: 0;
  padding: 8px 12px;
  color: #fff2d5;
  background: #8b7372;
}
.dive-hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 20px 10px;
  flex-shrink: 0;
}
.heart-group {
  display: flex;
  gap: 3px;
  font-size: 22px;
  color: #f2b6ae;
}
.heart-group .empty {
  color: #668d93;
}
.oxygen-group {
  flex: 1;
  max-width: 200px;
  font-size: 11px;
  color: #c6e3d7;
}
.oxygen-track {
  height: 5px;
  margin-top: 4px;
  border-radius: 3px;
  background: #346d7b;
  overflow: hidden;
}
.oxygen-track view {
  height: 100%;
  background: #c1dec0;
}
.pearl-count {
  font-size: 12px;
  white-space: nowrap;
}
.pause-button {
  min-width: 52px;
  padding: 8px;
  border-radius: 10px;
  color: #deecd6;
  background: #366c79;
}
.play-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex: 1;
  min-height: 0;
  padding: 0 14px;
}
.board-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
}
.dive-water {
  position: relative;
  max-width: 100%;
  border: 3px solid #88bdb5;
  border-radius: 18px;
  overflow: hidden;
  background: #367e92;
  box-shadow: inset 0 -20px 0 #2b7185;
  touch-action: none;
  user-select: none;
}
.depth-2 {
  background: #326c89;
}
.depth-3 {
  background: #354e7c;
}
.water-ratio {
  position: relative;
  height: 0;
  padding-bottom: 64%;
}
.water-light {
  position: absolute;
  top: -10%;
  width: 12%;
  height: 100%;
  transform: rotate(20deg);
  background: #d0e7ce0c;
  pointer-events: none;
}
.light-one {
  left: 15%;
}
.light-two {
  left: 62%;
  width: 22%;
}
.seaweed {
  position: absolute;
  bottom: 0;
  width: 12%;
  height: 22%;
  pointer-events: none;
}
.weed-one {
  left: 6%;
}
.weed-two {
  right: 9%;
  height: 16%;
  transform: scaleX(-1);
}
.seaweed view {
  position: absolute;
  bottom: 0;
  left: 30%;
  width: 10%;
  height: 70%;
  background: #5caa9a;
  border-radius: 80% 10% 0 0;
  transform: rotate(-15deg);
}
.seaweed view:nth-child(2) {
  left: 50%;
  height: 100%;
  transform: rotate(10deg);
  background: #75b5a1;
}
.seaweed view:nth-child(3) {
  left: 70%;
  height: 45%;
  transform: rotate(20deg);
}
.dive-coral {
  position: absolute;
  z-index: 2;
  border: 2px solid #ddad9e;
  border-radius: 18% 20% 8% 8%;
  background: #c18d91;
  box-shadow: inset -4px 0 0 #9c7d8a;
}
.dive-coral view {
  position: absolute;
  top: 15%;
  width: 32%;
  height: 13%;
  border-radius: 8px;
  background: #e0b1a6;
}
.dive-coral view:first-child {
  left: -15%;
}
.dive-coral view:nth-child(2) {
  right: -15%;
  top: 54%;
}
.depth-3 .dive-coral {
  background: #9891b8;
  border-color: #b4acce;
}
.dive-pearl,
.dive-exit,
.dive-enemy,
.dive-bubble {
  position: absolute;
  transform: translate(-50%, -50%);
}
.dive-pearl {
  z-index: 3;
  border-radius: 50%;
  background: #fff0c8;
  border: 2px solid #d8cfad;
  box-shadow: 0 0 8px #fff8ce66;
}
.dive-pearl view {
  position: absolute;
  width: 25%;
  height: 25%;
  left: 20%;
  top: 15%;
  border-radius: 50%;
  background: #fffaf0;
}
.dive-exit {
  z-index: 2;
  border-radius: 50%;
  border: 3px solid #8dbbb1;
  background: #24647888;
  opacity: 0.6;
}
.dive-exit.is-open {
  opacity: 1;
  border-color: #fff0c0;
  box-shadow:
    0 0 0 4px #ccddad33,
    inset 0 0 15px #cae6c422;
}
.dive-exit text {
  position: absolute;
  left: -20%;
  width: 140%;
  bottom: -17px;
  color: #e4f2d7;
  font-size: 10px;
  text-align: center;
}
.dive-enemy {
  z-index: 4;
  border: 1px solid #142d39;
  border-radius: 43% 50% 39% 45%;
  background: linear-gradient(165deg, #668a84 8%, #395d62 42%, #7f4b47 67%, #c08862 94%);
  box-shadow: inset 1px 1px 0 #a3b8a1, inset -2px -2px 0 #263d46;
}
.enemy-tail {
  position: absolute;
  z-index: -1;
  left: -27%;
  top: 18%;
  width: 40%;
  height: 62%;
  background: #4b7679;
  border: 1px solid #17313d;
  border-radius: 4% 70% 70% 4%;
  transform: skewY(-14deg);
  box-shadow: inset 2px 0 0 #8ba69a;
}
.enemy-tail::after {
  position: absolute;
  content: '';
  left: 10%;
  top: 48%;
  width: 65%;
  height: 1px;
  background: #203c48;
  transform: rotate(-15deg);
}
.enemy-eye {
  position: absolute;
  z-index: 3;
  left: 59%;
  top: 15%;
  width: 19%;
  height: 18%;
  border-radius: 12% 10% 55% 45%;
  background: #ee7d57;
  border-top: 2px solid #152a36;
  box-shadow: 0 1px 0 #132c38;
  transform: rotate(17deg);
}
.enemy-eye::after {
  position: absolute;
  content: '';
  width: 26%;
  height: 70%;
  right: 20%;
  top: 4%;
  background: #161e26;
  border-radius: 45%;
}
.enemy-mouth {
  position: absolute;
  z-index: 4;
  left: 55%;
  top: 37%;
  width: 49%;
  height: 49%;
  overflow: hidden;
  border: 1px solid #d59e78;
  border-radius: 10% 16% 46% 40%;
  background: #18202c;
  box-shadow: 0 1px 0 #24323b;
}
.dive-enemy.is-stunned {
  opacity: 0.45;
}
.piranha-fin {
  position: absolute;
  display: flex;
  align-items: flex-end;
  left: 12%;
  top: -27%;
  width: 54%;
  height: 33%;
  z-index: -1;
}
.piranha-fin view {
  width: 0;
  height: 0;
  border-left: 3px solid transparent;
  border-right: 3px solid transparent;
  border-bottom: 8px solid #263f4d;
  transform: skewX(-18deg);
}
.piranha-fin view:nth-child(2) { border-bottom-width: 11px; }
.piranha-gill {
  position: absolute;
  left: 42%;
  top: 37%;
  width: 14%;
  height: 36%;
  border-right: 2px solid #1e3b47;
  border-radius: 50%;
  transform: rotate(-12deg);
}
.piranha-scales {
  position: absolute;
  left: 12%;
  top: 30%;
  width: 28%;
  height: 32%;
  display: flex;
  align-items: center;
}
.piranha-scales view {
  width: 35%;
  height: 70%;
  border-right: 1px solid #a6b5a0;
  border-radius: 50%;
  opacity: 0.65;
}
.piranha-side-fin {
  position: absolute;
  left: 20%;
  bottom: -8%;
  width: 24%;
  height: 25%;
  background: #8d6252;
  border: 1px solid #263e48;
  border-radius: 0 0 70% 15%;
  transform: rotate(-22deg);
}
.piranha-teeth {
  position: absolute;
  left: 3%;
  width: 94%;
  height: 45%;
  display: flex;
  justify-content: space-between;
}
.teeth-upper { top: 0; }
.teeth-lower { bottom: 0; transform: rotate(180deg); }
.piranha-teeth view {
  width: 0;
  height: 0;
  border-left: 2px solid transparent;
  border-right: 2px solid transparent;
  border-top: 5px solid #fff4d1;
}
.piranha-teeth view:nth-child(2) { border-top-width: 7px; }
.hypoxia-warning { color: #ffd1a5; font-weight: 650; }
.pearl-count text { display: block; font-size: 10px; opacity: 0.8; margin-top: 4px; }
.return-button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 80px;
  padding: 12px 8px;
  border: 1px solid #b3ceaa;
  border-radius: 12px;
  color: #eff1cf;
  background: #416f69;
  font-size: 13px;
  touch-action: none;
  user-select: none;
}
.return-button.is-returning { background: #7c8359; }
.return-note { font-size: 10px; opacity: 0.8; }
.dive-enemy text {
  position: absolute;
  bottom: 100%;
  color: #d9efda;
  font-size: 12px;
}
.dive-bubble {
  z-index: 5;
  border-radius: 50%;
  border: 1px solid #d8f5ef;
  box-shadow: inset 2px 2px 0 #e7fff166;
  background: #c0f4ec33;
}
.dive-player {
  position: absolute;
  z-index: 6;
  width: 8%;
  height: 15%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.player-air-bubble {
  position: absolute;
  z-index: 5;
  left: -4%;
  top: 3%;
  width: 108%;
  height: 80%;
  border: 1px solid #d5f4e87a;
  border-radius: 50%;
  box-shadow: inset 2px 2px 0 #e0f7e52b;
}
.dive-player.is-invulnerable {
  opacity: 0.55;
}
.water-cover {
  position: absolute;
  z-index: 10;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
  align-items: center;
  padding: 12px;
  background: #183d60df;
  text-align: center;
}
.pause-caption {
  font-size: 19px;
  font-weight: 650;
  color: #f1edcf;
}
.water-cover text {
  font-size: 12px;
  line-height: 1.7;
  color: #bddbd3;
}
.water-cover button {
  min-width: 120px;
  padding: 9px 16px;
  border-radius: 12px;
  color: #254e60;
  background: #d7e7c7;
}
.water-cover .quiet-water-button {
  color: #c6e2d6;
  background: transparent;
  min-height: 36px;
}
.result-symbol {
  color: #ead8a3;
  font-size: 32px;
  line-height: 1.1;
}
.earned-items {
  max-width: 95%;
  color: #ebdcb9;
  font-size: 11px;
  line-height: 1.7;
}
.game-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.direction-pad {
  display: grid;
  grid-template-columns: repeat(3, 44px);
  grid-template-rows: repeat(3, 44px);
  gap: 4px;
}
.direction-pad button {
  padding: 0;
  min-width: 44px;
  color: #dcebd6;
  background: #397382;
  border: 1px solid #61979b;
  border-radius: 12px;
  font-size: 25px;
}
.direction-up {
  grid-column: 2;
  grid-row: 1;
}
.direction-left {
  grid-column: 1;
  grid-row: 2;
}
.direction-right {
  grid-column: 3;
  grid-row: 2;
}
.direction-down {
  grid-column: 2;
  grid-row: 3;
}
.pad-center {
  grid-column: 2;
  grid-row: 2;
  margin: 12px;
  border-radius: 50%;
  border: 1px solid #7eaba7;
  background: #4d858c;
}
.bubble-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 86px;
  height: 86px;
  padding: 10px;
  border-radius: 50%;
  background: #99c9bb;
  color: #2d5d65;
  border: 3px solid #d2e6c6;
  box-shadow: 0 4px 0 #2d6875;
  font-size: 12px;
}
.bubble-button view {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #edf4d6;
  background: #b8e1d333;
  box-shadow: inset 3px 2px 0 #e4f3d9aa;
}
.control-hint {
  padding: 10px 16px 0;
  font-size: 11px;
  line-height: 1.7;
  text-align: center;
  color: #bed7cd;
  flex-shrink: 0;
}
.keyboard-hint {
  display: block;
}
.result-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.dive-primary,
.dive-secondary {
  padding: 10px 16px;
  border-radius: 12px;
  color: #294f5d;
  background: #d7e7c7;
}
.dive-secondary {
  color: #d2e7db;
  background: #3a7480;
}
@media (max-width: 560px) {
  .dive-overlay {
    padding: 0;
  }
  .dive-panel {
    max-height: 100%;
    border: 0;
    border-radius: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .dive-header {
    padding: 14px 16px 10px;
  }
  .dive-title {
    font-size: 21px;
  }
  .dive-subtitle {
    font-size: 11px;
  }
  .dive-intro {
    padding: 12px 16px;
    gap: 12px;
  }
  .intro-pet {
    width: 65px;
    height: 75px;
  }
  .intro-title {
    font-size: 16px;
  }
  .dive-intro text {
    font-size: 12px;
  }
  .level-list {
    flex-direction: column;
    padding: 16px;
    gap: 11px;
  }
  .level-card {
    flex-direction: row;
    text-align: left;
    padding: 13px;
    gap: 12px;
  }
  .level-icon {
    width: 45px;
    height: 45px;
    flex-shrink: 0;
  }
  .level-copy {
    flex: 1;
  }
  .level-name {
    font-size: 16px;
  }
  .level-prize {
    font-size: 10px;
  }
  .level-state {
    padding: 7px 10px;
    font-size: 11px;
  }
  .level-icon view:first-child {
    left: 8px;
  }
  .level-icon view:nth-child(2) {
    left: 20px;
  }
  .level-icon view:nth-child(3) {
    right: 4px;
  }
  .dive-hud {
    gap: 8px;
    padding: 0 12px 8px;
  }
  .heart-group {
    font-size: 18px;
  }
  .oxygen-group {
    max-width: 90px;
  }
  .pearl-count {
    font-size: 11px;
  }
  .pause-button {
    min-width: 44px;
    font-size: 12px;
  }
  .play-layout {
    gap: 12px;
    padding: 0 12px;
  }
  .pause-caption {
    font-size: 17px;
  }
  .water-cover {
    gap: 4px;
  }
  .water-cover text {
    font-size: 11px;
  }
  .earned-items {
    font-size: 10px;
  }
  .result-symbol {
    font-size: 26px;
  }
  .control-hint {
    font-size: 10px;
  }
  .keyboard-hint {
    display: none;
  }
}
@media (min-width: 620px) and (max-height: 620px) {
  .dive-overlay {
    padding: 8px;
  }
  .dive-panel {
    border-width: 2px;
    border-radius: 16px;
  }
  .dive-header {
    padding: 8px 16px 4px;
  }
  .dive-title {
    font-size: 20px;
  }
  .dive-subtitle {
    display: none;
  }
  .dive-hud {
    padding: 0 16px 6px;
  }
  .play-layout {
    flex-direction: row;
    gap: 20px;
  }
  .board-wrap {
    flex: 1;
  }
  .game-controls {
    flex-direction: column;
    gap: 12px;
    width: 160px;
  }
  .direction-pad {
    grid-template-columns: repeat(3, 44px);
    grid-template-rows: repeat(3, 44px);
  }
  .bubble-button {
    width: 78px;
    height: 78px;
  }
  .control-hint {
    padding-top: 7px;
  }
  .keyboard-hint {
    display: inline;
    margin-left: 8px;
  }
  .dive-footnote {
    padding: 5px 12px;
  }
  .dive-intro {
    padding: 8px 20px;
  }
  .intro-pet {
    width: 58px;
    height: 65px;
  }
  .level-list {
    padding: 14px 20px;
  }
  .level-card {
    gap: 8px;
    padding: 12px;
  }
  .level-icon {
    width: 45px;
    height: 35px;
  }
  .level-name {
    font-size: 16px;
  }
  .level-target {
    font-size: 11px;
  }
  .level-prize {
    font-size: 10px;
  }
  .result-actions {
    flex-direction: column;
    width: 150px;
  }
  .adventure-rules {
    padding-bottom: 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .water-light,
  .seaweed,
  .dive-coral,
  .dive-pearl,
  .dive-exit,
  .dive-enemy,
  .dive-bubble,
  .dive-player,
  .player-air-bubble,
  .water-cover {
    animation: none !important;
  }
}
</style>
