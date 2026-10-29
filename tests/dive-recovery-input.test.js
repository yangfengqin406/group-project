import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { createSeed } from '../src/mock/seed.js'
import { dispatchDive } from '../src/mock/dive.js'
import { getWardrobeState } from '../src/mock/wardrobe.js'
import { createDiveGame, DIVE_LEVELS, DIVE_STEP_MS, DIVE_RULES_VERSION } from '../src/utils/dive-game.js'
import { WARDROBE_ITEMS } from '../src/utils/wardrobe-catalog.js'

const owner = 'user_demo_a'
const startedAt = Date.parse('2026-10-24T12:00:00+08:00')
const flush = async () => {
  for (let index = 0; index < 20; index++) await Promise.resolve()
  await nextTick()
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const touch = (identifier, x, y) => ({ identifier, clientX: x, clientY: y })
const event = (touches, changedTouches) => ({ touches, changedTouches })
const audioSpy = () => {
  const events = []
  return { events, state: {}, unlock: () => events.push('unlock'),
    setScene: (value) => events.push(value), setPaused: (value) => events.push(value ? 'paused' : 'resumed'),
    effect: (value) => events.push(value) }
}
const route = [[22, 54], [22, 60], [49, 60], [49, 42], [76, 42], [76, 21], [91, 12]]

function proofFor(run) {
  const game = createDiveGame(run.levelId, { seed: run.seed })
  const trace = []
  let previous = ''
  for (const [x, y] of route) {
    for (let guard = 0; guard < 500; guard++) {
      const state = game.getState()
      if (state.status !== 'playing') return { runId: run.id, ticks: state.tick, trace }
      if (Math.hypot(x - state.player.x, y - state.player.y) < 0.8) break
      const input = {
        dx: Math.abs(x - state.player.x) > 0.45 ? Math.sign(x - state.player.x) : 0,
        dy: Math.abs(y - state.player.y) > 0.45 ? Math.sign(y - state.player.y) : 0,
        fire: true
      }
      if (JSON.stringify(input) !== previous) {
        trace.push({ tick: state.tick, ...input })
        previous = JSON.stringify(input)
      }
      game.setInput(input)
      game.step()
    }
  }
  throw new Error('Fixture did not reach exit')
}

// Run the actual component script and actual service replay. Events here are
// synthetic touch lists; they do not establish WeChat or physical-device QA.
function adventure(options = {}) {
  const source = readFileSync(new URL('../src/components/plaza/DiveAdventure.vue', import.meta.url), 'utf8')
    .match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
  const hooks = { Mounted: [], Unmounted: [], Show: [], Hide: [] }
  const clocks = new Map()
  const session = reactive({ user: { id: owner } })
  const db = createSeed()
  const rewards = []
  let now = startedAt, sequence = 0, finishes = 0, lastIssued, modal
  const invoke = (action, params = {}) => dispatchDive(db, session.user?.id, action, params, {
    now, random: () => 0.1
  })
  const query = {
    in() { return this }, select() { return this },
    boundingClientRect(callback) { callback({ left: 0, top: 0, width: 100, height: 64 }); return this },
    exec() {}
  }
  const context = vm.createContext({
    soundscape: options.soundscape || { state: {}, unlock() {}, setScene() {}, setPaused() {}, effect() {} },
    computed, nextTick, reactive, ref, watch, session,
    ...Object.fromEntries(Object.entries(hooks).map(([name, callbacks]) => [
      `on${name}`, (callback) => callbacks.push(callback)
    ])),
    createDiveGame, DIVE_LEVELS, DIVE_STEP_MS, DIVE_RULES_VERSION, WARDROBE_ITEMS,
    config: { apiMode: 'mock' }, errorText: (failure) => failure.message,
    defineProps: () => ({}), defineEmits: () => (name, value) => { if (name === 'reward') rewards.push(value) },
    getCurrentInstance: () => ({ proxy: {} }),
    setInterval: (callback) => { clocks.set(++sequence, callback); return sequence },
    clearInterval: (id) => clocks.delete(id),
    Date: class extends Date { static now() { return now } },
    uni: {
      showModal: (value) => { modal = value },
      onWindowResize() {}, offWindowResize() {},
      getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
      createSelectorQuery: () => query
    },
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {} },
    wardrobe: { getState: async () => {
      if (options.wardrobeGetState) return options.wardrobeGetState(() => getWardrobeState(db, session.user?.id))
      return getWardrobeState(db, session.user?.id)
    } },
    dive: {
      getState: async () => invoke('getState'),
      start: async (params) => { lastIssued = invoke('start', params); return options.wrongVersion ? { ...lastIssued, rulesVersion: 1 } : lastIssued },
      finish: (params) => {
        finishes++
        return options.finish ? options.finish(() => invoke('finish', params)) : Promise.resolve(invoke('finish', params))
      }
    }
  })
  vm.runInContext(`${source}\nglobalThis.api = { active, paused, busy, error, progress, settled, gameState, selectedLevel, canPlay, startLevel, finishRun, retryRequest, loadProgress, resume, pressFire, releaseFire, pressDirection, releaseDirection, beginDrag, dragSwim, endDrag, beginMouseDrag, mouseDrag, currentInput, pressReturn, releaseReturn, backToLevels, askClose }`, context)
  const api = context.api
  return {
    ...api, db, rewards, session, clocks,
    lifecycle: (name) => hooks[name].forEach((callback) => callback()),
    state: () => invoke('getState'),
    starts: () => db.diveSequence,
    finishes: () => finishes,
    modal: () => modal,
    advance(count) { for (let i=0;i<count;i++) { now += DIVE_STEP_MS; for(const tick of [...clocks.values()]) tick() } },
    expire: () => { now = lastIssued.expiresAt + 1 },
    async ready() { this.lifecycle('Mounted'); await flush(); await api.startLevel(1); await flush() },
    complete() {
      for (const [x, y] of route) {
        for (let guard = 0; guard < 500; guard++) {
          const state = api.gameState.value
          if (state.status !== 'playing') return
          if (Math.hypot(x - state.player.x, y - state.player.y) < 0.8) break
          // Follow a deterministic valid route using the component's real clock.
          const px = Math.abs(x - state.player.x) > 0.45 ? x : state.player.x
          const py = Math.abs(y - state.player.y) > 0.45 ? y : state.player.y
          api.beginDrag(event([touch(3, px, py)], [touch(3, px, py)]))
          api.dragSwim(event([touch(3, px, py)], [touch(3, px, py)]))
          api.pressFire(event([touch(3, px, py), touch(8, 120, 80)], [touch(8, 120, 80)]))
          now += DIVE_STEP_MS
          for (const tick of [...clocks.values()]) tick()
        }
      }
      assert.notEqual(api.gameState.value.status, 'playing', 'fixture must reach an actual terminal game state')
    }
  }
}

