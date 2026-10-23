import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { computed, ref } from 'vue'
import { createDiveGame, DIVE_LEVELS, DIVE_STEP_MS } from '../src/utils/dive-game.js'
import { WARDROBE_ITEMS } from '../src/utils/wardrobe-catalog.js'

const flush = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}
// Execute the actual page/component scripts with controlled lifecycle and clocks.
function component(path, names, extra = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    .match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const hooks = Object.fromEntries(
    ['Show', 'Hide', 'Unload', 'Mounted', 'Unmounted'].map((name) => [name, []])
  )
  const query = {
    in() { return this },
    select() { return this },
    boundingClientRect() { return this },
    exec() {}
  }
  const context = vm.createContext({
    ref,
    computed,
    nextTick: (callback) => Promise.resolve().then(() => callback?.()),
    ...Object.fromEntries(Object.entries(hooks).map(([name, callbacks]) => [
      `on${name}`, (callback) => callbacks.push(callback)
    ])),
    config: { apiMode: 'mock' },
    errorText: (error) => error.message,
    formatTime: (value) => value,
    pet: { get: async () => ({ name: '测试伙伴' }) },
    wardrobe: { getState: async () => ({ equipped: {} }) },
    bulletin: { list: async () => ({ items: [], nextCursor: null }) },
    isPlazaWelcomeDismissed: () => false,
    dismissPlazaWelcome: () => {},
    defineProps: () => ({}),
    defineEmits: () => () => {},
    getCurrentInstance: () => ({ proxy: {} }),
    uni: {
      hideTabBar() {},
      showTabBar() {},
      onWindowResize() {},
      offWindowResize() {},
      getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
      createSelectorQuery: () => query
    },
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {} },
    ...extra
  })
  vm.runInContext(`${source}\nglobalThis.subject = { ${names.join(', ')} }`, context, {
    filename: path
  })
  return {
    ...context.subject,
    lifecycle: (name) => hooks[name].forEach((callback) => callback())
  }
}
const plaza = () => component('src/pages/plaza/index.vue', [
  'active', 'pondOpen', 'diveOpen', 'openPond', 'openDive'
])

for (const kind of ['pond', 'dive']) {
  test(`广场隐藏后保留${kind}弹层，返回仍可继续，卸载才清理`, async () => {
    const page = plaza()
    page.lifecycle('Show')
    await flush()
    page[kind === 'pond' ? 'openPond' : 'openDive']()
    assert.equal(page[`${kind}Open`].value, true)
    page.lifecycle('Hide')
    assert.equal(page.active.value, false)
    assert.equal(page[`${kind}Open`].value, true)
    page.lifecycle('Show')
    await flush()
    assert.equal(page.active.value, true)
    assert.equal(page[`${kind}Open`].value, true)
    page.lifecycle('Unload')
    assert.equal(page.active.value, false)
    assert.equal(page[`${kind}Open`].value, false)
  })
}

test('潜水切后台停止时钟，返回保持暂停，明确继续后沿本局运行且不发奖', async () => {
  const page = plaza()
  const clocks = new Map()
  let clockId = 0
  let starts = 0
  let finishes = 0
  const adventure = component('src/components/plaza/DiveAdventure.vue', [
    'active', 'paused', 'gameState', 'startLevel', 'resume'
  ], {
    createDiveGame,
    DIVE_LEVELS,
    DIVE_STEP_MS,
    WARDROBE_ITEMS,
    setInterval(callback) {
      clocks.set(++clockId, callback)
      return clockId
    },
    clearInterval: (id) => clocks.delete(id),
    dive: {
      getState: async () => ({ unlockedLevel: 1, clearedLevels: [] }),
      start: async () => {
        starts++
        return { id: 'retained-run', seed: 23, expiresAt: Date.now() + 600000 }
      },
      finish: async () => { finishes++ }
    }
  })
  page.lifecycle('Show')
  page.openDive()
  adventure.lifecycle('Mounted')
  await flush()
  await adventure.startLevel(1)
  await flush()
  assert.equal(clocks.size, 1)
  for (const callback of clocks.values()) callback()
  const beforeHide = adventure.gameState.value.tick
  assert.ok(beforeHide > 0)
  page.lifecycle('Hide')
  adventure.lifecycle('Hide')
  assert.equal(page.diveOpen.value, true, '不能卸载保存本局的子组件')
  assert.equal(adventure.active.value, false)
  assert.equal(adventure.paused.value, true)
  assert.equal(clocks.size, 0)
  page.lifecycle('Show')
  adventure.lifecycle('Show')
  await flush()
  assert.equal(adventure.paused.value, true)
  assert.equal(adventure.gameState.value.tick, beforeHide)
  assert.equal(clocks.size, 0)
  adventure.resume()
  assert.equal(clocks.size, 1)
  for (const callback of clocks.values()) callback()
  assert.equal(adventure.gameState.value.tick, beforeHide + 1)
  assert.equal(starts, 1)
  assert.equal(finishes, 0)
  page.lifecycle('Unload')
  adventure.lifecycle('Unmounted')
  assert.equal(page.diveOpen.value, false)
  assert.equal(clocks.size, 0)
})
