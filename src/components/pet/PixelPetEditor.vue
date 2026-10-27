<template>
  <view class="pixel-editor" :class="{ 'is-disabled': disabled }">
    <view class="canvas-stage">
      <view class="canvas-square">
        <image
          v-if="imported"
          class="imported-art"
          :src="importedData"
          mode="aspectFit"
        />
        <canvas
          v-else
          :id="canvasId"
          :canvas-id="canvasId"
          class="drawing-canvas"
          :disable-scroll="true"
          :hidpi="true"
          aria-label="像素画布，按住并拖动画画"
          @touchstart.stop.prevent="startTouch"
          @touchmove.stop.prevent="moveTouch"
          @touchend.stop.prevent="finishStroke"
          @touchcancel.stop.prevent="finishStroke"
          @mousedown="startMouse"
          @mousemove="moveMouse"
          @mouseup="finishMouse"
          @mouseleave="finishMouse"
          @error="canvasError"
        />
      </view>
    </view>
    <text class="canvas-hint">
      {{
        imported
          ? '这是导入图片，清空后可自己画'
          : '按住拖动画画，松手后更新预览'
      }}
    </text>

    <view class="paint-colors" aria-label="绘画颜色">
      <button
        v-for="(color, index) in ART_COLORS"
        :key="color"
        class="color-swatch wx-b"
        :class="[{ 'is-selected': chosenColor === color &amp;&amp; tool === 'paint' },{'wx-disabled':Boolean(disabled || imported || drawing)}]"
        :style="{ backgroundColor: color }"
        :disabled="disabled || imported || drawing"
        :aria-label="colorNames[index]"
        :aria-pressed="chosenColor === color && tool === 'paint'"
        @click="chooseColor(color)"
      >
        <text
          v-if="chosenColor === color && tool === 'paint'"
          class="color-dot"
        ></text>
      </button>
    </view>

    <view class="editor-tools">
      <view class="tool-pair">
        <button
          class="tool-button wx-b"
          :class="[{ 'is-active': tool === 'paint' },{'wx-disabled':Boolean(disabled || imported || drawing)}]"
          :disabled="disabled || imported || drawing"
          :aria-pressed="tool === 'paint'"
          @click="tool = 'paint'"
        >
          画笔
        </button>
        <button
          class="tool-button wx-b"
          :class="[{ 'is-active': tool === 'erase' },{'wx-disabled':Boolean(disabled || imported || drawing)}]"
          :disabled="disabled || imported || drawing"
          :aria-pressed="tool === 'erase'"
          @click="tool = 'erase'"
        >
          橡皮
        </button>
      </view>
      <view class="brush-pair" aria-label="笔刷大小">
        <button
          v-for="size in [1, 2, 3]"
          :key="size"
          class="brush-button wx-b"
          :class="[{ 'is-active': brushSize === size },{'wx-disabled':Boolean(disabled || imported || drawing)}]"
          :disabled="disabled || imported || drawing"
          :aria-label="size + '格笔刷'"
          :aria-pressed="brushSize === size"
          @click="brushSize = size"
        >
          <view
            class="brush-mark"
            :style="{ width: size * 4 + 3 + 'px', height: size * 4 + 3 + 'px' }"
          ></view>
        </button>
      </view>
    </view>
    <view class="editor-actions">
      <button :class="{'wx-disabled':Boolean(disabled || imported || drawing || !undoStack.length)}"
        class="editor-action secondary wx-b"
        :disabled="disabled || imported || drawing || !undoStack.length"
        @click="undo"
      >
        撤销
      </button>
      <button :class="{'wx-disabled':Boolean(disabled || drawing || (!imported &amp;&amp; isBlank))}"
        class="editor-action secondary wx-b"
        :disabled="disabled || drawing || (!imported && isBlank)"
        @click="confirmClear"
      >
        清空画布
      </button>
    </view>
  </view>
</template>

<script setup>
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  toRaw,
  watch
} from 'vue'
import { onReady } from '@dcloudio/uni-app'
import {
  ART_COLORS,
  ART_SIZE,
  blankFrame,
  validateArtFrame
} from '../../utils/pet-art.js'

