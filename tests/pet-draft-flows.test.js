import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ref, reactive, computed, watch, nextTick, toRaw } from 'vue'
import * as appearance from '../src/utils/pet-appearance.js'
import { ART_COLORS, ART_SIZE, blankFrame, validateArtFrame } from '../src/utils/pet-art.js'

const script = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  .match(/<script setup>([\s\S]*?)<\/script>/)[1]
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
const flush = async () => { await nextTick(); await nextTick() }
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function petPage(overrides = {}) {
  const hooks = { load: [], unload: [], show: [] }
  const modals = [], routes = []
  const session = overrides.session || reactive({ user: { id: 'a' } })
  let guarded
  const context = vm.createContext({
    ref, reactive, computed, watch, ...appearance, blankFrame, session,
    config: { apiMode: 'mock' }, errorText: (error) => error.message,
    onLoad: (fn) => hooks.load.push(fn), onUnload: (fn) => hooks.unload.push(fn),
    onShow: (fn) => hooks.show.push(fn),
    useUnsavedChanges: (dirty) => { guarded = dirty },
    pet: { get: async () => appearance.defaultPet(), save: async (value) => value },
    wardrobe: { getState: async () => ({ equipped: {} }) },
    choosePetPng: async () => null,
    uni: { showModal: (options) => modals.push(options), switchTab: (options) => routes.push(options) },
    ...overrides
  })
  vm.runInContext(`${script('pages/pet/index.vue')}\nglobalThis.subject = {
    draft, saved, loaded, loading, saving, importing, pendingChanges, artView,
    chooseMode, selectArtView, updateFrame, load, importPng, save, leave, restore,
    editorSessions, receiveEditorState,
    pixelEditor: typeof pixelEditor === 'undefined' ? null : pixelEditor,
    receiveDrawing: typeof receiveDrawing === 'undefined' ? null : receiveDrawing,
    openWardrobe: typeof openWardrobe === 'undefined' ? null : openWardrobe,
    bagOpen
  }`, context)
  return { ...context.subject, session, hooks, modals, routes, dirty: () => guarded?.value }
}

// Real editor script, controlled canvas bridge. The parent retains emitted UI
// sessions, just as it does while a WeChat canvas is temporarily unmounted.
async function editor(state, side, page = null, { delayStrokeMeasure = false } = {}) {
  const props = reactive({ frame: state[side].frame, editorState: state[side].editorState, side, disabled: false })
  const hooks = { unmount: [] }
  let measureCount = 0, pendingMeasure
  const measuredRect = { left: 0, top: 0, width: 320, height: 320 }
  const canvas = { clearRect() {}, setFillStyle() {}, fillRect() {}, draw(_, done) { done() } }
  const query = { in() { return this }, select() { return this },
    boundingClientRect(done) {
      if (delayStrokeMeasure && ++measureCount > 1) pendingMeasure = () => done(measuredRect)
      else done(measuredRect)
      return this
    }, exec() {} }
  const context = vm.createContext({
    ref, computed, watch, nextTick, toRaw, ART_COLORS, ART_SIZE, blankFrame, validateArtFrame,
    defineProps: () => props,
    defineEmits: () => (event, value, emittedSide = side) => {
      if (event === 'update:frame') {
        state[side].frame = value; props.frame = value
        page?.updateFrame(value, emittedSide)
      }
      if (event === 'update:editorState') {
        state[side].editorState = value; props.editorState = value
        page?.receiveEditorState(value, emittedSide)
      }
      if (event === 'drawing') page?.receiveDrawing?.(value, emittedSide)
    },
    defineExpose: (value) => { if (page?.pixelEditor) page.pixelEditor.value = value },
    getCurrentInstance: () => ({ uid: Math.random(), proxy: {} }),
    onMounted() {}, onReady() {}, onBeforeUnmount: (fn) => hooks.unmount.push(fn),
    setTimeout: () => 1, clearTimeout() {},
    uni: { createCanvasContext: () => canvas, createSelectorQuery: () => query }
  })
  vm.runInContext(`${script('components/pet/PixelPetEditor.vue')}\nglobalThis.subject = {
    pixels, undoStack, startMouse, finishMouse, startTouch, undo
  }`, context)
  await flush()
  return { ...context.subject,
    resolveMeasure: () => pendingMeasure?.(),
    unmount: () => hooks.unmount.forEach((fn) => fn()) }
}
const paint = async (subject, x) => {
  subject.startMouse({ clientX: x * 10 + 5, clientY: 5, button: 0 })
  subject.finishMouse()
  await flush()
}

