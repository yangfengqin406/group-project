<template>
  <view class="fishing-overlay wx-v" @touchmove.stop>
    <view
      class="pond-panel wx-v"
      role="dialog"
      aria-modal="true"
      aria-label="池边垂钓"
    >
      <view class="pond-heading wx-v">
        <view class="wx-v">
          <view class="pond-title wx-v">
            {{ panel === 'bag' ? '伙伴衣柜' : '池边垂钓' }}
          </view>
          <text class="pond-subtitle">
            {{
              panel === 'bag'
                ? '校园互助攒珍珠，搭配喜欢的装扮。'
                : '把脚步放慢一点，等一条小鱼。'
            }}
          </text>
        </view>
        <button class="pond-close wx-b" aria-label="离开池边" @tap="close">
          收起
        </button>
      </view>

      <view class="pond-tabs wx-v">
        <button class="wx-b"
          :class="{ selected: panel === 'pond' }"
          :aria-pressed="panel === 'pond'"
          @tap="panel = 'pond'"
        >
          钓一会儿
        </button>
        <button class="wx-b"
          :class="{ selected: panel === 'bag' }"
          :aria-pressed="panel === 'bag'"
          @tap="panel = 'bag'"
        >
          衣柜与鱼册
        </button>
        <button class="dive-entry wx-b" @tap="emit('dive')">潜水闯关</button>
      </view>

      <scroll-view class="pond-content" scroll-y>
        <view v-if="error" class="pond-error wx-v" role="alert">{{ error }}</view>
        <view v-if="panel === 'pond'" class="play-pane wx-v">
          <view
            class="pond-scene wx-v"
            :class="['phase-' + phase, { 'less-motion': reducedMotion }]"
            aria-hidden="true"
          >
            <view class="water-ring ring-one wx-v"></view>
            <view class="water-ring ring-two wx-v"></view>
            <view class="water-ring ring-three wx-v"></view>
            <view class="lily lily-one wx-v"><view class="wx-v"></view></view>
            <view class="lily lily-two wx-v"><view class="wx-v"></view></view>
            <view class="pond-fish fish-one wx-v"><view class="wx-v"></view></view>
            <view class="pond-fish fish-two wx-v"><view class="wx-v"></view></view>
            <view v-if="activeCast || phase === 'caught'" class="fishing-rod wx-v">
              <view class="fishing-line wx-v"></view>
            </view>
            <view v-if="activeCast" class="float-bobber wx-v"><view class="wx-v"></view></view>
            <view v-if="phase === 'bite'" class="bite-mark wx-v">!</view>
            <view class="pond-bank wx-v"></view>
            <view class="reed reed-one wx-v">
              <view class="wx-v"></view>
              <view class="wx-v"></view>
              <view class="wx-v"></view>
            </view>
            <view class="reed reed-two wx-v">
              <view class="wx-v"></view>
              <view class="wx-v"></view>
              <view class="wx-v"></view>
            </view>
            <view v-if="appearance" class="pond-pet wx-v">
              <PetAvatar
                :appearance="appearance"
                :ornament="wornOrnament"
                :wardrobe="wardrobe"
              />
            </view>
            <view class="bank-stone stone-one wx-v"></view>
            <view class="bank-stone stone-two wx-v"></view>
          </view>

          <view class="fishing-message wx-v">
            <view class="phase-heading wx-v" role="status" aria-live="polite">
              {{ statusTitle }}
            </view>
            <view class="phase-description wx-v">{{ statusDescription }}</view>
            <view v-if="phase === 'reeling'" class="line-game wx-v">
              <view class="line-meter wx-v" aria-label="往返标尺，看准绿色区域收线">
                <view class="meter-zone wx-v" :style="zoneStyle"></view>
                <view class="meter-marker wx-v" :style="markerStyle">
                  <view class="wx-v"></view>
                </view>
              </view>
              <view class="meter-labels wx-v">
                <text>轻轻放线</text>
                <text>绿区收线</text>
                <text>慢慢来</text>
              </view>
            </view>
            <view v-if="phase === 'caught'" class="catch-card wx-v">
              <view class="catch-fish wx-v">
                <view class="fish-eye wx-v"></view>
                <view class="fish-fin wx-v"></view>
              </view>
              <view class="catch-copy wx-v">
                <text class="catch-name">{{ outcome.fish.name }}</text>
                <text v-if="outcome.reward" class="reward-name">
                  还捎来了{{ outcome.reward.name }}
                </text>
                <text v-else class="catch-detail">已经收进你的鱼册啦</text>
              </view>
            </view>
            <view v-if="state" class="catch-total wx-v">
              和池塘相遇了 {{ state.catchCount }} 次
            </view>
          </view>
        </view>

        <view v-else class="bag-pane wx-v">
          <WardrobePanel
            :appearance="appearance"
            @change="wardrobeChanged"
            @adventure="emit('dive')"
          />
          <view class="bag-rule wx-v">
            第一次钓到鱼送小荷叶，之后每次成功钓获，有 35% 的机会捎来池塘装饰。
          </view>
          <view class="collection-heading fishbook-heading wx-v">我的小鱼册</view>
          <view v-if="state && !state.fishBook.length" class="empty-collection wx-v">
            还没有遇见小鱼，去池边坐一会儿吧。
          </view>
          <view class="fishbook-grid wx-v">
            <view
              v-for="fish in state?.fishBook || []"
              :key="fish.id"
              class="fishbook-entry wx-v"
            >
              <view class="book-fish wx-v" aria-hidden="true"><view class="wx-v"></view></view>
              <text class="book-fish-name">{{ fish.name }}</text>
              <text class="book-fish-count">{{ fish.count }} 条</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <view class="pond-footer wx-v">
        <view class="pond-buttons wx-v">
          <button :class="{'wx-disabled':Boolean(busy || !active)}"
            v-if="error"
            class="pond-primary wx-b"
            :disabled="busy || !active"
            @tap="refresh"
          >
            重新读取
          </button>
          <template v-else-if="panel === 'bag'">
            <button class="pond-primary wx-b" @tap="panel = 'pond'">
              回池边钓鱼
            </button>
          </template>
          <template v-else>
            <button :class="{'wx-disabled':Boolean(Boolean(busy) || !active || rewardEquipped)}"
              v-if="phase === 'caught' && outcome.reward"
              class="pond-secondary wx-b"
              :disabled="Boolean(busy) || !active || rewardEquipped"
              @tap="equip(outcome.reward.id)"
            >
              {{ rewardEquipped ? '已经戴好啦' : '戴上' + outcome.reward.name }}
            </button>
            <button
              class="pond-primary wx-b"
              :class="[{ 'bite-action': phase === 'bite' },{'wx-disabled':Boolean(actionDisabled)}]"
              :disabled="actionDisabled"
              @tap="takeAction"
            >
              {{ actionLabel }}
            </button>
          </template>
        </view>
        <view class="pond-footnote wx-v">
          {{
            config.apiMode === 'mock'
              ? '本机演示 · 收集按当前演示身份保存'
              : '收集状态由当前账号服务提供'
          }}
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { fishing, wardrobe as wardrobeService } from '../../services/index.js'
import { config } from '../../config/index.js'
import { linePosition } from '../../utils/fishing-timing.js'
import { WARDROBE_ITEMS } from '../../utils/wardrobe-catalog.js'
import { errorText } from '../../utils/errors.js'
import PetAvatar from '../pet/PetAvatar.vue'
import WardrobePanel from '../pet/WardrobePanel.vue'

