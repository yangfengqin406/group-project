<template>
  <view
    class="plaza-scene"
    :class="{ 'is-overview': overview, 'is-dragging': dragging }"
    @tap="movePlayer"
    @touchstart="touchStart"
    @touchmove.stop.prevent="touchMove"
    @touchend="touchEnd"
    @touchcancel="cancelGesture"
    @mousedown="mouseDown"
    @mousemove="mouseMove"
    @mouseup="mouseUp"
    @mouseleave="mouseUp"
  >
    <image
      class="scene-surround"
      src="/static/plaza/world-phase-one.webp"
      mode="aspectFill"
    />
    <view class="scene-map" :style="worldStyle">
      <image
        class="scene-art"
        src="/static/plaza/world-phase-one.webp"
        mode="scaleToFill"
        @error="imageError = true"
        @load="imageError = false"
      />
      <PlazaLeisure />
      <button
        v-for="house in PLAZA_HOUSES"
        :key="'building-' + house.id"
        class="building-hotspot"
        :class="'building-' + house.id"
        :style="buildingStyle(house.id)"
        :aria-label="'走到' + house.name + '门口'"
        @tap.stop="chooseHouse(house.id)"
      ></button>
      <view
        v-if="player.target"
        class="destination"
        :style="locate(player.target)"
      ></view>
      <view
        v-for="person in visiblePeople"
        :key="person.id"
        class="town-person"
        :class="{ 'town-player': person.id === 'self' }"
        :style="personStyle(person)"
      >
        <view v-if="person.id === 'self'" class="player-ground-mark"></view>
        <PetAvatar
          :appearance="person.id === 'self' ? appearance : person.appearance"
          :walking="person.moving && greetingId !== person.id && (person.id === 'self' || !reducedMotion)"
          :facing="
            person.id === 'self' && appearance.species === 'custom'
              ? 1
              : person.facing
          "
          :view="avatarView(person)"
          :ornament="person.id === 'self' ? ornament : ''"
          :wardrobe="person.id === 'self' ? wardrobe : null"
        />
        <button
          v-if="person.id !== 'self'"
          class="neighbor-hotspot"
          :aria-label="'和' + PLAZA_NEIGHBORS[person.id].name + '打招呼'"
          @touchstart.stop
          @mousedown.stop
          @tap.stop="greetNeighbor(person.id)"
        ></button>
      </view>
      <button
        v-for="house in PLAZA_HOUSES"
        :key="house.id"
        class="entrance"
        :class="[
          'entrance-' + house.id,
          { 'is-target': player.entering === house.id }
        ]"
        :style="locate(house)"
        :aria-label="'走到' + house.name + '门口'"
        @tap.stop="chooseHouse(house.id)"
      >
        <view class="sign-bracket"></view>
        <view class="sign-rope rope-left"></view>
        <view class="sign-rope rope-right"></view>
        <view class="entrance-sign">
          <view class="sign-icon" :class="'icon-' + house.id">
            <view class="icon-part part-one"></view>
            <view class="icon-part part-two"></view>
          </view>
          <text>{{ house.name }}</text>
        </view>
      </button>
      <button
        v-for="area in PLAZA_AREAS"
        :key="area.id"
        class="area-hotspot"
        :class="[
          'area-' + area.id,
          { 'is-target': player.entering === area.id }
        ]"
        :style="locate(area)"
        :aria-label="'走到' + area.name"
        @tap.stop="chooseArea(area.id)"
      >
        <view class="area-sign">
          <view class="area-dot"></view>
          <text>{{ area.name }}</text>
        </view>
      </button>
      <button
        class="board-hotspot"
        :style="locate({ x: 0.563, y: 0.54 })"
        aria-label="查看广场公告"
        @tap.stop="openBoard"
      >
        <text class="board-label">公告</text>
      </button>
      <button
        class="guide-puppy"
        :style="locate({ x: 0.61, y: 0.565 })"
        aria-label="和小狗麦麦聊聊广场指南"
        @touchstart.stop
        @mousedown.stop
        @tap.stop="openGuide"
      >
        <image src="/static/village/guide-puppy.webp" mode="aspectFit" />
      </button>
    </view>
    <view v-if="neighborMessage" class="neighbor-message" role="status" @tap.stop @touchstart.stop @mousedown.stop>
      <button class="neighbor-dismiss" aria-label="结束打招呼" @tap="closeGreeting">×</button>
      <view class="neighbor-name">{{ neighborMessage.name }}<text>广场邻居</text></view>
      <view class="neighbor-copy">{{ detailedGreeting ? neighborMessage.tip : neighborMessage.hello }}</view>
      <button v-if="!detailedGreeting" class="neighbor-action" @tap="greetNeighbor(greetingId)">打个招呼，聊一聊</button>
      <button v-else class="neighbor-action" @tap="walkToHouse(neighborMessage.destination)">{{ neighborMessage.action }} ›</button>
    </view>
    <view v-if="imageError" class="scene-image-error">
      场景图片暂未加载，请稍后重试。
    </view>
    <view v-if="preparing" class="scene-preparing">伙伴正赶来广场…</view>
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
import PetAvatar from '../pet/PetAvatar.vue'
import PlazaLeisure from './PlazaLeisure.vue'
import { defaultPet } from '../../utils/pet-appearance.js'
import { createPlazaWalker } from '../../utils/plaza-motion.js'
import { plazaActorDepths } from '../../utils/plaza-depth.js'
import { PLAZA_NEIGHBORS, createNeighborGreetings } from '../../utils/plaza-neighbors.js'
import {
  createPlazaNavigator,
  PLAZA_HOUSES,
  PLAZA_AREAS
} from '../../utils/plaza-navigation.js'

