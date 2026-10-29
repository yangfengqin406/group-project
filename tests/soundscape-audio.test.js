import test from 'node:test'
import assert from 'node:assert/strict'
import { createSoundscapeAudio } from '../src/platform/soundscape-audio.js'

function setup(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')
  let context
  class FakeAudioContext {
    state = 'running'
    currentTime = 0
    destination = {}
    sources = []
    gains = []
    createBuffer(_channels, length, sampleRate) {
      const channel = new Float32Array(length)
      return { length, sampleRate, getChannelData: () => channel }
    }
    createBufferSource() {
      const source = {
        started: false, stopped: false, disconnected: false, stopCount: 0,
        connect(target) { this.target = target },
        disconnect() { this.disconnected = true },
        start() { this.started = true },
        stop() { this.stopped = true; this.stopCount++ },
        finish() { this.ended = true; this.onended?.() }
      }
      this.sources.push(source)
      return source
    }
    createGain() {
      const gain = {
        gain: { value: 1 }, disconnected: false,
        connect(target) { this.target = target },
        disconnect() { this.disconnected = true }
      }
      this.gains.push(gain)
      return gain
    }
    resume() { this.state = 'running'; return Promise.resolve() }
    suspend() { this.state = 'suspended'; return Promise.resolve() }
    constructor() { context = this }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: FakeAudioContext })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original)
    else delete globalThis.AudioContext
  })
  const background = {
    enabled: false, stopCount: 0, syncCalls: [], errorHandler: null,
    onError(callback) { this.errorHandler = callback },
    sync(value) { this.enabled = value.enabled; this.syncCalls.push(value); return Promise.resolve() },
    stop() { this.enabled = false; this.stopCount++ }
  }
  const player = createSoundscapeAudio({ music: background })
  const playing = () => context.sources.filter((source) => source.started && !source.stopped && !source.ended)
  return { player, context, playing, background }
}

test('关闭水声音效立即停止正在播放的音效与水声，保留音乐', (t) => {
  const { player, context, playing, background } = setup(t)
  player.sync({ music: true, water: true, underwater: true, effects: true })
  player.effect('clear')
  player.effect('hurt')
  assert.equal(playing().length, 3)

  player.sync({ music: true, water: false, underwater: true, effects: false })
  assert.equal(playing().length, 0)
  assert.equal(background.enabled, true, 'Turning water effects off keeps the licensed background recording on')
  assert.deepEqual(background.syncCalls.at(-1), { enabled: true, underwater: true })
  for (const source of context.sources) {
    assert.equal(source.stopped, true, 'The active sound ends immediately')
    assert.equal(source.disconnected, true, 'Source releases its audio graph connection')
    assert.equal(source.target.disconnected, true, 'Gain releases its destination connection')
  }
  player.sync({ music: true, water: false, underwater: false, effects: false })
  assert.deepEqual(background.syncCalls.at(-1), { enabled: true, underwater: false }, 'Music returns to the plaza mix')
  assert.equal(background.stopCount, 0)
  assert.equal(playing().length, 0)
  player.stop()
})

test('暂停或离页停止并断开所有音频节点，恢复前不继续播放音效', async (t) => {
  const { player, context, playing, background } = setup(t)
  player.sync({ music: true, water: true, underwater: true, effects: true })
  player.effect('pearl')
  player.effect('return')
  const previous = [...context.sources]

  player.stop()
  assert.equal(background.enabled, false)
  assert.equal(background.stopCount, 1, 'Leaving or pausing also stops the background recording')
  assert.equal(context.state, 'suspended')
  assert.equal(playing().length, 0)
  assert.ok(previous.every((source) => source.stopped && source.disconnected))
  assert.ok(context.gains.every((gain) => gain.disconnected))
  player.effect('hurt')
  assert.equal(context.sources.length, previous.length, 'Hidden/paused context cannot emit new effects')
  player.stop()
  assert.ok(previous.every((source) => source.stopCount === 1), 'Repeated stop is safe')

  await player.resume()
  player.sync({ music: true, water: true, underwater: true, effects: true })
  assert.equal(background.enabled, true)
  assert.equal(playing().length, 1, 'A foreground session gets exactly one new water loop')
  assert.ok(playing().every((source) => !previous.includes(source)))
  player.stop()
})

test('重复同步场景不叠加循环；连续发射的气泡声受限流且结束后释放节点', (t) => {
  const { player, context, playing } = setup(t)
  for (let i = 0; i < 5; i++)
    player.sync({ music: true, water: true, underwater: true, effects: true })
  assert.equal(context.sources.length, 1, 'Repeated scene updates keep just one water loop')

  player.effect('bubble')
  const bubble = context.sources.at(-1)
  context.currentTime = 0.1
  player.effect('bubble')
  context.currentTime = 0.249
  player.effect('bubble')
  assert.equal(context.sources.length, 2, 'Repeated fire input does not stack a new effect every frame')
  context.currentTime = 0.25
  player.effect('bubble')
  assert.equal(context.sources.length, 3, 'A bubble is allowed again after a quarter second')

  bubble.finish()
  assert.equal(bubble.disconnected, true)
  assert.equal(bubble.target.disconnected, true)
  assert.ok(!playing().includes(bubble))
  player.stop()
})

test('背景录音加载错误透传给声音服务，不被水声音效层吞掉', (t) => {
  const { player, background, context } = setup(t)
  const errors = []
  player.onError((error) => errors.push(error))
  const failure = new Error('Official background recording could not load')
  background.errorHandler(failure)
  assert.deepEqual(errors, [failure])
  assert.equal(context.sources.length, 0, 'A recording failure does not create substitute synthetic music')
  player.stop()
})