const props = defineProps({
  appearance: { type: Object, default: null },
  ornament: { type: String, default: '' },
  wardrobe: { type: Object, default: null },
  initialPanel: { type: String, default: 'pond' }
})
const emit = defineEmits(['close', 'equipped', 'wardrobe', 'dive'])
const state = ref(null)
const busy = ref('')
const error = ref('')
const outcome = ref(null)
const panel = ref(props.initialPanel === 'bag' ? 'bag' : 'pond')
const now = ref(Date.now())
const active = ref(true)
const reducedMotion = ref(false)
const activeCast = computed(() => state.value?.activeCast || null)
const wornOrnament = computed(() =>
  state.value ? state.value.equipped || '' : props.ornament
)
const rewardEquipped = computed(() => {
  const rewardId = outcome.value?.reward?.id
  if (!rewardId) return false
  if (props.wardrobe !== null) {
    const slot = WARDROBE_ITEMS.find((item) => item.id === rewardId)?.slot
    return Boolean(slot && props.wardrobe[slot] === rewardId)
  }
  return state.value?.equipped === rewardId
})
let mounted = false
let closed = false
let revision = 0
let clock = null

const phase = computed(() => {
  if (!state.value) return 'loading'
  if (outcome.value?.status === 'caught') return 'caught'
  if (outcome.value?.status === 'escaped') return 'escaped'
  const cast = activeCast.value
  if (!cast) return 'idle'
  if (cast.status === 'hooked')
    return now.value > cast.landDeadlineAt ? 'escaped' : 'reeling'
  if (now.value > cast.escapeAt) return 'escaped'
  return now.value >= cast.biteAt ? 'bite' : 'waiting'
})
const statusTitle = computed(
  () =>
    ({
      loading: '池塘正醒过来…',
      idle: '今天会遇见谁呢？',
      waiting: '浮漂轻轻晃着…',
      bite: '咬钩啦！',
      reeling: '把小鱼慢慢带回来',
      caught: '钓到了！',
      escaped: '小鱼又游回池塘了'
    })[phase.value]
)
const statusDescription = computed(() => {
  if (outcome.value?.status === 'escaped' && outcome.value.reason)
    return outcome.value.reason
  return {
    loading: '正在看看鱼册和收纳袋。',
    idle: '抛一竿，等浮漂告诉你。',
    waiting: '别着急，让鱼儿再靠近一点。',
    bite: '现在点「收竿」，把握这次相遇。',
    reeling: '标记走进绿色区域时，点「稳稳收线」。',
    caught: outcome.value?.reward
      ? '小鱼和一份小礼物，都好好收起来了。'
      : '每次相遇，都留在你的小鱼册里。',
    escaped: '没关系，池边的好时光还在。再抛一竿吧。'
  }[phase.value]
})
const zoneStyle = computed(() => {
  const zone = activeCast.value?.meterZone || [0.28, 0.78]
  return { left: `${zone[0] * 100}%`, width: `${(zone[1] - zone[0]) * 100}%` }
})
const markerStyle = computed(() => ({
  left: `${activeCast.value ? linePosition(activeCast.value, now.value) * 100 : 0}%`
}))
const actionDisabled = computed(() =>
  Boolean(
    busy.value ||
      !active.value ||
      !state.value ||
      phase.value === 'waiting' ||
      (phase.value === 'reeling' && now.value < activeCast.value.meterStartAt)
  )
)
const actionLabel = computed(() => {
  if (busy.value === 'cast') return '正在抛竿…'
  if (busy.value === 'hook') return '轻轻收竿…'
  if (busy.value === 'land') return '正在收线…'
  if (busy.value === 'loading') return '正在读取…'
  return {
    loading: '正在读取…',
    idle: '抛一竿',
    waiting: '等鱼儿靠近…',
    bite: '收竿！',
    reeling: '稳稳收线',
    caught: '再来一竿',
    escaped: '再来一竿'
  }[phase.value]
})