const props = defineProps({
  frame: { type: Object, default: blankFrame },
  // The page owns this in-memory session while mini-program canvases unmount.
  editorState: { type: Object, default: null },
  side: { type: String, default: 'front' },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:frame', 'update:editorState', 'drawing', 'error'])
const instance = getCurrentInstance()
const canvasId = `pet-paint-${instance.uid}`
const colorNames = [
  '奶油',
  '白色',
  '麦芽',
  '杏棕',
  '栗棕',
  '深棕',
  '嫩叶',
  '苔绿',
  '深绿',
  '樱粉',
  '莓粉',
  '鹅黄',
  '浅紫',
  '葡萄紫',
  '雾蓝',
  '湖蓝'
]
const pixels = ref(blankFrame().pixels)
const imported = ref(false)
const importedData = ref('')
const chosenColor = ref(ART_COLORS[5])
const tool = ref('paint')
const brushSize = ref(1)
const undoStack = ref([])
const drawing = ref(false)
const isBlank = computed(() => !pixels.value.some((color) => color !== null))
let context = null
let canvasRect = null
let stroke = null
let lastEmitted = null
let renderTimer = null
let renderBusy = false
let renderAgain = false
let touchAt = 0
let frameVersion = 0
let destroyed = false

function reportError(message) {
  if (!destroyed) emit('error', message)
}

function measureCanvas(done) {
  if (
    typeof uni === 'undefined' ||
    typeof uni.createSelectorQuery !== 'function'
  ) {
    reportError('当前环境暂不能绘画，请使用导入图片')
    done?.(null)
    return
  }
  uni
    .createSelectorQuery()
    .in(instance.proxy)
    .select(`#${canvasId}`)
    .boundingClientRect((rect) => {
      if (destroyed) return
      if (rect?.width > 0 && rect?.height > 0) canvasRect = rect
      done?.(rect?.width > 0 ? rect : null)
    })
    .exec()
}

async function prepareCanvas() {
  await nextTick()
  if (destroyed || imported.value) return
  if (
    typeof uni === 'undefined' ||
    typeof uni.createCanvasContext !== 'function'
  ) {
    reportError('当前环境暂不能绘画，请使用导入图片')
    return
  }
  context = uni.createCanvasContext(canvasId, instance.proxy)
  measureCanvas((rect) => {
    if (rect) renderCanvas()
  })
}

function renderCanvas() {
  if (destroyed || imported.value || !context || !canvasRect) return
  if (renderBusy) {
    renderAgain = true
    return
  }
  renderBusy = true
  renderAgain = false
  const ctx = context
  const width = canvasRect.width
  const height = canvasRect.height
  const unitX = width / ART_SIZE
  const unitY = height / ART_SIZE
  ctx.clearRect(0, 0, width, height)
  ctx.setFillStyle('#fffef8')
  ctx.fillRect(0, 0, width, height)
  ctx.setFillStyle('#e7ebdf')
  for (let y = 0; y < ART_SIZE; y += 2) {
    for (let x = ((y / 2) % 2) * 2; x < ART_SIZE; x += 4)
      ctx.fillRect(x * unitX, y * unitY, 2 * unitX, 2 * unitY)
  }
  // Paint adjacent equal pixels as a single run to reduce the mini-program bridge work.
  for (let y = 0; y < ART_SIZE; y++) {
    for (let x = 0; x < ART_SIZE; ) {
      const color = pixels.value[y * ART_SIZE + x]
      let end = x + 1
      while (end < ART_SIZE && pixels.value[y * ART_SIZE + end] === color) end++
      if (color !== null) {
        ctx.setFillStyle(color)
        ctx.fillRect(x * unitX, y * unitY, (end - x) * unitX, unitY)
      }
      x = end
    }
  }
  ctx.draw(false, () => {
    renderBusy = false
    if (renderAgain && !destroyed) scheduleRender()
  })
}

function scheduleRender() {
  if (renderTimer !== null || destroyed) return
  renderTimer = setTimeout(() => {
    renderTimer = null
    renderCanvas()
  }, 24)
}

function sendFrame() {
  const frame = { type: 'pixels', pixels: [...pixels.value] }
  lastEmitted = frame
  emit('update:frame', frame, props.side)
  publishEditorState()
}

function publishEditorState() {
  if (destroyed || drawing.value) return
  emit('update:editorState', {
    frameSignature: JSON.stringify(imported.value
      ? { type: 'png', data: importedData.value }
      : { type: 'pixels', pixels: pixels.value }),
    undoStack: undoStack.value.map((past) => [...past]),
    chosenColor: chosenColor.value,
    tool: tool.value,
    brushSize: brushSize.value
  }, props.side)
}

function remember(past) {
  undoStack.value = [...undoStack.value.slice(-19), [...past]]
}

function eventPoint(event) {
  const point = event.touches?.[0] || event.changedTouches?.[0] || event
  if (Number.isFinite(point.clientX) && Number.isFinite(point.clientY))
    return { x: point.clientX, y: point.clientY, local: false }
  if (Number.isFinite(point.x) && Number.isFinite(point.y))
    return { x: point.x, y: point.y, local: true }
  return null
}

function cellAt(point, rect) {
  const x = point.local ? point.x : point.x - rect.left
  const y = point.local ? point.y : point.y - rect.top
  if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null
  return {
    x: Math.floor((x / rect.width) * ART_SIZE),
    y: Math.floor((y / rect.height) * ART_SIZE)
  }
}

function dab(point, current) {
  const shift = Math.floor((current.size - 1) / 2)
  for (let dy = 0; dy < current.size; dy++) {
    for (let dx = 0; dx < current.size; dx++) {
      const x = point.x + dx - shift
      const y = point.y + dy - shift
      if (x >= 0 && y >= 0 && x < ART_SIZE && y < ART_SIZE)
        pixels.value[y * ART_SIZE + x] = current.color
    }
  }
}

function lineTo(from, to, current) {
  let x = from.x
  let y = from.y
  const dx = Math.abs(to.x - x)
  const dy = -Math.abs(to.y - y)
  const sx = x < to.x ? 1 : -1
  const sy = y < to.y ? 1 : -1
  let error = dx + dy
  while (true) {
    dab({ x, y }, current)
    if (x === to.x && y === to.y) break
    const twice = 2 * error
    if (twice >= dy) {
      error += dy
      x += sx
    }
    if (twice <= dx) {
      error += dx
      y += sy
    }
  }
}

function drainPoints(current) {
  for (const point of current.points) {
    const cell = cellAt(point, current.rect)
    if (cell) lineTo(current.previous || cell, cell, current)
    current.previous = cell
  }
  current.points = []
  scheduleRender()
}

function startStroke(event, source) {
  if (props.disabled || imported.value || drawing.value || !context) return
  const point = eventPoint(event)
  if (!point) return
  drawing.value = true
  // Protect even the first stroke before its frame is committed on touchend.
  emit('drawing', true, props.side)
  const current = {
    before: [...pixels.value],
    color: tool.value === 'erase' ? null : chosenColor.value,
    size: brushSize.value,
    source,
    rect: null,
    previous: null,
    points: [point],
    finished: false
  }
  stroke = current
  measureCanvas((rect) => {
    if (stroke !== current) return
    if (!rect) {
      stroke = null
      drawing.value = false
      emit('drawing', false, props.side)
      reportError('画布尚未准备好，请稍后再试')
      return
    }
    current.rect = rect
    drainPoints(current)
    if (current.finished) finishStroke()
  })
}

function moveStroke(event, source) {
  if (!stroke || stroke.source !== source || props.disabled) return
  const point = eventPoint(event)
  if (!point) return
  stroke.points.push(point)
  if (stroke.rect) drainPoints(stroke)
}

function startTouch(event) {
  touchAt = Date.now()
  startStroke(event, 'touch')
}
function moveTouch(event) {
  moveStroke(event, 'touch')
}
function startMouse(event) {
  if (
    Date.now() - touchAt < 700 ||
    (event.button != null && event.button !== 0)
  )
    return
  event.preventDefault?.()
  startStroke(event, 'mouse')
}
function moveMouse(event) {
  moveStroke(event, 'mouse')
}
function finishMouse() {
  if (stroke?.source === 'mouse') finishStroke()
}

function finishStroke() {
  if (!stroke) return
  if (!stroke.rect) {
    stroke.finished = true
    return
  }
  const current = stroke
  stroke = null
  drawing.value = false
  if (pixels.value.some((color, index) => color !== current.before[index])) {
    remember(current.before)
    sendFrame()
  }
  emit('drawing', false, props.side)
  scheduleRender()
}

function flush() {
  finishStroke()
  // If the canvas bridge is still measuring, keep the page in place until the
  // callback commits this stroke. Never disable/unmount it mid-measurement.
  return !drawing.value
}
defineExpose({ flush })

function chooseColor(color) {
  chosenColor.value = color
  tool.value = 'paint'
}

function undo() {
  if (props.disabled || drawing.value || !undoStack.value.length) return
  const previous = undoStack.value[undoStack.value.length - 1]
  undoStack.value = undoStack.value.slice(0, -1)
  pixels.value = [...previous]
  sendFrame()
  scheduleRender()
}

function confirmClear() {
  if (props.disabled || drawing.value) return
  if (typeof uni === 'undefined' || typeof uni.showModal !== 'function') {
    reportError('当前环境暂不能清空画布')
    return
  }
  const version = frameVersion
  uni.showModal({
    title: '清空这张画？',
    content: '清空后可以重新画。',
    confirmText: '清空',
    confirmColor: '#456957',
    success(result) {
      if (
        !result.confirm ||
        props.disabled ||
        destroyed ||
        version !== frameVersion
      )
        return
      if (!imported.value) remember(pixels.value)
      else undoStack.value = []
      imported.value = false
      importedData.value = ''
      pixels.value = blankFrame().pixels
      sendFrame()
      prepareCanvas()
    },
    fail() {
      reportError('暂时无法清空，请重试')
    }
  })
}

function canvasError() {
  reportError('画布暂时不可用，请重试或导入图片')
}

watch(
  () => props.frame,
  (frame) => {
    if (frame && toRaw(frame) === lastEmitted) return
    frameVersion++
    stroke = null
    drawing.value = false
    emit('drawing', false, props.side)
    undoStack.value = []
    lastEmitted = null
    try {
      const valid = validateArtFrame(frame)
      imported.value = valid?.type === 'png'
      importedData.value = imported.value ? valid.data : ''
      pixels.value =
        valid?.type === 'pixels' ? valid.pixels : blankFrame().pixels
    } catch (error) {
      imported.value = false
      importedData.value = ''
      pixels.value = blankFrame().pixels
      nextTick(() => reportError(error.message))
    }
    const state = props.editorState
    const signature = JSON.stringify(imported.value
      ? { type: 'png', data: importedData.value }
      : { type: 'pixels', pixels: pixels.value })
    // A changed/imported frame must never inherit the history of a different
    // drawing. Copy history so front/back and mounted editors cannot share it.
    if (state?.frameSignature === signature) {
      if (!imported.value && Array.isArray(state.undoStack))
        undoStack.value = state.undoStack.slice(-20).filter((past) =>
          Array.isArray(past) && past.length === ART_SIZE * ART_SIZE &&
          past.every((color) => color === null || ART_COLORS.includes(color))
        ).map((past) => [...past])
      if (ART_COLORS.includes(state.chosenColor)) chosenColor.value = state.chosenColor
      if (['paint', 'erase'].includes(state.tool)) tool.value = state.tool
      if ([1, 2, 3].includes(state.brushSize)) brushSize.value = state.brushSize
    }
    context = null
    canvasRect = null
    prepareCanvas()
  },
  { immediate: true }
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled && stroke) {
      pixels.value = stroke.before
      stroke = null
      drawing.value = false
      emit('drawing', false, props.side)
      scheduleRender()
    }
  }
)
onMounted(prepareCanvas)
onReady(prepareCanvas)
onBeforeUnmount(() => {
  if (stroke?.rect && !props.disabled) finishStroke()
  publishEditorState()
  destroyed = true
  stroke = null
  emit('drawing', false, props.side)
  if (renderTimer !== null) clearTimeout(renderTimer)
})
</script>

