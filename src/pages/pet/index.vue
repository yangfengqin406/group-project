<template>
  <view class="page pet-page">
    <DemoNotice />
    <view class="editor-heading">
      <view>
        <view class="title">我的宠物</view>
        <view class="subtitle">搭配喜欢的样子，一起去广场。</view>
      </view>
      <button class="text-button" :disabled="saving" @tap="leave">
        回到广场
      </button>
    </view>

    <view class="pet-stage">
      <image
        class="stage-background"
        src="/static/plaza/world-phase-one.webp"
        mode="aspectFill"
      />
      <view class="stage-wash"></view>
      <view class="stage-controls">
        <button
          class="preview-action"
          @tap="previewView = previewView === 'front' ? 'back' : 'front'"
        >
          {{ previewView === 'front' ? '看背面' : '看正面' }}
        </button>
        <button
          class="preview-action"
          :aria-pressed="walking"
          @tap="walking = !walking"
        >
          {{ walking ? '停一停' : '试试走路' }}
        </button>
      </view>
      <view class="hero-pet">
        <PetAvatar
          v-if="!missingPreview"
          :appearance="draft"
          :walking="walking"
          :view="previewView"
          :wardrobe="wardrobeState?.equipped"
        />
        <view v-else class="empty-art">
          {{ previewView === 'back' ? '还没有背面' : '画下你的新伙伴' }}
        </view>
      </view>
    </view>

    <view class="pet-identity">
      <view class="pet-nameplate">
        {{
          loaded
            ? draft.name.trim() || '还没起名字'
            : loading
              ? '正在读取…'
              : '尚未读取宠物'
        }}
      </view>
      <view class="stage-caption">
        {{ custom ? '我的原创' : currentSpecies.name }} ·
        {{ previewView === 'front' ? '正面' : '背面' }} ·
        {{ !loaded ? '读取成功后即可搭配' : dirty ? '正在搭配' : '当前伙伴' }}
      </view>
    </view>

    <view class="pond-wardrobe">
      <view>
        <view class="wardrobe-title">装扮我的伙伴</view>
        <text>衣柜里的穿戴会自动保存，回到广场就能看到。</text>
      </view>
      <button :disabled="!loaded || saving || importing" @tap="openWardrobe">
        打开衣柜
      </button>
    </view>
    <view v-if="ornamentError" class="error">
      {{ ornamentError }}
      <button class="secondary" @tap="loadOrnament">重新读取饰品</button>
    </view>
    <view v-if="loading" class="muted load-note">正在读取你的宠物…</view>
    <view v-if="error" class="error" role="alert">{{ error }}</view>
    <button v-if="!loaded && !loading" class="secondary retry" @tap="load">
      重新读取
    </button>

    <view class="creation-modes">
      <button
        :class="{ selected: !custom }"
        :disabled="blocked"
        @tap="chooseMode(false)"
      >
        选伙伴
      </button>
      <button
        :class="{ selected: custom }"
        :disabled="blocked"
        @tap="chooseMode(true)"
      >
        我的原创
      </button>
    </view>
    <view v-if="!custom" class="species-options">
      <button
        v-for="option in templates"
        :key="option.id"
        class="species-option"
        :class="{ selected: draft.species === option.id }"
        :aria-pressed="draft.species === option.id"
        :disabled="!loaded || saving"
        @tap="chooseSpecies(option.id)"
      >
        <view class="mini-pet">
          <PetAvatar :appearance="option.appearance" />
        </view>
        <text>{{ option.name }}</text>
      </button>
    </view>

    <view v-if="custom" class="art-workshop">
      <view class="art-heading">
        <view class="option-heading">把想象里的伙伴画出来</view>
        <button
          class="secondary import-button"
          :disabled="blocked"
          @tap="importPng"
        >
          {{ importing ? '正在读取…' : '导入 PNG' }}
        </button>
      </view>
      <view class="art-sides">
        <button
          v-for="side in [
            { id: 'front', label: '画正面' },
            { id: 'back', label: '画背面' }
          ]"
          :key="side.id"
          :class="{ selected: artView === side.id }"
          :disabled="blocked"
          @tap="selectArtView(side.id)"
        >
          {{ side.label }}
        </button>
      </view>
      <PixelPetEditor
        v-if="!bagOpen && !diveOpen"
        ref="pixelEditor"
        :key="artView + editorVersion"
        :frame="editingFrame"
        :editor-state="editorSessions[artView]"
        :side="artView"
        :disabled="blocked"
        @update:frame="updateFrame"
        @update:editor-state="receiveEditorState"
        @drawing="receiveDrawing"
        @error="error = $event"
      />
      <view class="art-note">
        32 × 32 像素画布，或导入透明背景 PNG（宽高不超过 512 像素，文件不超过
        256 KiB）。正面必填，背面可以以后补画。
      </view>
      <view class="art-note">
        原创画稿会轻轻摇摆着走路；没画背面时，广场只显示正面画稿。正背面各自保留撤销记录，离开前记得保存。
      </view>
    </view>
    <view class="customization">
      <view class="editor-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="editor-tab"
          :class="{ selected: activeTab === tab.id }"
          :aria-pressed="activeTab === tab.id"
          @tap="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </view>
      <view class="options-content">
        <template v-if="activeTab === 'palette'">
          <view class="option-heading">给它挑一种颜色</view>
          <view class="palette-options">
            <button
              v-for="option in paletteOptions"
              :key="option.id"
              class="palette-option"
              :class="{ selected: draft.palette === option.id }"
              :aria-pressed="draft.palette === option.id"
              :disabled="blocked"
              @tap="draft.palette = option.id"
            >
              <view
                class="color-swatch"
                :style="{ backgroundColor: option.color }"
              >
                <text v-if="draft.palette === option.id">✓</text>
              </view>
              <text>{{ option.label }}</text>
            </button>
          </view>
        </template>
        <template v-else-if="activeTab === 'feature'">
          <view class="option-heading">
            {{
              draft.species === 'mushroom'
                ? '小蘑菇，戴哪顶帽子？'
                : '换一对喜欢的耳朵'
            }}
          </view>
          <view class="feature-options">
            <button
              v-for="option in featuresFor(draft.species)"
              :key="option.id"
              class="choice-button"
              :class="{ selected: draft.feature === option.id }"
              :aria-pressed="draft.feature === option.id"
              :disabled="!loaded || saving"
              @tap="draft.feature = option.id"
            >
              {{ option.label }}
            </button>
          </view>
        </template>
        <template v-else-if="activeTab === 'accessory'">
          <view class="option-heading">带一点自己的小心思</view>
          <view class="accessory-options">
            <button
              v-for="option in accessoryOptions"
              :key="option.id"
              class="choice-button"
              :class="{ selected: draft.accessory === option.id }"
              :aria-pressed="draft.accessory === option.id"
              :disabled="!loaded || saving"
              @tap="draft.accessory = option.id"
            >
              {{ option.label }}
            </button>
          </view>
        </template>
        <template v-else>
          <label class="option-heading" for="pet-name">给伙伴起个名字</label>
          <input
            id="pet-name"
            class="input name-input"
            v-model="draft.name"
            placeholder="你想叫它什么？"
            :maxlength="24"
            :disabled="!loaded || saving"
            confirm-type="done"
          />
          <view class="name-hint">
            1～12 个字，保存时会去掉首尾空格。
            <text>{{ nameLength }}/12</text>
          </view>
        </template>
      </view>
    </view>

    <view class="editor-footer">
      <button
        class="secondary restore-button"
        :disabled="blocked || !pendingChanges"
        @tap="restore"
      >
        还原搭配
      </button>
      <button class="primary save-button" :disabled="blocked" @tap="save">
        {{ saving ? '正在保存…' : '保存并去广场' }}
      </button>
    </view>
    <view class="save-note">
      名字、配色、形象和原创画稿需点击“保存并去广场”；衣柜穿戴单独自动保存。
    </view>
    <view class="save-note">
      {{
        config.apiMode === 'mock'
          ? '搭配会保存在当前设备的演示身份下。'
          : custom
            ? '原创宠物暂不支持云端保存，当前修改尚未保存。'
            : '搭配会保存到当前服务的账号中；保存失败时请重试。'
      }}
    </view>
    <FishingPond
      v-if="bagOpen"
      :appearance="draft"
      :wardrobe="wardrobeState?.equipped"
      initial-panel="bag"
      @close="bagOpen = false"
      @wardrobe="receivingWardrobe"
      @dive="openDive"
    />
    <DiveAdventure
      v-if="diveOpen"
      :appearance="draft"
      :wardrobe="wardrobeState?.equipped"
      @close="closeDive"
      @reward="receivingWardrobe"
    />
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import DemoNotice from '../../components/DemoNotice.vue'
import PetAvatar from '../../components/pet/PetAvatar.vue'
import PixelPetEditor from '../../components/pet/PixelPetEditor.vue'
import { blankFrame } from '../../utils/pet-art.js'
import { choosePetPng } from '../../platform/pet-image.js'
import { pet, wardrobe } from '../../services/index.js'
import FishingPond from '../../components/plaza/FishingPond.vue'
import DiveAdventure from '../../components/plaza/DiveAdventure.vue'
import { config } from '../../config/index.js'
import { errorText } from '../../utils/errors.js'
import { session } from '../../utils/session.js'
import { useUnsavedChanges } from '../../utils/use-unsaved-changes.js'
import {
  speciesOptions,
  paletteOptions,
  accessoryOptions,
  featuresFor,
  defaultPet,
  defaultCustomPet,
  clonePet,
  changeSpecies,
  validateAppearance
} from '../../utils/pet-appearance.js'