test('潜水结算回执按身份保存、深拷贝返回，读取不重复发奖，重复finish仍冲突', () => {
  const db = createSeed()
  const run = dispatchDive(db, owner, 'start', { levelId: 1 }, { now: startedAt, random: () => 0.1 })
  const proof = proofFor(run)
  const now = startedAt + proof.ticks * DIVE_STEP_MS
  const result = dispatchDive(db, owner, 'finish', proof, { now })
  const receipt = result.state.lastSettlement
  assert.deepEqual(receipt, { runId: run.id, levelId: 1, rulesVersion: 2, collectedPearls: 3, status: 'cleared', reward: result.reward })
  receipt.reward.items.push('forged')
  assert.equal(dispatchDive(db, owner, 'getState', {}, { now }).lastSettlement.reward.items.length, 2)
  assert.equal(dispatchDive(db, 'user_demo_b', 'getState', {}, { now }).lastSettlement, null)
  assert.throws(() => dispatchDive(db, owner, 'finish', proof, { now }), { code: 'CONFLICT' })
  assert.equal(dispatchDive(db, owner, 'getState', {}, { now }).pearls, 33)
})

for (const returnBeforeResponse of [false, true]) {
  test(`结算中切后台，${returnBeforeResponse ? '响应前返回' : '响应后返回'}恢复同局奖励和下一关且只发一次奖`, async () => {
    const pending = deferred()
    const page = adventure({ finish: async (commit) => { await pending.promise; return commit() } })
    await page.ready()
    page.complete()
    assert.equal(page.gameState.value.status, 'cleared')
    page.lifecycle('Hide')
    if (returnBeforeResponse) page.lifecycle('Show')
    pending.resolve()
    await flush()
    if (!returnBeforeResponse) page.lifecycle('Show')
    await flush()
    assert.equal(page.settled.value?.status, 'cleared')
    assert.equal(page.settled.value.reward.pearls, 33)
    assert.equal(page.progress.value.unlockedLevel, 2)
    assert.equal(page.finishes(), 1)
    assert.equal(page.rewards.length, 1)
    await page.loadProgress()
    assert.equal(page.finishes(), 1)
    assert.equal(page.state().pearls, 33)
    page.lifecycle('Unmounted')
  })
}