test('宠物命名/双模式草稿加入统一离开保护；取消离开保留，确认只导航一次', async () => {
  const page = petPage()
  await page.load()
  assert.equal(page.dirty(), false)
  page.draft.value.name = '未保存名字'
  assert.equal(page.dirty(), true)
  page.chooseMode(true)
  assert.equal(page.dirty(), true)
  page.leave()
  assert.equal(page.routes.length, 0)
  page.modals[0].success({ confirm: false })
  assert.equal(page.dirty(), true)
  page.leave()
  page.modals[1].success({ confirm: true })
  assert.equal(page.routes.length, 1)
  assert.equal(page.dirty(), false)
})

test('还原前确认，取消保留原创草稿，确认恢复已保存外观', async () => {
  const page = petPage()
  await page.load()
  page.chooseMode(true)
  const frame = blankFrame(); frame.pixels[0] = ART_COLORS[0]
  page.updateFrame(frame)
  page.restore()
  assert.equal(page.draft.value.species, 'custom')
  assert.equal(page.modals.length, 1)
  page.modals[0].success({ confirm: false })
  assert.equal(page.draft.value.art.front.pixels[0], ART_COLORS[0])
  page.restore()
  page.modals[1].success({ confirm: true })
  assert.equal(page.draft.value.species, 'rabbit')
  assert.equal(page.dirty(), false)
})

test('正背面撤销独立，反复切面和衣柜重建画布后仍可撤销到原画', async () => {
  const state = { front: { frame: blankFrame() }, back: { frame: blankFrame() } }
  let front = await editor(state, 'front')
  await paint(front, 0); await paint(front, 1)
  front.unmount()
  const back = await editor(state, 'back')
  await paint(back, 2)
  back.unmount()
  front = await editor(state, 'front')
  front.undo(); await flush()
  assert.equal(state.front.frame.pixels[0], ART_COLORS[5])
  assert.equal(state.front.frame.pixels[1], null)
  assert.equal(state.back.frame.pixels[2], ART_COLORS[5])
  front.unmount()
  const rebuilt = await editor(state, 'front')
  rebuilt.undo(); await flush()
  assert.ok(state.front.frame.pixels.every((color) => color === null))
  rebuilt.unmount()
  const rear = await editor(state, 'back')
  rear.undo(); await flush()
  assert.ok(state.back.frame.pixels.every((color) => color === null))
  rear.unmount()
})

test('PNG选择期间换身份，迟到结果不能覆盖新身份草稿；保存迟到也不能导航', async () => {
  const picker = deferred()
  const saving = deferred()
  const page = petPage({ choosePetPng: () => picker.promise,
    pet: { get: async () => appearance.defaultPet(), save: () => saving.promise } })
  await page.load(); page.chooseMode(true)
  const importing = page.importPng()
  page.session.user = { id: 'b' }
  await flush()
  const imported = blankFrame(); imported.pixels[1] = ART_COLORS[0]
  picker.resolve(imported); await importing
  assert.notEqual(page.draft.value.art?.front?.pixels[1], ART_COLORS[0])
  await page.load()
  page.draft.value.name = '账号B的新名字'
  const pendingSave = page.save()
  page.session.user = { id: 'c' }
  await flush()
  saving.resolve(appearance.defaultPet())
  await pendingSave
  assert.equal(page.routes.length, 0)
})

test('保存当前搭配后统一保护解除；导航失败时已保存结果保持，不误报丢稿', async () => {
  const page = petPage()
  await page.load()
  page.chooseMode(true)
  page.draft.value.name = '暂存另一种创作'
  page.chooseMode(false)
  page.draft.value.name = '已保存名字'
  await page.save()
  assert.equal(page.routes.length, 1)
  assert.equal(page.dirty(), false)
  page.routes[0].fail?.()
  assert.equal(page.dirty(), false)
  assert.equal(page.draft.value.name, '已保存名字')
})