function applyState(next) {
  state.value = next
  now.value = Date.now()
}

async function request(kind, action, apply) {
  if (busy.value || !active.value || closed) return
  const current = ++revision
  busy.value = kind
  error.value = ''
  try {
    const result = await action()
    if (current !== revision || !mounted || closed || !active.value) return
    apply(result)
  } catch (failure) {
    if (current === revision && mounted && !closed && active.value)
      error.value = errorText(failure)
  } finally {
    if (current === revision) busy.value = ''
  }
}

function refresh() {
  return request(
    'loading',
    () => fishing.getState(),
    (next) => {
      applyState(next)
      outcome.value = null
    }
  )
}

function castLine() {
  if (!state.value) return
  return request(
    'cast',
    () => fishing.cast(),
    (cast) => {
      state.value = { ...state.value, activeCast: cast }
      outcome.value = null
      now.value = Date.now()
    }
  )
}

function hookFish() {
  const castId = activeCast.value?.id
  if (!castId) return
  return request(
    'hook',
    () => fishing.hook({ castId }),
    (result) => {
      if (result.status === 'hooked') {
        state.value = { ...state.value, activeCast: result.cast }
        outcome.value = null
        now.value = Date.now()
      } else {
        applyState(result.state)
        outcome.value = result
      }
    }
  )
}

