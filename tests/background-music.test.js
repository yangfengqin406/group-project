import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackgroundMusic, MUSIC_CREDIT } from '../src/platform/background-music.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function setup({ play, innerAudio = false } = {}) {
  const errors = [], instances = [], listeners = new Map()
  const calls = { play: 0, pause: 0 }
  const subject = createBackgroundMusic({
    createAudio() {
      const audio = {
        paused: true,
        play() {
          calls.play++
          this.paused = false
          return play?.(this)
        },
        pause() { calls.pause++; this.paused = true }
      }
      if (innerAudio) audio.onError = callback => listeners.set('error', callback)
      else audio.addEventListener = (type, callback) => listeners.set(type, callback)
      instances.push(audio)
      return audio
    }
  })
  subject.onError(error => errors.push(error))
  return { subject, errors, instances, calls, mediaError: () => listeners.get('error')?.() }
}

test('背景音乐默认不创建、不自动播放；主动开启后使用Carefree正式录音和低音量循环', async () => {
  const { subject, instances, calls } = setup()
  assert.equal(instances.length, 0)
  await subject.sync({ enabled: false, underwater: false })
  assert.equal(instances.length, 0)
  assert.equal(calls.play, 0)
  await subject.sync({ enabled: true, underwater: false })
  assert.equal(instances.length, 1)
  const audio = instances[0]
  assert.equal(audio.src, 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3')
  assert.equal(MUSIC_CREDIT.title, 'Carefree')
  assert.equal(MUSIC_CREDIT.artist, 'Kevin MacLeod')
  assert.equal(audio.autoplay, false)
  assert.equal(audio.loop, true)
  assert.equal(audio.obeyMuteSwitch, true)
  assert.equal(audio.volume, 0.2)
  assert.equal(calls.play, 1)
})

test('重复同步复用同一录音实例，水下调低音量，关闭和stop均暂停播放', async () => {
  const { subject, instances, calls } = setup()
  await subject.sync({ enabled: true, underwater: false })
  await subject.sync({ enabled: true, underwater: false })
  assert.equal(instances.length, 1)
  assert.equal(calls.play, 1)
  await subject.sync({ enabled: true, underwater: true })
  assert.equal(instances[0].volume, 0.1)
  assert.equal(calls.play, 1)
  await subject.sync({ enabled: false, underwater: true })
  assert.equal(instances[0].paused, true)
  await subject.sync({ enabled: true, underwater: false })
  assert.equal(instances.length, 1)
  assert.equal(instances[0].volume, 0.2)
  assert.equal(calls.play, 2)
  subject.stop()
  assert.equal(instances[0].paused, true)
  assert.equal(calls.pause, 2)
})

test('停止或关闭后迟到的play完成不能重新响起，旧媒体错误也不误报', async () => {
  for (const action of ['stop', 'disable']) {
    const pending = deferred()
    const { subject, instances, errors, mediaError } = setup({
      play: audio => pending.promise.then(() => { audio.paused = false })
    })
    const starting = subject.sync({ enabled: true, underwater: false })
    if (action === 'stop') subject.stop()
    else await subject.sync({ enabled: false, underwater: false })
    assert.equal(instances[0].paused, true)
    pending.resolve()
    await starting
    assert.equal(instances[0].paused, true, `${action}后迟到播放仍应保持暂停`)
    mediaError()
    assert.equal(errors.length, 0)
  }
})

test('停止或关闭后迟到的play拒绝被忽略，不变成未处理错误或过时提示', async () => {
  for (const action of ['stop', 'disable']) {
    const pending = deferred()
    const { subject, errors } = setup({ play: () => pending.promise })
    const starting = subject.sync({ enabled: true, underwater: false })
    if (action === 'stop') subject.stop()
    else await subject.sync({ enabled: false, underwater: false })
    pending.reject(new Error('旧请求被浏览器中断'))
    await assert.doesNotReject(starting)
    assert.equal(errors.length, 0)
  }
})

test('有效play请求被拒绝时向调用方明确返回可重试的背景音乐错误', async () => {
  const { subject } = setup({ play: () => Promise.reject(new Error('NotAllowedError')) })
  await assert.rejects(
    subject.sync({ enabled: true, underwater: false }),
    /背景音乐暂时无法播放.*重试/
  )
})

test('H5和微信媒体错误均通过onError通知；暂停后的旧媒体事件保持安静', async () => {
  for (const innerAudio of [false, true]) {
    const { subject, errors, mediaError } = setup({ innerAudio })
    await subject.sync({ enabled: true, underwater: false })
    mediaError()
    assert.equal(errors.length, 1)
    assert.ok(errors[0] instanceof Error)
    assert.match(errors[0].message, /背景音乐.*检查网络.*重试/)
    subject.stop()
    mediaError()
    assert.equal(errors.length, 1)
  }
})

test('旧播放请求迟到拒绝不会破坏关闭后重新开启的当前录音', async () => {
  const pending = deferred()
  let attempts = 0
  const { subject, instances, errors } = setup({
    play: () => ++attempts === 1 ? pending.promise : undefined
  })
  const first = subject.sync({ enabled: true, underwater: false })
  subject.stop()
  await subject.sync({ enabled: true, underwater: true })
  pending.reject(new Error('旧启动已取消'))
  await assert.doesNotReject(first)
  assert.equal(instances.length, 1)
  assert.equal(instances[0].paused, false)
  assert.equal(instances[0].volume, 0.1)
  assert.equal(errors.length, 0)
})