const draft = ref(defaultPet()),
  saved = ref(defaultPet()),
  loaded = ref(false),
  loading = ref(false),
  saving = ref(false),
  error = ref(''),
  walking = ref(false),
  previewView = ref('front'),
  artView = ref('front'),
  importing = ref(false),
  editorVersion = ref(0),
  activeTab = ref('palette')
const bagOpen = ref(false),
  wardrobeState = ref(null),
  diveOpen = ref(false),
  ornamentError = ref('')
const templates = speciesOptions.map((option) => ({
  ...option,
  appearance: defaultPet(option.id)
}))
const currentSpecies = computed(
  () =>
    speciesOptions.find((option) => option.id === draft.value.species) ||
    speciesOptions[2]
)
const dirty = computed(
  () => JSON.stringify(draft.value) !== JSON.stringify(saved.value)
)
const nameLength = computed(() => Array.from(draft.value.name.trim()).length)
const custom = computed(() => draft.value.species === 'custom')
const blocked = computed(() => !loaded.value || saving.value || importing.value)
const emptyFrame = blankFrame()
const editingFrame = computed(
  () => draft.value.art?.[artView.value] || emptyFrame
)
const missingPreview = computed(() => {
  if (!custom.value) return false
  const frame = draft.value.art?.[previewView.value]
  return !frame || (frame.type === 'pixels' && !frame.pixels.some(Boolean))
})
const tabs = computed(() =>
  custom.value
    ? [{ id: 'name', label: '名字' }]
    : [
        { id: 'palette', label: '配色' },
        {
          id: 'feature',
          label: draft.value.species === 'mushroom' ? '帽型' : '耳朵'
        },
        { id: 'accessory', label: '配饰' },
        { id: 'name', label: '名字' }
      ]
)
let revision = 0
let ornamentRevision = 0
let confirmingLeave = false
function openDive() {
  if (!flushEditor()) return
  bagOpen.value = false
  diveOpen.value = true
}
function openWardrobe() {
  if (blocked.value || !flushEditor()) return
  bagOpen.value = true
}
function closeDive() {
  diveOpen.value = false
  loadOrnament()
}
function receivingWardrobe(state) {
  ornamentRevision++
  wardrobeState.value = state
  ornamentError.value = ''
}
async function loadOrnament() {
  const current = ++ornamentRevision
  ornamentError.value = ''
  try {
    const state = await wardrobe.getState()
    if (current === ornamentRevision) receivingWardrobe(state)
  } catch (e) {
    if (current === ornamentRevision)
      ornamentError.value = `衣柜暂未读出：${errorText(e)}`
  }
}
const presetDraft = ref(defaultPet())
const customDraft = ref(defaultCustomPet())
const editorSessions = ref({ front: null, back: null })
const pixelEditor = ref(null)
const editorDrawing = ref(false)
const leaving = ref(false)
const presetBaseline = ref(JSON.stringify(presetDraft.value))
const customBaseline = ref(JSON.stringify(customDraft.value))
const pendingChanges = computed(
  () =>
    editorDrawing.value ||
    dirty.value ||
    JSON.stringify(presetDraft.value) !== presetBaseline.value ||
    JSON.stringify(customDraft.value) !== customBaseline.value
)
useUnsavedChanges(computed(() => loaded.value && pendingChanges.value && !leaving.value), {
  title: '离开未保存的搭配？',
  content: '名字、外观和原创画稿还没有保存。离开后将放弃这些修改；衣柜穿戴已自动保存。',
  cancelText: '继续搭配',
  nativeMessage: '还有未保存的搭配或画稿，返回后会丢失。'
})
function rememberDraft() {
  if (custom.value) customDraft.value = clonePet(draft.value)
  else presetDraft.value = clonePet(draft.value)
}
function flushEditor() {
  if (pixelEditor.value?.flush?.() === false) {
    error.value = '正在收好这一笔，请稍后再试。'
    return false
  }
  return true
}
function receiveDrawing(drawing, side) {
  if (side === artView.value) editorDrawing.value = drawing
}
function chooseMode(isCustom) {
  if (blocked.value || isCustom === custom.value) return
  if (!flushEditor()) return
  rememberDraft()
  draft.value = clonePet(isCustom ? customDraft.value : presetDraft.value)
  activeTab.value = isCustom ? 'name' : 'palette'
  previewView.value = 'front'
  artView.value = 'front'
  editorVersion.value++
  error.value = ''
}
function selectArtView(side) {
  if (blocked.value || !flushEditor()) return
  artView.value = side
  previewView.value = side
}
function updateFrame(frame, side = artView.value) {
  if (!loaded.value || saving.value || !custom.value) return
  draft.value.art[side] = frame
  previewView.value = side
}
function receiveEditorState(state, side = artView.value) {
  if (!loaded.value || saving.value || !custom.value) return
  if (state.frameSignature !== JSON.stringify(draft.value.art[side] || emptyFrame)) return
  editorSessions.value[side] = JSON.parse(JSON.stringify(state))
}
async function importPng() {
  if (blocked.value || !flushEditor()) return
  importing.value = true
  error.value = ''
  const current = revision
  const userId = session.user?.id
  const side = artView.value
  try {
    const frame = await choosePetPng()
    if (current !== revision || userId !== session.user?.id || !frame) return
    editorSessions.value[side] = null
    draft.value.art[side] = frame
    previewView.value = side
    editorVersion.value++
  } catch (e) {
    if (current === revision && userId === session.user?.id) error.value = errorText(e)
  } finally {
    if (current === revision) importing.value = false
  }
}