test('页面双模式缓存保留对应面的撤销会话，还原后清除，不复用旧画历史', async () => {
  const page = petPage()
  await page.load(); page.chooseMode(true)
  const front = blankFrame(); front.pixels[0] = ART_COLORS[1]
  page.updateFrame(front, 'front')
  const history = { frameSignature: JSON.stringify(front), undoStack: [blankFrame().pixels] }
  page.receiveEditorState(history, 'front')
  // Copies belong to the page; a destroyed editor cannot mutate its old history.
  history.undoStack[0][0] = ART_COLORS[2]
  assert.equal(page.editorSessions.value.front.undoStack[0][0], null)
  page.chooseMode(false); page.chooseMode(true); page.selectArtView('back')
  assert.equal(page.draft.value.art.front.pixels[0], ART_COLORS[1])
  assert.equal(page.editorSessions.value.front.undoStack.length, 1)
  assert.equal(page.editorSessions.value.back, null)
  page.receiveEditorState({ frameSignature: 'different drawing', undoStack: [] }, 'front')
  assert.equal(page.editorSessions.value.front.undoStack.length, 1)
  page.restore(); page.modals[0].success({ confirm: true })
  assert.equal(page.editorSessions.value.front, null)
})

test('新导入帧与旧会话不同，不允许撤销串回另一张画', async () => {
  const original = blankFrame(); original.pixels[0] = ART_COLORS[1]
  const replacement = blankFrame(); replacement.pixels[4] = ART_COLORS[2]
  const state = { front: { frame: replacement, editorState: {
    frameSignature: JSON.stringify(original), undoStack: [blankFrame().pixels]
  } } }
  const subject = await editor(state, 'front')
  subject.undo(); await flush()
  assert.equal(subject.undoStack.value.length, 0)
  assert.equal(subject.pixels.value[4], ART_COLORS[2])
  assert.equal(subject.pixels.value[0], null)
  subject.unmount()
})

test('未保存离开的确认不会叠加；跳转失败重新开启保护', async () => {
  const page = petPage()
  await page.load()
  page.draft.value.name = '尚未保存'
  page.leave(); page.leave()
  assert.equal(page.modals.length, 1)
  page.modals[0].success({ confirm: true })
  assert.equal(page.dirty(), false)
  page.routes[0].fail()
  assert.equal(page.dirty(), true)
  page.leave()
  assert.equal(page.modals.length, 2)
})

test('连续绘画撤销最多保留20步，重建后仍保留同样的撤销范围', async () => {
  const state = { front: { frame: blankFrame() } }
  const subject = await editor(state, 'front')
  for (let index = 0; index < 25; index++) await paint(subject, index)
  assert.equal(subject.undoStack.value.length, 20)
  subject.unmount()
  const rebuilt = await editor(state, 'front')
  for (let index = 0; index < 21; index++) { rebuilt.undo(); await flush() }
  assert.equal(rebuilt.undoStack.value.length, 0)
  assert.equal(rebuilt.pixels.value.filter(Boolean).length, 5)
  rebuilt.unmount()
})

test('一根手指画画未松手、另一根切模式，父页先接收最后一笔再缓存，回原创可撤销', async () => {
  const page = petPage()
  await page.load(); page.chooseMode(true)
  const state = { front: { frame: page.draft.value.art.front } }
  const subject = await editor(state, 'front', page)
  subject.startTouch({ touches: [{ clientX: 5, clientY: 5 }] })
  assert.equal(subject.pixels.value[0], ART_COLORS[5])
  page.chooseMode(false)
  subject.unmount()
  page.chooseMode(true)
  assert.equal(page.draft.value.art.front.pixels[0], ART_COLORS[5])
  assert.equal(page.editorSessions.value.front.undoStack.length, 1)
  const rebuilt = await editor({ front: {
    frame: page.draft.value.art.front, editorState: page.editorSessions.value.front
  } }, 'front', page)
  rebuilt.undo(); await flush()
  assert.equal(page.draft.value.art.front.pixels[0], null)
  rebuilt.unmount()
})