function landFish() {
  const castId = activeCast.value?.id
  if (!castId) return
  return request(
    'land',
    () => fishing.land({ castId }),
    (result) => {
      applyState(result.state)
      outcome.value = result
      syncWardrobe()
    }
  )
}

function equip(decorationId) {
  return request(
    `equip:${decorationId || 'none'}`,
    () => fishing.equip({ decorationId }),
    (next) => {
      applyState(next)
      emit('equipped', next)
      syncWardrobe()
    }
  )
}

function wardrobeChanged(next) {
  emit('wardrobe', next)
}
async function syncWardrobe() {
  const current = revision
  try {
    const next = await wardrobeService.getState()
    if (current === revision && mounted && !closed && active.value)
      wardrobeChanged(next)
  } catch (failure) {
    if (current === revision && mounted && !closed)
      error.value = errorText(failure)
  }
}

function takeAction() {
  if (actionDisabled.value) return
  if (phase.value === 'bite') return hookFish()
  if (phase.value === 'reeling') return landFish()
  return castLine()
}

function stopClock() {
  if (clock !== null) clearInterval(clock)
  clock = null
}

function startClock() {
  stopClock()
  now.value = Date.now()
  if (!mounted || !active.value || closed) return
  clock = setInterval(() => {
    now.value = Date.now()
  }, 40)
}

function close() {
  closed = true
  active.value = false
  revision++
  stopClock()
  emit('close')
}