async function load() {
  const current = ++revision
  const userId = session.user?.id
  loading.value = true
  loaded.value = false
  error.value = ''
  try {
    const appearance = await pet.get()
    if (current !== revision || userId !== session.user?.id) return
    presetDraft.value = defaultPet()
    customDraft.value = defaultCustomPet()
    editorSessions.value = { front: null, back: null }
    editorDrawing.value = false
    saved.value = clonePet(appearance)
    draft.value = clonePet(appearance)
    rememberDraft()
    presetBaseline.value = JSON.stringify(presetDraft.value)
    customBaseline.value = JSON.stringify(customDraft.value)
    activeTab.value = custom.value ? 'name' : 'palette'
    loaded.value = true
  } catch (e) {
    if (current === revision) error.value = errorText(e)
  } finally {
    if (current === revision) loading.value = false
  }
}
function chooseSpecies(species) {
  draft.value = changeSpecies(draft.value, species)
}
function applyRestore() {
  draft.value = clonePet(saved.value)
  presetDraft.value = custom.value ? defaultPet() : clonePet(draft.value)
  customDraft.value = custom.value ? clonePet(draft.value) : defaultCustomPet()
  presetBaseline.value = JSON.stringify(presetDraft.value)
  customBaseline.value = JSON.stringify(customDraft.value)
  activeTab.value = custom.value ? 'name' : 'palette'
  editorSessions.value = { front: null, back: null }
  editorDrawing.value = false
  editorVersion.value++
  error.value = ''
}
function restore() {
  if (blocked.value || !pendingChanges.value) return
  if (!flushEditor()) return
  const current = revision
  const userId = session.user?.id
  uni.showModal({
    title: '还原到上次保存的样子？',
    content: '本次名字、搭配与正背面画稿的未保存修改会被放弃。衣柜已保存的穿戴不受影响。',
    confirmText: '还原搭配',
    cancelText: '继续创作',
    success(result) {
      if (result.confirm && !blocked.value && current === revision && userId === session.user?.id)
        applyRestore()
    }
  })
}
function returnToPlaza() {
  leaving.value = true
  uni.switchTab({
    url: '/pages/plaza/index',
    fail() { leaving.value = false }
  })
}
function leave() {
  if (saving.value || leaving.value || confirmingLeave) return
  if (!flushEditor()) return
  if (!pendingChanges.value) return returnToPlaza()
  const current = revision
  const userId = session.user?.id
  confirmingLeave = true
  uni.showModal({
    title: '还没有保存搭配',
    content: '未保存的名字、形象与原创画稿会丢失。衣柜穿戴已单独保存。',
    confirmText: '放弃修改',
    cancelText: '继续搭配',
    success: (result) => {
      confirmingLeave = false
      if (result.confirm && current === revision && userId === session.user?.id) returnToPlaza()
    },
    fail() { confirmingLeave = false }
  })
}
async function save() {
  if (blocked.value || !flushEditor()) return
  saving.value = true
  error.value = ''
  const current = revision
  const userId = session.user?.id
  try {
    const appearance = await pet.save(validateAppearance(draft.value))
    if (current !== revision || userId !== session.user?.id) return
    saved.value = clonePet(appearance)
    draft.value = clonePet(appearance)
    // Saving the selected mode completes this visit; both cached modes are now
    // treated as the page baseline if navigation fails, rather than prompting
    // a second time for a mode the user did not choose to save.
    rememberDraft()
    presetBaseline.value = JSON.stringify(presetDraft.value)
    customBaseline.value = JSON.stringify(customDraft.value)
    returnToPlaza()
  } catch (e) {
    if (current === revision && userId === session.user?.id) error.value = errorText(e)
  } finally {
    if (current === revision) saving.value = false
  }
}
// Use Vue's queued watcher: mock requests refresh the same session synchronously.
// A sync callback would re-enter before Vue commits the watched ID. Captured
// account IDs and revisions still reject old responses before they touch drafts.
watch(() => session.user?.id, () => {
  revision++
  ornamentRevision++
  loaded.value = false
  loading.value = false
  saving.value = false
  importing.value = false
  leaving.value = false
  confirmingLeave = false
  bagOpen.value = false
  diveOpen.value = false
  draft.value = defaultPet()
  saved.value = defaultPet()
  presetDraft.value = defaultPet()
  customDraft.value = defaultCustomPet()
  editorSessions.value = { front: null, back: null }
  editorDrawing.value = false
  wardrobeState.value = null
  load()
  loadOrnament()
})
onLoad(() => {
  load()
  loadOrnament()
})
onUnload(() => {
  revision++
  ornamentRevision++
})
</script>