test('未松手保存先收好笔画，服务收到最后一笔；已保存原创的首笔也立即启用离开保护', async () => {
  const existing = appearance.defaultCustomPet()
  existing.art.front.pixels[4] = ART_COLORS[0]
  let submitted
  const page = petPage({ pet: { get: async () => existing,
    save: async (value) => { submitted = value; return value } } })
  await page.load()
  const subject = await editor({ front: { frame: page.draft.value.art.front } }, 'front', page)
  assert.equal(page.dirty(), false)
  subject.startTouch({ touches: [{ clientX: 5, clientY: 5 }] })
  assert.equal(page.dirty(), true)
  await page.save()
  assert.equal(submitted.art.front.pixels[0], ART_COLORS[5])
  assert.equal(page.routes.length, 1)
  subject.unmount()
})

for (const boundary of ['face', 'wardrobe', 'import', 'leave']) {
  test(`未松手${boundary}边界先接收对应面的最后一笔，取消选择或离开保留画稿`, async () => {
    const page = petPage()
    await page.load(); page.chooseMode(true)
    const subject = await editor({ front: { frame: page.draft.value.art.front } }, 'front', page)
    subject.startTouch({ touches: [{ clientX: 5, clientY: 5 }] })
    if (boundary === 'face') page.selectArtView('back')
    if (boundary === 'wardrobe') page.openWardrobe()
    if (boundary === 'import') await page.importPng() // Cancel picker.
    if (boundary === 'leave') { page.leave(); page.modals[0].success({ confirm: false }) }
    assert.equal(page.draft.value.art.front.pixels[0], ART_COLORS[5])
    assert.equal(page.editorSessions.value.front.undoStack.length, 1)
    assert.equal(page.routes.length, 0)
    subject.unmount()
  })
}

test('画布桥尚在测量时保持当前面和离开保护，回调完成后再允许模式切换', async () => {
  const existing = appearance.defaultCustomPet()
  existing.art.front.pixels[4] = ART_COLORS[0]
  const page = petPage({ pet: { get: async () => existing } })
  await page.load()
  const subject = await editor({ front: { frame: page.draft.value.art.front } }, 'front', page,
    { delayStrokeMeasure: true })
  subject.startTouch({ touches: [{ clientX: 5, clientY: 5 }] })
  assert.equal(page.dirty(), true)
  page.chooseMode(false)
  assert.equal(page.draft.value.species, 'custom')
  assert.equal(page.dirty(), true)
  subject.resolveMeasure(); await flush()
  assert.equal(page.draft.value.art.front.pixels[0], ART_COLORS[5])
  page.chooseMode(false); subject.unmount(); page.chooseMode(true)
  assert.equal(page.draft.value.art.front.pixels[0], ART_COLORS[5])
  assert.equal(page.editorSessions.value.front.undoStack.length, 1)
})

test('冷启动服务同步恢复身份，不会重入身份监听造成递归读取', async () => {
  const session = reactive({ user: null })
  let reads = 0
  const page = petPage({ session, pet: { get: async () => {
    // mockRequest refreshes session synchronously before returning its promise.
    // Bound the fixture so broken synchronous watchers fail without overflowing
    // the test runner's own stack.
    if (++reads > 6) throw new Error('身份监听递归读取')
    session.user = { id: 'a' }
    return appearance.defaultPet()
  } } })
  await page.load(); await flush()
  assert.ok(reads <= 2, `冷启动读取次数为 ${reads}`)
  assert.equal(page.loaded.value, true)
  assert.equal(page.draft.value.species, 'rabbit')
})

test('衣柜读取同步刷新同一身份，也不会使换账号监听递归触发', async () => {
  const session = reactive({ user: { id: 'a' } })
  let wardrobeReads = 0
  const page = petPage({ session, wardrobe: { getState: async () => {
    if (++wardrobeReads > 6) throw new Error('衣柜身份刷新递归')
    session.user = { id: 'b' }
    return { equipped: {} }
  } } })
  await page.load()
  session.user = { id: 'b' }
  await flush()
  assert.ok(wardrobeReads <= 1, `衣柜读取次数为 ${wardrobeReads}`)
  assert.equal(page.loaded.value, true)
})