test('结算已保存但网络结果不明，重试先读同局回执，不重复提交finish', async () => {
  const page = adventure({ finish: async (commit) => { commit(); throw new Error('network unavailable') } })
  await page.ready()
  page.complete()
  await flush()
  assert.equal(page.settled.value, null)
  await page.retryRequest()
  assert.equal(page.settled.value?.reward?.pearls, 33)
  assert.equal(page.finishes(), 1)
  assert.equal(page.state().pearls, 33)
  page.lifecycle('Unmounted')
})

test('结算请求未到达服务，重试读取仍是同一有效局后才重新提交', async () => {
  let attempt = 0
  const page = adventure({ finish: async (commit) => {
    if (++attempt === 1) throw new Error('request never reached service')
    return commit()
  } })
  await page.ready()
  page.complete()
  await flush()
  assert.equal(page.state().pearls, 0)
  assert.equal(page.state().lastSettlement, null)
  await page.retryRequest()
  assert.equal(page.settled.value?.reward?.pearls, 33)
  assert.equal(page.finishes(), 2)
  assert.equal(page.state().pearls, 33)
  page.lifecycle('Unmounted')
})

test('回执已确认但衣柜读取失败，仍展示保存结果，重试只刷新衣柜', async () => {
  const pending = deferred()
  let reads = 0
  const page = adventure({
    finish: async (commit) => { await pending.promise; return commit() },
    wardrobeGetState: (read) => {
      if (++reads === 1) throw new Error('wardrobe temporarily unavailable')
      return read()
    }
  })
  await page.ready()
  page.complete()
  page.lifecycle('Hide')
  pending.resolve()
  await flush()
  page.lifecycle('Show')
  await flush()
  assert.equal(page.settled.value?.reward?.pearls, 33)
  assert.match(page.error.value, /收获已保存/)
  assert.equal(page.rewards.length, 0)
  await page.retryRequest()
  assert.equal(page.settled.value.wardrobe.pearls, 33)
  assert.equal(page.rewards.length, 1)
  assert.equal(page.finishes(), 1)
  assert.equal(page.error.value, '')
  page.lifecycle('Unmounted')
})

test('失败结算同样留下失败回执，读取不推断通关、不发奖', () => {
  const db = createSeed()
  const run = dispatchDive(db, owner, 'start', { levelId: 1 }, { now: startedAt, random: () => 0.1 })
  const result = dispatchDive(db, owner, 'finish', { runId: run.id, ticks: 1000, trace: [] }, { now: startedAt + 50000 })
  assert.deepEqual(result.state.lastSettlement, { runId: run.id, levelId: 1, rulesVersion: 2, collectedPearls: 0, status: 'failed', reward: null })
  assert.equal(result.state.pearls, 0)
  assert.equal(result.state.unlockedLevel, 1)
  assert.equal(result.state.activeRun, null)
})

test('结算等待时切换账号，旧结果不回写、不向新身份发出奖励事件', async () => {
  const pending = deferred()
  const page = adventure({ finish: async (commit) => { const value = commit(); await pending.promise; return value } })
  await page.ready()
  page.complete()
  page.lifecycle('Hide')
  page.session.user = { id: 'user_demo_b' }
  pending.resolve()
  page.lifecycle('Show')
  await flush()
  assert.equal(page.settled.value, null)
  assert.equal(page.gameState.value, null)
  assert.equal(page.rewards.length, 0)
  assert.equal(page.progress.value.pearls, 0)
  page.lifecycle('Unmounted')
})