onMounted(() => {
  mounted = true
  // #ifdef H5
  reducedMotion.value = Boolean(
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
  // #endif
  startClock()
  refresh()
})
onHide(() => {
  active.value = false
  revision++
  busy.value = ''
  stopClock()
})
onShow(() => {
  if (!mounted || closed) return
  active.value = true
  startClock()
  refresh()
})
onUnmounted(() => {
  mounted = false
  closed = true
  revision++
  stopClock()
})
</script>

<style scoped>
.dive-entry {
  color: #496a72 !important;
  background: #e2ece4 !important;
}
.fishing-overlay {
  position: fixed;
  z-index: 3000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: #183e3bc4;
  color: #294e4b;
}
.pond-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  height: 100%;
  max-width: 880px;
  max-height: 760px;
  background: #fff9e8;
  border: 4px solid #d4dcb7;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 14px 50px #153a3b50;
}
.wx-b {
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
}
.wx-b::after {
  border: 0;
}
.wx-b.wx-disabled {
  opacity: 0.55;
}
.wx-b:focus-visible {
  outline: 3px solid #336f74;
  outline-offset: 3px;
}
.pond-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 10px;
  flex-shrink: 0;
}
.pond-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 1px;
}
.pond-subtitle {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #718474;
}
.pond-close {
  min-width: 52px;
  min-height: 44px;
  padding: 9px;
  border-radius: 22px;
  color: #49695f;
  background: #e9eddb;
  flex-shrink: 0;
}
.pond-tabs {
  display: flex;
  gap: 8px;
  padding: 0 20px 12px;
  flex-shrink: 0;
}
.pond-tabs .wx-b {
  flex: 1;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #edf0df;
  color: #6b7a60;
  border-radius: 10px;
}
.pond-tabs .selected {
  background: #d4e8db;
  color: #315e56;
  font-weight: 650;
}
.pond-content {
  height: 0;
  min-height: 0;
  flex: 1;
}
.play-pane {
  padding: 0 20px;
}
.pond-scene {
  position: relative;
  overflow: hidden;
  height: 226px;
  border-radius: 18px 18px 50% 12px / 18px 18px 12% 12px;
  background: #79b8ae;
  box-shadow: inset 0 10px 0 #a2cec0;
}
.pond-scene::before {
  content: '';
  position: absolute;
  width: 84%;
  height: 68%;
  top: 13%;
  left: 22%;
  border: 1px solid #d1e9cb66;
  border-radius: 50%;
}
.water-ring {
  position: absolute;
  width: 54px;
  height: 13px;
  border: 2px solid #d8efdb5c;
  border-radius: 50%;
}
.ring-one {
  left: 56%;
  top: 52%;
  width: 76px;
  height: 20px;
}
.ring-two {
  left: 20%;
  top: 24%;
}
.ring-three {
  right: 7%;
  bottom: 21%;
  width: 34px;
  height: 9px;
}
.lily {
  position: absolute;
  width: 36px;
  height: 20px;
  border-radius: 50%;
  background: #7c9f61;
  box-shadow: inset 0 -4px 0 #638c55;
  transform: rotate(-12deg);
}
.lily::after {
  content: '';
  position: absolute;
  right: -1px;
  top: 6px;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-right: 16px solid #79b8ae;
}
.lily .wx-v {
  position: absolute;
  left: 10px;
  top: -6px;
  width: 10px;
  height: 10px;
  border-radius: 60% 60% 30% 30%;
  background: #f1d9cf;
  box-shadow: 4px 2px 0 #fff0d8;
}
.lily-one {
  left: 14%;
  top: 21%;
}
.lily-two {
  right: 10%;
  top: 11%;
  transform: scale(0.7) rotate(15deg);
}
.pond-fish {
  position: absolute;
  width: 22px;
  height: 10px;
  border-radius: 50%;
  background: #4f979563;
  animation: fish-drift 7s ease-in-out infinite alternate;
}
.pond-fish::after {
  content: '';
  position: absolute;
  right: -7px;
  top: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-right: 8px solid #4f979563;
}
.fish-one {
  left: 40%;
  top: 37%;
}
.fish-two {
  right: 14%;
  top: 67%;
  transform: rotate(180deg);
  animation-delay: -3s;
}
.pond-bank {
  position: absolute;
  width: 70%;
  height: 72px;
  left: -17%;
  bottom: -20px;
  background: #d7dfb3;
  border-radius: 50% 70% 0 0;
  box-shadow: 0 -5px 0 #bdd0a0;
  transform: rotate(9deg);
}
.pond-pet {
  position: absolute;
  z-index: 2;
  width: 76px;
  height: 86px;
  left: 15%;
  bottom: 24px;
}
.fishing-rod {
  position: absolute;
  z-index: 3;
  width: 148px;
  height: 5px;
  bottom: 45px;
  left: calc(15% + 48px);
  background: #aa8954;
  border-radius: 4px;
  transform-origin: left;
  transform: rotate(-24deg);
  box-shadow: 0 2px 0 #725e40;
}
.fishing-line {
  position: absolute;
  width: 1px;
  height: 42px;
  right: 1px;
  top: 0;
  background: #fff9e8a6;
  transform-origin: top;
  transform: rotate(24deg);
}
.float-bobber {
  position: absolute;
  z-index: 4;
  bottom: 48px;
  left: calc(15% + 178px);
  width: 10px;
  height: 23px;
  border-radius: 6px;
  background: #fff4cf;
  border-bottom: 8px solid #c98063;
  box-shadow: 0 8px 0 -3px #3e8d8b77;
  animation: float-bob 2s ease-in-out infinite;
}
.float-bobber .wx-v {
  position: absolute;
  top: -8px;
  left: 4px;
  width: 2px;
  height: 10px;
  background: #a9674f;
}
.phase-bite .float-bobber {
  animation: bite-bob 0.45s ease-in-out infinite alternate;
}
.bite-mark {
  position: absolute;
  z-index: 5;
  bottom: 84px;
  left: calc(15% + 172px);
  min-width: 24px;
  font-size: 28px;
  font-weight: 750;
  color: #fff9e8;
  text-shadow: 2px 2px 0 #49897f;
}
.reed {
  position: absolute;
  z-index: 4;
  width: 40px;
  height: 56px;
  bottom: 0;
}
.reed .wx-v {
  position: absolute;
  bottom: 0;
  left: 16px;
  width: 4px;
  height: 45px;
  border-radius: 70% 0 0 0;
  background: #6e9364;
  transform: rotate(-10deg);
}
.reed .wx-v:nth-child(2) {
  left: 26px;
  height: 56px;
  transform: rotate(12deg);
  background: #7e9e64;
}
.reed .wx-v:nth-child(3) {
  left: 7px;
  height: 34px;
  transform: rotate(-28deg);
}
.reed-one {
  left: 3%;
}
.reed-two {
  left: 40%;
  transform: scale(0.6);
  transform-origin: bottom;
}
.bank-stone {
  position: absolute;
  z-index: 3;
  bottom: 13px;
  width: 24px;
  height: 11px;
  border-radius: 50%;
  background: #a4bbaa;
  box-shadow: inset 0 3px 0 #bdcbb5;
}
.stone-one {
  left: 8%;
}
.stone-two {
  left: 38%;
  width: 18px;
  height: 8px;
  bottom: 4px;
}
.fishing-message {
  padding: 18px 0 12px;
  text-align: center;
}
.phase-heading {
  font-size: 20px;
  font-weight: 650;
  color: #315f59;
}
.phase-description {
  color: #76836e;
  font-size: 13px;
  line-height: 1.8;
  margin-top: 7px;
  min-height: 24px;
}
.catch-total {
  font-size: 11px;
  color: #8a917b;
  margin-top: 13px;
}
.line-game {
  padding: 22px 4px 2px;
}
.line-meter {
  position: relative;
  height: 20px;
  background: #e1d9b8;
  border: 3px solid #c8c9a5;
  border-radius: 12px;
}
.meter-zone {
  position: absolute;
  height: 100%;
  top: 0;
  background: #75a784;
}
.meter-marker {
  position: absolute;
  z-index: 2;
  top: -10px;
  width: 10px;
  height: 34px;
  background: #fffaf0;
  border: 2px solid #45695e;
  border-radius: 5px;
  transform: translateX(-50%);
  box-shadow: 0 2px 0 #61714b33;
}
.meter-labels {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  font-size: 10px;
  color: #8b9075;
}
.catch-card {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
  margin-top: 18px;
  padding: 15px 12px;
  border-radius: 14px;
  background: #edf1dd;
}
.catch-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}
.catch-name {
  font-size: 17px;
  font-weight: 650;
}
.reward-name {
  font-size: 12px;
  color: #8d724c;
}
.catch-detail {
  font-size: 12px;
  color: #7c886f;
}
.catch-fish {
  position: relative;
  width: 45px;
  height: 27px;
  border-radius: 55% 50% 50% 55%;
  background: #e0b880;
  border: 2px solid #c19265;
  flex-shrink: 0;
}
.catch-fish::after {
  content: '';
  position: absolute;
  right: -12px;
  top: 2px;
  border-top: 9px solid transparent;
  border-bottom: 9px solid transparent;
  border-right: 13px solid #d3a66c;
}
.fish-eye {
  position: absolute;
  top: 6px;
  left: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #526451;
}
.fish-fin {
  position: absolute;
  top: 9px;
  left: 24px;
  width: 9px;
  height: 10px;
  border-radius: 70% 0 70% 0;
  background: #edcf97;
}
.pond-error {
  margin: 0 20px 14px;
  padding: 12px;
  border: 1px solid #dabca2;
  border-radius: 12px;
  background: #faefdc;
  color: #976449;
  font-size: 13px;
  line-height: 1.7;
}
.pond-footer {
  padding: 12px 20px 16px;
  border-top: 1px solid #e6e9cf;
  flex-shrink: 0;
  background: #fff9e8;
}
.pond-buttons {
  display: flex;
  gap: 10px;
}
.pond-primary,
.pond-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 11px 8px;
  border-radius: 12px;
  font-size: 15px;
}
.pond-primary {
  background: #427f78;
  color: #fff9e8;
  box-shadow: 0 3px 0 #2d625d;
}
.pond-secondary {
  background: #e8edda;
  color: #57734e;
}
.pond-primary.bite-action {
  background: #a47152;
  box-shadow: 0 3px 0 #865339;
}
.pond-footnote {
  font-size: 10px;
  color: #8c947b;
  line-height: 1.5;
  margin-top: 11px;
  text-align: center;
}
.bag-pane {
  padding: 0 20px 18px;
}
.bag-intro {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 6px 12px 14px;
  border-bottom: 1px dashed #d5ddc3;
}
.bag-pet {
  width: 76px;
  height: 86px;
  flex-shrink: 0;
}
.bag-title {
  font-size: 19px;
  font-weight: 650;
}
.bag-note {
  display: block;
  margin-top: 6px;
  color: #7a8871;
  font-size: 12px;
  line-height: 1.7;
}
.bag-rule {
  padding: 12px 0 0;
  color: #7c886e;
  font-size: 12px;
  line-height: 1.8;
}
.collection-heading {
  font-size: 15px;
  font-weight: 650;
  margin: 20px 0 12px;
}
.empty-collection {
  padding: 16px 12px;
  color: #849077;
  font-size: 13px;
  line-height: 1.8;
  border-radius: 12px;
  background: #f1f2e4;
}
.ornament-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid #e9ebd7;
}
.ornament-info {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}
.ornament-name {
  font-size: 15px;
}
.ornament-count {
  font-size: 11px;
  color: #8a917b;
}
.wear-button {
  min-height: 44px;
  min-width: 70px;
  padding: 11px 10px;
  border-radius: 10px;
  background: #dbead8;
  color: #48745a;
  font-size: 13px;
}
.wear-button.worn {
  background: #ede8d1;
  color: #897c54;
}
.ornament-icon {
  position: relative;
  flex-shrink: 0;
  width: 43px;
  height: 40px;
  border-radius: 50%;
  background: #edf0de;
}
.ornament-lily-pad .wx-v {
  position: absolute;
  left: 7px;
  top: 12px;
  width: 29px;
  height: 17px;
  border-radius: 50%;
  background: #88ac6c;
  border-bottom: 3px solid #698f58;
  transform: rotate(-12deg);
}
.ornament-reed-bow::before,
.ornament-reed-bow::after {
  content: '';
  position: absolute;
  top: 11px;
  width: 15px;
  height: 17px;
  background: #a2b879;
  border: 2px solid #819d64;
  border-radius: 70% 15% 30% 70%;
}
.ornament-reed-bow::before {
  left: 6px;
}
.ornament-reed-bow::after {
  right: 6px;
  transform: rotate(180deg);
}
.ornament-bubble-star .wx-v {
  position: absolute;
  left: 12px;
  top: 7px;
  width: 20px;
  height: 25px;
  border: 3px solid #8bbac4;
  border-radius: 50%;
  background: #c4e2db;
  box-shadow: inset 3px 2px 0 #fff9e8;
}
.fishbook-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.fishbook-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  width: calc(33.333% - 7px);
  min-width: 73px;
  padding: 17px 7px 12px;
  border-radius: 12px;
  background: #edf1e1;
}
.book-fish {
  position: relative;
  width: 31px;
  height: 18px;
  background: #d8b77d;
  border-radius: 50%;
  margin: 0 7px 1px 0;
}
.book-fish::after {
  content: '';
  position: absolute;
  right: -8px;
  top: 2px;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-right: 10px solid #c99e64;
}
.book-fish .wx-v {
  position: absolute;
  top: 5px;
  left: 6px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #59654b;
}
.book-fish-name {
  font-size: 12px;
}
.book-fish-count {
  font-size: 11px;
  color: #8b9476;
}
@keyframes float-bob {
  0%,
  100% {
    transform: translateY(0) rotate(3deg);
  }
  50% {
    transform: translateY(4px) rotate(-3deg);
  }
}
@keyframes bite-bob {
  from {
    transform: translateY(1px) rotate(-12deg);
  }
  to {
    transform: translateY(9px) rotate(10deg);
  }
}
@keyframes fish-drift {
  from {
    margin-left: -10px;
  }
  to {
    margin-left: 18px;
  }
}
.less-motion .float-bobber,
.less-motion .pond-fish {
  animation: none;
}
@media (max-width: 560px) {
  .fishing-overlay {
    padding: 0;
  }
  .pond-panel {
    height: 100%;
    max-height: 100%;
    border: 0;
    border-radius: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .pond-heading {
    padding: 18px 16px 12px;
  }
  .pond-title {
    font-size: 23px;
  }
  .pond-tabs {
    padding-left: 16px;
    padding-right: 16px;
  }
  .pond-tabs .wx-b {
    font-size: 12px;
    padding-left: 3px;
    padding-right: 3px;
    white-space: nowrap;
  }
  .play-pane,
  .bag-pane {
    padding-left: 16px;
    padding-right: 16px;
  }
  .pond-content {
    max-height: none;
  }
  .pond-scene {
    height: 32vh;
    min-height: 200px;
    max-height: 300px;
  }
  .pond-footer {
    padding: 14px 16px 18px;
  }
  .pond-error {
    margin-left: 16px;
    margin-right: 16px;
  }
}
@media (min-width: 620px) and (max-height: 600px) {
  .fishing-overlay {
    padding: 10px;
  }
  .pond-panel {
    height: calc(100% - 4px);
    border-width: 3px;
    border-radius: 18px;
  }
  .pond-heading {
    padding: 10px 18px 6px;
  }
  .pond-title {
    font-size: 21px;
  }
  .pond-subtitle {
    font-size: 11px;
    margin-top: 2px;
  }
  .pond-tabs {
    padding: 0 18px 8px;
  }
  .pond-tabs .wx-b {
    min-height: 44px;
  }
  .pond-content {
    max-height: none;
  }
  .play-pane {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 0 18px 10px;
    min-height: 214px;
  }
  .pond-scene {
    flex: 1.15;
    height: 220px;
    min-width: 0;
  }
  .fishing-message {
    flex: 1;
    min-width: 0;
    padding: 8px 0;
  }
  .phase-heading {
    font-size: 19px;
  }
  .phase-description {
    font-size: 12px;
  }
  .catch-card {
    margin-top: 12px;
    padding: 12px;
  }
  .pond-footer {
    padding: 9px 18px 10px;
  }
  .pond-footnote {
    margin-top: 7px;
  }
  .bag-intro {
    float: left;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    width: 31%;
    min-height: 210px;
    padding: 10px 20px 10px 0;
    margin-right: 24px;
    border-bottom: 0;
    border-right: 1px dashed #d5ddc3;
    gap: 10px;
  }
  .bag-pane {
    padding-bottom: 14px;
  }
  .collection-heading {
    margin-top: 6px;
  }
  .fishbook-heading {
    clear: both;
    padding-top: 12px;
  }
  .fishbook-entry {
    width: auto;
    flex: 1;
    min-width: 90px;
    max-width: 160px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .float-bobber,
  .pond-fish {
    animation: none;
  }
}
</style>