const props = defineProps({
  active: { type: Boolean, default: true },
  preparing: { type: Boolean, default: false },
  appearance: { type: Object, default: null },
  overview: { type: Boolean, default: false },
  ornament: { type: String, default: '' },
  wardrobe: { type: Object, default: null }
})
const emit = defineEmits(['enter', 'board', 'guide', 'busy', 'pond', 'pavilion'])
const instance = getCurrentInstance()
const navigator = createPlazaNavigator()
const player = ref(navigator.getState())
const viewport = ref({ width: 390, height: 760, left: 0, top: 0 })
const camera = ref({ x: 0, y: 0 })
const dragging = ref(false)
const imageError = ref(false)
const reducedMotion = ref(false)
const people = ref([])
const greetingId = ref(null)
const detailedGreeting = ref(false)
const neighborMessage = computed(() => PLAZA_NEIGHBORS[greetingId.value] || null)
const greetings = createNeighborGreetings()
let greetingUntil = 0
function closeGreeting() {
  greetingId.value = null
  detailedGreeting.value = false
}
function greetNeighbor(id) {
  if (!props.active || entryLocked || dragging.value || Date.now() < suppressTapUntil) return
  greetings.acknowledge(id, Date.now())
  greetingId.value = id
  detailedGreeting.value = true
  navigator.cancelEntry()
  refreshPeople()
}
const world = computed(() => {
  const ratios = [viewport.value.width / 1280, viewport.value.height / 801]
  const scale = props.overview ? Math.min(...ratios) : Math.max(...ratios)
  return { width: 1280 * scale, height: 801 * scale, scale }
})
const actorWidth = computed(() =>
  Math.max(28, Math.min(50, 43 * world.value.scale))
)
const worldStyle = computed(() => ({
  width: `${world.value.width}px`,
  height: `${world.value.height}px`,
  left: `${camera.value.x}px`,
  top: `${camera.value.y}px`,
  '--actor-width': `${actorWidth.value}px`,
  '--actor-height': `${actorWidth.value * 1.13}px`
}))
const visiblePeople = computed(() => [
  ...(props.appearance ? [{ id: 'self', ...player.value }] : []),
  ...people.value
])
const actorDepths = computed(() => plazaActorDepths(visiblePeople.value))
const hasCustomBack = computed(() => {
  const frame = props.appearance?.art?.back
  return Boolean(
    frame &&
      (frame.type === 'png' || frame.pixels?.some((color) => color !== null))
  )
})
function avatarView(person) {
  if (person.id === 'self' && props.appearance?.species === 'custom')
    return person.view === 'back' && hasCustomBack.value ? 'back' : 'front'
  return person.view || 'front'
}
const buildingBounds = {
  partner: { x: 0.125, y: 0.17, width: 0.27, height: 0.28 },
  lost: { x: 0.59, y: 0.095, width: 0.345, height: 0.335 },
  market: { x: 0.07, y: 0.555, width: 0.31, height: 0.27 },
  home: { x: 0.7, y: 0.51, width: 0.285, height: 0.32 }
}
const residents = [
  {
    id: 'capybara',
    appearance: defaultPet('capybara'),
    position: { x: 0.59, y: 0.39 },
    speed: 0.022
  },
  {
    id: 'squirrel',
    appearance: defaultPet('squirrel'),
    position: { x: 0.67, y: 0.55 },
    speed: 0.019
  },
  {
    id: 'mushroom',
    appearance: defaultPet('mushroom'),
    position: { x: 0.34, y: 0.6 },
    speed: 0.025
  }
]
const stops = [
  { x: 0.43, y: 0.36 },
  { x: 0.68, y: 0.45 },
  { x: 0.46, y: 0.68 },
  { x: 0.33, y: 0.5 }
]
const walkers = residents.map(createPlazaWalker)
const stopIndexes = [0, 1, 2]
let timer = null,
  previousTime = 0,
  mounted = false