<style scoped>
.pet-page {
  max-width: 900px;
  padding-bottom: 52rpx;
}
.pond-wardrobe {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 14px 0;
  padding: 12px 14px;
  background: #e9efdf;
  border-radius: 12px;
  color: #76866d;
  font-size: 11px;
}
.wardrobe-title {
  color: #4b694f;
  font-size: 14px;
  font-weight: 650;
  margin-bottom: 4px;
}
.pond-wardrobe button {
  min-height: 44px;
  padding: 9px 12px;
  background: #fffdf0;
  color: #456957;
  font-size: 12px;
  border-radius: 10px;
  flex-shrink: 0;
}
button {
  margin: 0;
  font-size: 25rpx;
  line-height: 1.4;
}
button::after {
  border: 0;
}
button:focus-visible {
  outline: 2px solid #456957;
  outline-offset: 3px;
}
.editor-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 24rpx;
}
.editor-heading .title {
  font-size: 40rpx;
  letter-spacing: 0;
}
.text-button {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 4rpx;
  color: #456957;
  background: transparent;
  font-size: 24rpx;
  flex-shrink: 0;
}
.pet-stage {
  position: relative;
  height: 410rpx;
  min-height: 210px;
  max-height: 320px;
  overflow: hidden;
  border-radius: 30rpx 30rpx 16rpx 16rpx;
  background: #e5ebd6;
}
.stage-background {
  position: absolute;
  width: 160%;
  height: 180%;
  left: -30%;
  top: -48%;
  opacity: 0.72;
}
.stage-wash {
  position: absolute;
  inset: 0;
  background: #fff8e542;
}
.stage-controls {
  position: absolute;
  z-index: 2;
  inset: 12rpx 16rpx auto;
  display: flex;
  justify-content: space-between;
}
.preview-action {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 18rpx;
  border-radius: 40rpx;
  color: #3d5844;
  background: #fffef8e8;
  font-size: 23rpx;
}
.hero-pet {
  position: absolute;
  width: 220rpx;
  height: 250rpx;
  max-width: 180px;
  max-height: 200px;
  left: 50%;
  top: 57%;
  transform: translate(-50%, -50%);
}
.pet-nameplate {
  display: inline-block;
  max-width: 80%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 8rpx 28rpx;
  color: #334d3d;
  background: #fffef8ed;
  border-radius: 10rpx;
  font-size: 30rpx;
  font-weight: 650;
}
.stage-caption {
  width: 100%;
  text-align: center;
  font-size: 22rpx;
  color: #3b543f;
}
.pet-identity {
  padding: 10px 0 4px;
  text-align: center;
}
.empty-art {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #456957;
  font-size: 16px;
  text-align: center;
}
.creation-modes,
.art-sides {
  display: flex;
  gap: 8px;
  margin: 14px 0;
}
.creation-modes button,
.art-sides button {
  flex: 1;
  min-height: 44px;
  padding: 10px;
  background: #edf0e5;
  color: #52664f;
  border: 1px solid #dce3d1;
  border-radius: 12px;
  font-size: 14px;
}
.creation-modes .selected,
.art-sides .selected {
  background: #456957;
  color: #fffef8;
  border-color: #456957;
}
.art-workshop {
  margin-bottom: 18px;
  padding: 16px;
  background: #fffef8;
  border-radius: 16px;
  border: 1px solid #dce3d1;
}
.art-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.art-heading .option-heading {
  margin: 0;
}
.import-button {
  min-height: 44px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  flex-shrink: 0;
}
.art-note {
  color: #78816f;
  font-size: 12px;
  line-height: 1.7;
  margin-top: 10px;
}
.load-note {
  margin-top: 14rpx;
}
.species-options {
  display: flex;
  gap: 10rpx;
  margin: 22rpx 0 26rpx;
}
.species-option {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 14rpx 4rpx;
  border: 2rpx solid #dce3d1;
  border-radius: 16rpx;
  color: #65705d;
  background: #fffef8;
  font-size: 22rpx;
}
.species-option.selected {
  background: #e5eddc;
  border-color: #78976b;
  color: #304a3a;
  font-weight: 650;
}
.mini-pet {
  width: 84rpx;
  height: 94rpx;
}
.customization {
  background: #fffef8;
  border: 2rpx solid #dce3d1;
  border-radius: 18rpx;
  overflow: hidden;
}
.editor-tabs {
  display: flex;
  border-bottom: 2rpx solid #e1e5d6;
}
.editor-tab {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 44px;
  border-radius: 0;
  padding: 14rpx 6rpx;
  background: transparent;
  color: #78816f;
  border-bottom: 4rpx solid transparent;
}
.editor-tab.selected {
  border-bottom-color: #456957;
  color: #304a3a;
  font-weight: 650;
  background: #edf2e6;
}
.options-content {
  padding: 22rpx 24rpx 26rpx;
  min-height: 205rpx;
}
.option-heading {
  display: block;
  color: #52664f;
  font-size: 25rpx;
  margin-bottom: 18rpx;
}
.palette-options {
  display: flex;
  gap: 12rpx;
}
.palette-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 4rpx;
  background: transparent;
  color: #7a8377;
  font-size: 22rpx;
}
.color-swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 74rpx;
  height: 74rpx;
  min-width: 36px;
  min-height: 36px;
  border-radius: 50%;
  border: 5rpx solid #fffef8;
  box-shadow: 0 0 0 2rpx #e1e5d6;
  color: #304a3a;
  font-size: 32rpx;
}
.palette-option.selected .color-swatch {
  box-shadow: 0 0 0 3rpx #6c8e5b;
}
.palette-option.selected {
  color: #304a3a;
}
.feature-options,
.accessory-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.choice-button {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 44px;
  padding: 12rpx 20rpx;
  border-radius: 12rpx;
  background: #f0f2e8;
  color: #52664f;
  border: 2rpx solid transparent;
}
.choice-button.selected {
  color: #304a3a;
  background: #e2ecd7;
  border-color: #78976b;
}
.name-input {
  min-height: 44px;
}
.name-hint {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 12rpx;
  font-size: 21rpx;
  color: #78816f;
}
.editor-footer {
  display: flex;
  gap: 14rpx;
  margin-top: 24rpx;
}
.editor-footer button {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 44px;
  border-radius: 12rpx;
  padding: 18rpx 20rpx;
}
.restore-button {
  flex: 1;
}
.save-button {
  flex: 1.8;
}
.save-note {
  margin-top: 16rpx;
  text-align: center;
  font-size: 22rpx;
  line-height: 1.7;
  color: #78816f;
}
.retry {
  min-height: 44px;
  border-radius: 12rpx;
}
@media (min-width: 800px) {
  .pet-stage {
    height: 320px;
  }
  .hero-pet {
    width: 180px;
    height: 200px;
  }
  .species-option {
    flex-direction: row;
    justify-content: center;
    gap: 18px;
  }
  .mini-pet {
    width: 50px;
    height: 58px;
  }
}
</style>