<style scoped>
.pixel-editor {
  min-width: 0;
  width: 100%;
}
.canvas-stage {
  width: 256px;
  max-width: 100%;
  margin: 0 auto;
  border: 3px solid #819974;
  box-shadow: 4px 4px 0 #dce4d0;
  background: #fffef8;
}
.canvas-square {
  position: relative;
  height: 0;
  padding-bottom: 100%;
}
.drawing-canvas,
.imported-art {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.drawing-canvas {
  touch-action: none;
  cursor: crosshair;
}
.imported-art {
  image-rendering: pixelated;
  background: #edf0e5;
}
.canvas-hint {
  display: block;
  text-align: center;
  color: #7a8377;
  font-size: 23rpx;
  line-height: 1.6;
  margin: 18rpx 0 24rpx;
}
.paint-colors {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 10rpx;
  padding: 4rpx;
}
.color-swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  height: 58rpx;
  padding: 0;
  border: 2rpx solid #d2d8c7;
  border-radius: 4rpx;
}
.color-swatch.is-selected {
  outline: 4rpx solid #456957;
  outline-offset: 2rpx;
}
.color-dot {
  width: 10rpx;
  height: 10rpx;
  background: #fffef8;
  box-shadow: 0 0 0 2rpx #456957;
}
.editor-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 26rpx;
}
.tool-pair,
.brush-pair {
  display: flex;
  gap: 8rpx;
}
.tool-button,
.brush-button {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 10rpx 14rpx;
  min-height: 72rpx;
  border: 2rpx solid #d6dfcc;
  border-radius: 8rpx;
  color: #53664d;
  background: #f3f5eb;
  font-size: 24rpx;
}
.brush-button {
  width: 58rpx;
  min-width: 0;
  padding: 6rpx;
}
.brush-mark {
  background: currentColor;
}
.tool-button.is-active,
.brush-button.is-active {
  color: #fffef8;
  background: #456957;
  border-color: #456957;
}
.editor-actions {
  display: flex;
  gap: 14rpx;
  margin-top: 18rpx;
}
.editor-action {
  flex: 1;
  padding: 16rpx 10rpx;
  font-size: 25rpx;
}
.wx-b.wx-disabled {
  opacity: 0.45;
}
.color-swatch.wx-disabled {
  color: inherit;
}
.wx-b:focus-visible {
  outline: 3px solid #456957;
  outline-offset: 3px;
}
</style>