let followPlayer = true,
  entryLocked = false,
  lastBusy = false
let gesture = null,
  suppressTapUntil = 0,
  ignoreMouseUntil = 0

const locate = (point) => ({
  left: `${point.x * 100}%`,
  top: `${point.y * 100}%`
})
function buildingStyle(id) {
  const bounds = buildingBounds[id]
  return {
    ...locate(bounds),
    width: `${bounds.width * 100}%`,
    height: `${bounds.height * 100}%`
  }
}
const personStyle = (person) => ({
  ...locate(person.position),
  zIndex: actorDepths.value[person.id]
})
function refreshPeople() {
  player.value = navigator.getState()
  people.value = walkers.map((walker, index) => ({
    ...residents[index],
    ...walker.getState()
  }))
  const busy = Boolean(player.value.entering || entryLocked)
  if (busy !== lastBusy) {
    lastBusy = busy
    emit('busy', busy)
  }
}
function clampCamera(point) {
  const axis = (value, screen, scene) =>
    scene <= screen
      ? (screen - scene) / 2
      : Math.min(0, Math.max(screen - scene, value))
  return {
    x: axis(point.x, viewport.value.width, world.value.width),
    y: axis(point.y, viewport.value.height, world.value.height)
  }
}
function playerCamera() {
  return clampCamera({
    x: viewport.value.width / 2 - player.value.position.x * world.value.width,
    y:
      viewport.value.height * 0.57 -
      player.value.position.y * world.value.height
  })
}
function updateCamera(immediate = false) {
  if (props.overview) {
    camera.value = clampCamera({ x: 0, y: 0 })
    return
  }
  if (!followPlayer || dragging.value) return
  const target = playerCamera()
  camera.value = immediate
    ? target
    : {
        x: camera.value.x + (target.x - camera.value.x) * 0.2,
        y: camera.value.y + (target.y - camera.value.y) * 0.2
      }
}
function measureScene() {
  if (!mounted) return
  uni
    .createSelectorQuery()
    .in(instance.proxy)
    .select('.plaza-scene')
    .boundingClientRect((bounds) => {
      if (!bounds?.width || !bounds?.height || !mounted) return
      viewport.value = {
        width: bounds.width,
        height: bounds.height,
        left: bounds.left,
        top: bounds.top
      }
      camera.value = clampCamera(camera.value)
      updateCamera(true)
    })
    .exec()
}
function centerPlayer() {
  followPlayer = true
  updateCamera(true)
}
function settleEntry() {
  const entry = navigator.consumeEntry()
  if (!entry || entryLocked || !props.active) return
  if (entry.kind === 'area') {
    refreshPeople()
    emit(entry.id)
    return
  }
  entryLocked = true
  refreshPeople()
  emit('enter', entry)
}
function walkToHouse(id) {
  if (!props.active || !props.appearance || entryLocked) return false
  closeGreeting()
  navigator.enterHouse(id)
  followPlayer = true
  refreshPeople()
  settleEntry()
  return true
}
function releaseEntry() {
  entryLocked = false
  navigator.cancelEntry()
  refreshPeople()
}
function walkToArea(id) {
  if (!props.active || !props.appearance || entryLocked) return false
  closeGreeting()
  navigator.enterArea(id)
  followPlayer = true
  refreshPeople()
  settleEntry()
  return true
}
function chooseArea(id) {
  if (Date.now() < suppressTapUntil || dragging.value) return
  walkToArea(id)
}
function chooseHouse(id) {
  if (Date.now() < suppressTapUntil || dragging.value) return
  walkToHouse(id)
}
function openBoard() {
  if (Date.now() < suppressTapUntil || dragging.value || entryLocked) return
  navigator.cancelEntry()
  closeGreeting()
  refreshPeople()
  emit('board')
}
function openGuide() {
  if (!props.active || Date.now() < suppressTapUntil || dragging.value || entryLocked) return
  navigator.cancelEntry()
  closeGreeting()
  refreshPeople()
  emit('guide')
}
function eventPoint(event) {
  const point = event.changedTouches?.[0] || event.touches?.[0] || event
  const x = point.clientX ?? point.pageX ?? event.detail?.x
  const y = point.clientY ?? point.pageY ?? event.detail?.y
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}
function movePlayer(event) {
  if (
    !props.active ||
    !props.appearance ||
    entryLocked ||
    dragging.value ||
    Date.now() < suppressTapUntil
  )
    return
  const point = eventPoint(event)
  if (!point) return
  const x = (point.x - viewport.value.left - camera.value.x) / world.value.width
  const y = (point.y - viewport.value.top - camera.value.y) / world.value.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return
  closeGreeting()
  navigator.moveTo({ x, y })
  followPlayer = true
  refreshPeople()
  settleEntry()
}
function startGesture(event) {
  if (!props.active || props.overview) return
  const point = eventPoint(event)
  if (!point) return
  gesture = { point, camera: { ...camera.value }, moved: false }
}
function moveGesture(event) {
  if (!gesture) return
  const point = eventPoint(event)
  if (!point) return
  const dx = point.x - gesture.point.x,
    dy = point.y - gesture.point.y
  if (!gesture.moved && Math.hypot(dx, dy) < 6) return
  gesture.moved = true
  dragging.value = true
  followPlayer = false
  camera.value = clampCamera({
    x: gesture.camera.x + dx,
    y: gesture.camera.y + dy
  })
}
function endGesture() {
  if (gesture?.moved) suppressTapUntil = Date.now() + 300
  gesture = null
  dragging.value = false
}
function cancelGesture() {
  endGesture()
}
function touchStart(event) {
  ignoreMouseUntil = Date.now() + 700
  startGesture(event)
}
function touchMove(event) {
  moveGesture(event)
}
function touchEnd() {
  endGesture()
}
function mouseDown(event) {
  if (
    Date.now() < ignoreMouseUntil ||
    (event.button !== undefined && event.button !== 0)
  )
    return
  startGesture(event)
}
function mouseMove(event) {
  if (Date.now() < ignoreMouseUntil) return
  moveGesture(event)
}
function mouseUp() {
  if (Date.now() < ignoreMouseUntil) return
  endGesture()
}
function stopClock() {
  if (timer) clearInterval(timer)
  timer = null
}
function startClock() {
  stopClock()
  if (!mounted || !props.active) return
  previousTime = Date.now()
  timer = setInterval(() => {
    const now = Date.now(),
      elapsed = Math.min(0.1, (now - previousTime) / 1000)
    previousTime = now
    navigator.advance(elapsed)
    if (!reducedMotion.value)
      walkers.forEach((walker, index) => {
        if (greetingId.value === residents[index].id) return
        if (!walker.getState().moving) {
          stopIndexes[index] = (stopIndexes[index] + 1) % stops.length
          walker.moveTo(stops[stopIndexes[index]])
        }
        walker.advance(elapsed)
      })
    refreshPeople()
    if (greetingId.value && !detailedGreeting.value && now >= greetingUntil) closeGreeting()
    if (props.appearance && !greetingId.value && !dragging.value && !player.value.entering && !entryLocked) {
      const id = greetings.encounter(player.value.position, people.value, now)
      if (id) {
        greetingId.value = id
        detailedGreeting.value = false
        greetingUntil = now + 5500
      }
    }
    updateCamera()
    settleEntry()
  }, 33)
}
refreshPeople()
watch(
  () => props.overview,
  () => {
    cancelGesture()
    nextTick(measureScene)
  }
)
watch(
  () => props.active,
  (active) => {
    if (active) {
      nextTick(measureScene)
      startClock()
    } else {
      closeGreeting()
      stopClock()
      cancelGesture()
      releaseEntry()
    }
  }
)
onMounted(() => {
  mounted = true
  // #ifdef H5
  reducedMotion.value = Boolean(
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
  // #endif
  nextTick(measureScene)
  uni.onWindowResize?.(measureScene)
  startClock()
})
onUnmounted(() => {
  mounted = false
  stopClock()
  navigator.cancelEntry()
  uni.offWindowResize?.(measureScene)
})
defineExpose({ walkToHouse, walkToArea, centerPlayer, releaseEntry })
</script>

<style scoped>
.neighbor-hotspot {
  position: absolute;
  inset: 0;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  margin: 0;
  border: 0;
  background: transparent;
  pointer-events: auto;
}
.neighbor-hotspot::after, .guide-puppy::after, .neighbor-message button::after { border: 0; }
.neighbor-hotspot:focus-visible, .guide-puppy:focus-visible { outline: 2px solid #fff5d9; outline-offset: 2px; }
.guide-puppy {
  position: absolute;
  z-index: 900;
  width: 49px;
  height: 58px;
  padding: 0;
  margin: 0;
  transform: translate(-50%, -92%);
  background: transparent;
}
.guide-puppy image { width: 100%; height: 100%; }
.neighbor-message {
  position: absolute;
  z-index: 2000;
  left: 16px;
  bottom: calc(88px + env(safe-area-inset-bottom));
  width: 310px;
  max-width: calc(100% - 32px);
  box-sizing: border-box;
  padding: 16px 18px 10px;
  border: 1px solid #ae996e;
  border-radius: 4px 17px 17px 17px;
  background: #fff8e6;
  box-shadow: 0 4px 0 #6a664c33;
  color: #3e5946;
  cursor: auto;
}
.neighbor-name { padding-right: 32px; font-size: 16px; font-weight: 700; }
.neighbor-name text { margin-left: 9px; color: #82826a; font-size: 11px; font-weight: 400; }
.neighbor-copy { margin-top: 8px; line-height: 1.7; font-size: 14px; }
.neighbor-message button { min-height: 44px; margin: 0; font-size: 13px; line-height: 1.5; background: transparent; color: #3e654f; }
.neighbor-dismiss { position: absolute; right: 2px; top: 0; width: 44px; padding: 9px; font-size: 23px !important; }
.neighbor-action { padding: 10px 0 6px; text-align: left; font-weight: 600; }
.plaza-scene {
  position: relative;
  z-index: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #b5c995;
  touch-action: none;
  cursor: grab;
  user-select: none;
}
.is-dragging {
  cursor: grabbing;
}
.scene-surround {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.6;
  filter: blur(10px);
  transform: scale(1.04);
  pointer-events: none;
}
.scene-map {
  position: absolute;
}
.scene-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.building-hotspot,
.entrance,
.board-hotspot,
.area-hotspot {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  min-height: 0;
  line-height: 1.2;
  border: 0;
  border-radius: 0;
  background: transparent;
  cursor: pointer;
}
.building-hotspot {
  z-index: 2;
}
.building-hotspot::after,
.entrance::after,
.board-hotspot::after,
.area-hotspot::after {
  border: 0;
}
.entrance {
  --sign-accent: #8c79a5;
  --sign-soft: #e0d6ea;
  z-index: 1400;
  width: 106px;
  height: 52px;
  transform: translate(-50%, -50%);
  overflow: visible;
}
.entrance-sign {
  position: absolute;
  bottom: 5px;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 1px 9px;
  overflow: hidden;
  color: #51452e;
  background: #f8efd8;
  border: 1px solid #96825b;
  border-radius: 3px 3px 6px 6px;
  box-shadow:
    inset 0 -3px 0 #e8d9b6,
    0 2px 0 #6b594640;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
}
.entrance-sign::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--sign-accent);
}
.sign-bracket {
  position: absolute;
  left: 16%;
  top: 7px;
  width: 68%;
  height: 3px;
  border-radius: 2px;
  background: #8e7954;
  box-shadow: 0 1px 0 #cfb891;
}
.sign-rope {
  position: absolute;
  top: 8px;
  width: 2px;
  height: 11px;
  background: #bc9a63;
}
.rope-left {
  left: 25%;
}
.rope-right {
  right: 25%;
}
.sign-icon {
  position: relative;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}
.icon-part {
  position: absolute;
}
.icon-partner .part-one,
.icon-partner .part-two {
  top: 3px;
  width: 7px;
  height: 11px;
  border-radius: 80% 15% 75% 15%;
  border: 1px solid #7a6b8f;
  background: #b9a7ca;
}
.icon-partner .part-one {
  left: 1px;
  transform: rotate(-25deg);
}
.icon-partner .part-two {
  right: 1px;
  transform: rotate(62deg);
  background: #d2c3df;
}
.entrance-lost {
  --sign-accent: #bc7d59;
  --sign-soft: #efd3b7;
}
.icon-lost .part-one {
  left: 1px;
  top: 1px;
  width: 10px;
  height: 10px;
  border: 2px solid #aa7956;
  border-radius: 50%;
  background: #f1e2c1;
}
.icon-lost .part-two {
  left: 10px;
  top: 11px;
  width: 7px;
  height: 3px;
  border-radius: 2px;
  background: #aa7956;
  transform: rotate(47deg);
}
.entrance-market {
  --sign-accent: #bd9660;
  --sign-soft: #f0dfb6;
}
.icon-market .part-one {
  left: 2px;
  top: 6px;
  width: 13px;
  height: 10px;
  border: 1px solid #a2854e;
  border-radius: 1px 1px 3px 3px;
  background: #dcc48f;
}
.icon-market .part-two {
  left: 6px;
  top: 1px;
  width: 5px;
  height: 8px;
  border: 1px solid #a2854e;
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
}
.entrance-home {
  --sign-accent: #6e9478;
  --sign-soft: #d9e6cc;
}
.icon-home .part-one {
  left: 3px;
  top: 2px;
  width: 10px;
  height: 10px;
  background: #6e9478;
  transform: rotate(45deg);
  border-radius: 1px;
}
.icon-home .part-two {
  left: 3px;
  top: 7px;
  width: 10px;
  height: 9px;
  border: 1px solid #62876b;
  background: #bdceb0;
}
.icon-home .part-two::after {
  content: '';
  position: absolute;
  left: 3px;
  bottom: 0;
  width: 3px;
  height: 5px;
  background: #6e9478;
  border-radius: 2px 2px 0 0;
}
.is-target .entrance-sign {
  color: #395936;
  background: #f1f3d9;
  border-color: #7b9867;
}
.area-hotspot {
  z-index: 1300;
  width: 100px;
  height: 44px;
  transform: translate(-50%, -50%);
  overflow: visible;
}
.area-sign {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  color: #526747;
  background: #f7efd9ee;
  border: 1px solid #a6af84;
  border-radius: 6px;
  white-space: nowrap;
  box-shadow: 0 1px 0 #6c7f5040;
}
.area-dot {
  width: 9px;
  height: 6px;
  border: 1px solid #789e98;
  border-radius: 50%;
  background: #c5e0d5;
}
.area-pavilion .area-dot {
  height: 8px;
  border-color: #829364;
  background: #b4c18e;
  border-radius: 3px 3px 0 0;
}
.is-target .area-sign {
  color: #294f3e;
  border-color: #597f60;
  background: #ecf2d7;
}
.is-overview .entrance {
  width: 98px;
  height: 48px;
}
.is-overview .entrance-sign {
  height: 24px;
  padding: 1px 7px;
  gap: 4px;
  font-size: 10px;
}
.is-overview .sign-bracket {
  top: 6px;
}
.is-overview .sign-rope {
  top: 7px;
}
.is-overview .sign-icon {
  transform: scale(0.88);
}
.board-hotspot {
  z-index: 1100;
  width: 65px;
  height: 70px;
  transform: translate(-50%, -50%);
  align-items: flex-end;
  overflow: visible;
}
.board-label {
  margin-bottom: -5px;
  padding: 3px 7px;
  border: 1px solid #8e7652;
  border-radius: 4px;
  color: #5e4b32;
  background: #fff4dcef;
  font-size: 11px;
}
.town-person {
  position: absolute;
  width: var(--actor-width);
  height: var(--actor-height);
  transform: translate(-50%, -92%);
  pointer-events: none;
}
.player-ground-mark {
  position: absolute;
  left: 8%;
  bottom: 0;
  width: 84%;
  height: 16%;
  border-radius: 50%;
  border: 1px solid #fff5cf;
  background: #fff5cf47;
}
.destination {
  position: absolute;
  z-index: 4;
  width: 19px;
  height: 10px;
  border: 2px solid #fff4d2;
  box-shadow: 0 0 0 1px #45695791;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.scene-image-error,
.scene-preparing {
  position: absolute;
  left: 50%;
  bottom: 24%;
  z-index: 1700;
  max-width: 80%;
  transform: translateX(-50%);
  padding: 7px 12px;
  color: #493e2d;
  background: #fff4dcef;
  border-radius: 5px;
  font-size: 13px;
  text-align: center;
  pointer-events: none;
}
</style>