test('新一局不恢复上一局回执，过期局不能在返回前台后继续游动', async () => {
  const page = adventure()
  await page.ready()
  page.complete()
  await flush()
  assert.equal(page.state().lastSettlement?.status, 'cleared')
  await page.startLevel(1)
  await flush()
  await page.loadProgress()
  assert.equal(page.settled.value, null, '不能把上一局回执套在当前局')
  assert.equal(page.gameState.value.status, 'playing')
  page.lifecycle('Hide')
  page.expire()
  page.lifecycle('Show')
  await flush()
  assert.equal(page.settled.value, null)
  assert.equal(page.gameState.value, null)
  assert.match(page.error.value, /过期|结束/)
  assert.equal(page.clocks.size, 0)
  assert.equal(page.finishes(), 1)
  page.lifecycle('Unmounted')
})

test('发射手指先按、游动手指后按时，坐标跟随游动identifier而非touches第一项', async () => {
  const page = adventure()
  await page.ready()
  const fire = touch(1, 120, 80), drag = touch(2, 80, 15)
  page.pressFire(event([fire], [fire]))
  page.beginDrag(event([fire, drag], [drag]))
  assert.deepEqual({ ...page.currentInput() }, { dx: 1, dy: -1, fire: true })
  page.dragSwim(event([touch(2, 5, 60), fire], [touch(2, 5, 60)]))
  assert.deepEqual({ ...page.currentInput() }, { dx: -1, dy: 1, fire: true })
  page.releaseFire(event([touch(2, 5, 60)], [fire]))
  page.endDrag(event([touch(2, 5, 60)], [fire]))
  assert.deepEqual({ ...page.currentInput() }, { dx: -1, dy: 1, fire: false })
  page.endDrag(event([], [touch(2, 5, 60)]))
  assert.deepEqual({ ...page.currentInput() }, { dx: 0, dy: 0, fire: false })
  page.lifecycle('Unmounted')
})

test('真实组件捡取后长按返航入袋，其他手指松开不打断且不授首通', async () => {
  const page = adventure()
  await page.ready()
  page.beginMouseDrag({ button: 0, clientX: 22, clientY: 54 })
  page.advance(24)
  page.endDrag()
  assert.equal(page.gameState.value.pearlsCollected, 1)
  const finger = touch(12, 110, 90)
  page.pressReturn(event([finger], [finger]))
  page.advance(39)
  assert.equal(page.gameState.value.status, 'playing')
  page.releaseReturn(event([finger], [touch(99, 20, 20)]))
  assert.equal(page.currentInput().returning, true)
  page.advance(1)
  await flush()
  assert.equal(page.gameState.value.status, 'returned')
  assert.equal(page.settled.value.status, 'returned')
  assert.equal(page.state().pearls, 1)
  assert.equal(page.state().clearedLevels.length, 0)
  assert.equal(page.finishes(), 1)
  await page.loadProgress()
  assert.equal(page.state().pearls, 1)
  await page.startLevel(1)
  await flush()
  assert.equal(page.gameState.value.player.hearts, 3)
  assert.equal(page.gameState.value.oxygenTicks, 800)
  page.lifecycle('Unmounted')
})

test('潜水音效由实际气泡和拾取触发，成功音等结算确认且回执重读不重复播放', async () => {
  const audio = audioSpy(), pending = deferred()
  const page = adventure({ soundscape: audio, finish: (perform) => pending.promise.then(perform) })
  await page.ready()
  page.pressFire()
  page.advance(1)
  page.releaseFire()
  assert.ok(audio.events.includes('bubble'))
  page.beginMouseDrag({ button: 0, clientX: 22, clientY: 54 })
  page.advance(24)
  page.endDrag()
  assert.ok(audio.events.includes('pearl'))
  page.pressReturn()
  page.advance(40)
  assert.equal(page.gameState.value.status, 'returned')
  assert.equal(audio.events.includes('return'), false)
  pending.resolve()
  await flush()
  assert.equal(audio.events.filter((value) => value === 'return').length, 1)
  await page.loadProgress()
  assert.equal(audio.events.filter((value) => value === 'return').length, 1)
  page.backToLevels()
  assert.equal(audio.events.at(-1), 'dive-menu')
  page.lifecycle('Unmounted')
})

