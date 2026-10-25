import test from 'node:test'
import assert from 'node:assert/strict'
import { createSoundscape } from '../src/services/soundscape.js'

function setup(resume = async () => {}) {
  const calls = []
  let created = 0
  const subject = createSoundscape(() => {
    created++
    return { resume, sync: (value) => calls.push(value), stop: () => calls.push('stop'), effect: (name) => calls.push(name) }
  })
  return { subject, calls, created: () => created }
}

test('声音不自动创建上下文；点击音乐后才解锁，水声开关不关闭音乐', async () => {
  const { subject, calls, created } = setup()
  await subject.setVisible(true)
  subject.effect('bubble')
  assert.equal(created(), 0)
  await subject.toggleMusic()
  assert.equal(created(), 1)
  assert.equal(calls.at(-1).music, true)
  await subject.setScene('dive')
  assert.equal(calls.at(-1).water, true)
  await subject.toggleEffects()
  assert.deepEqual(calls.at(-1), { music: true, water: false, underwater: true, effects: false })
  const count = calls.length
  subject.effect('hurt')
  assert.equal(calls.length, count)
})

test('暂停、切后台和离页停止所有声音并屏蔽音效，恢复不改变开关', async () => {
  const { subject, calls } = setup()
  await subject.setVisible(true)
  await subject.unlock()
  await subject.setScene('dive')
  await subject.setPaused(true)
  assert.equal(calls.at(-1), 'stop')
  const count = calls.length
  subject.effect('pearl')
  assert.equal(calls.length, count)
  await subject.setVisible(false)
  await subject.setPaused(false)
  assert.equal(calls.at(-1), 'stop')
  await subject.setVisible(true)
  assert.deepEqual(calls.at(-1), { music: false, water: true, underwater: true, effects: true })
  await subject.setScene('dive-result')
  assert.equal(calls.at(-1).water, false)
})

test('迟到的解锁/恢复不能在离页或暂停后启动声音', async () => {
  let release
  const { subject, calls } = setup(() => new Promise((done) => { release = done }))
  await subject.setVisible(true)
  const pending = subject.toggleMusic()
  await subject.setVisible(false)
  release()
  await pending
  assert.deepEqual(calls, ['stop'])
})

test('不支持或拒绝音频时返回明确提示，不抛出游戏流程错误', async () => {
  const subject = createSoundscape(() => { throw new Error('此设备暂不支持声音') })
  await subject.setVisible(true)
  await subject.toggleMusic()
  assert.match(subject.state.message, /不支持/)
  const denied = setup(async () => { throw new Error('请点按后重试') })
  await denied.subject.setVisible(true)
  await denied.subject.unlock()
  assert.match(denied.subject.state.message, /重试/)
  assert.equal(denied.calls.at(-1), 'stop')
})

test('录音播放Promise失败进入页面错误状态并停止声音，不冒充播放成功', async () => {
  let stopped = 0
  const subject = createSoundscape(() => ({
    resume: async () => {},
    sync: async () => { throw new Error('录音加载失败，请重试') },
    stop: () => { stopped++ }
  }))
  await subject.setVisible(true)
  await subject.toggleMusic()
  assert.match(subject.state.message, /录音加载失败/)
  assert.equal(stopped, 1)
})