test('返航按键松开或切后台停止引导，暂停不回血不发奖', async () => {
  const page = adventure()
  await page.ready()
  page.pressReturn()
  page.advance(20)
  assert.equal(page.gameState.value.returningTicks, 20)
  page.releaseReturn()
  page.advance(1)
  assert.equal(page.gameState.value.returningTicks, 0)
  page.pressReturn()
  page.advance(10)
  const tick = page.gameState.value.tick
  page.lifecycle('Hide')
  page.advance(100)
  assert.equal(page.gameState.value.tick, tick)
  assert.equal(page.currentInput().returning, undefined)
  assert.equal(page.state().pearls, 0)
  assert.equal(page.finishes(), 0)
  page.lifecycle('Show')
  await flush()
  page.resume()
  page.pressReturn()
  page.advance(1)
  assert.equal(page.gameState.value.returningTicks, 0, '暂停期间放开按钮，不能在恢复前重新按住而续上旧引导')
  page.advance(39)
  assert.equal(page.gameState.value.status, 'playing')
  page.advance(1)
  await flush()
  assert.equal(page.gameState.value.status, 'returned')
  page.lifecycle('Unmounted')
})

test('选关放弃需确认，取消保留本局，确认不保存未返航收获', async () => {
  const page = adventure()
  await page.ready()
  page.beginMouseDrag({ button: 0, clientX: 22, clientY: 54 })
  page.advance(24)
  page.endDrag()
  page.backToLevels()
  assert.equal(page.gameState.value.pearlsCollected, 1)
  assert.match(page.modal().content, /不保存本局收获/)
  page.modal().success({ confirm: false })
  assert.equal(page.clocks.size, 1)
  page.backToLevels()
  page.modal().success({ confirm: true })
  await flush()
  assert.equal(page.gameState.value, null)
  assert.equal(page.state().pearls, 0)
  assert.equal(page.finishes(), 0)
  page.lifecycle('Unmounted')
})

test('服务尚未更新返航规则版本时明确拒绝开局，不按新规则伪装旧局', async () => {
  const page = adventure({ wrongVersion: true })
  await page.ready()
  assert.equal(page.gameState.value, null)
  assert.match(page.error.value, /版本尚未更新/)
  assert.equal(page.clocks.size, 0)
  page.lifecycle('Unmounted')
})

test('无关手指取消不释放游动或发射，拥有者取消后停止，切后台清除所有按住状态', async () => {
  const page = adventure()
  await page.ready()
  const fire = touch(5, 120, 80), drag = touch(9, 75, 10), other = touch(7, 40, 40)
  page.beginDrag(event([drag], [drag]))
  page.pressFire(event([drag, fire], [fire]))
  page.endDrag(event([drag, fire], [other]))
  page.releaseFire(event([drag, fire], [other]))
  assert.deepEqual({ ...page.currentInput() }, { dx: 1, dy: -1, fire: true })
  page.releaseFire(event([drag], [fire]))
  page.endDrag(event([], [drag]))
  assert.deepEqual({ ...page.currentInput() }, { dx: 0, dy: 0, fire: false })
  page.beginDrag(event([drag], [drag]))
  page.pressFire(event([drag, fire], [fire]))
  page.lifecycle('Hide')
  assert.deepEqual({ ...page.currentInput() }, { dx: 0, dy: 0, fire: false })
  assert.equal(page.clocks.size, 0)
  page.lifecycle('Unmounted')
})

test('桌面鼠标拖动和方向键松开仍正常，不与触摸指针串用', async () => {
  const page = adventure()
  await page.ready()
  page.beginMouseDrag({ button: 0, clientX: 80, clientY: 10 })
  assert.deepEqual({ ...page.currentInput() }, { dx: 1, dy: -1, fire: false })
  page.mouseDrag({ clientX: 5, clientY: 60 })
  assert.deepEqual({ ...page.currentInput() }, { dx: -1, dy: 1, fire: false })
  page.endDrag({ type: 'mouseup' })
  page.pressDirection('right')
  assert.equal(page.currentInput().dx, 1)
  page.releaseDirection('right')
  assert.equal(page.currentInput().dx, 0)
  page.lifecycle('Unmounted')
})
