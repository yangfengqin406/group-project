import { createEffectSamples, createUnderwaterSamples } from '../utils/soundscape-score.js'
import { createBackgroundMusic } from './background-music.js'
import { createNativeSoundscapeAudio } from './native-audio.js'

export function createSoundscapeAudio(options = {}) {
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && typeof uni !== 'undefined' && uni.createInnerAudioContext)
    return createNativeSoundscapeAudio(options)
  // #endif
  const background = options.music || createBackgroundMusic()
  let context
  // #ifdef H5
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext
  if (Audio) context = new Audio()
  // #endif
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && wx.createWebAudioContext) context = wx.createWebAudioContext()
  // #endif
  if (!context) throw new Error('当前设备暂不支持声音，仍可继续游玩。')
  const buffers = new Map(), loops = new Map(), effects = new Set()
  let lastBubble = -Infinity
  function buffer(name) {
    if (buffers.has(name)) return buffers.get(name)
    const { samples, sampleRate } = name === 'water' ? createUnderwaterSamples() : createEffectSamples(name)
    const result = context.createBuffer(1, samples.length, sampleRate)
    result.getChannelData(0).set(samples)
    buffers.set(name, result)
    return result
  }
  function stopNode(value) {
    try { value.source.stop() } catch { /* Already ended. */ }
    value.source.disconnect()
    value.gain.disconnect()
  }
  function start(name, loop, volume) {
    const source = context.createBufferSource(), gain = context.createGain()
    source.buffer = buffer(name)
    source.loop = loop
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(context.destination)
    source.start()
    return { source, gain }
  }
  return {
    onError: (callback) => background.onError(callback),
    resume: () => Promise.resolve(context.resume()),
    sync({ music, water, underwater, effects: effectsEnabled }) {
      if (!effectsEnabled) {
        for (const value of effects) stopNode(value)
        effects.clear()
      }
      for (const [name, enabled, volume] of [['water', water, 0.45]]) {
        if (!enabled && loops.has(name)) { stopNode(loops.get(name)); loops.delete(name) }
        if (enabled && !loops.has(name)) loops.set(name, start(name, true, volume))
        if (loops.has(name)) loops.get(name).gain.gain.value = volume
      }
      return background.sync({ enabled: music, underwater })
    },
    effect(name) {
      if (context.state === 'suspended' || effects.size >= 6) return
      if (name === 'bubble' && context.currentTime - lastBubble < 0.25) return
      if (name === 'bubble') lastBubble = context.currentTime
      const value = start(name, false, name === 'hurt' ? 0.3 : 0.45)
      effects.add(value)
      value.source.onended = () => {
        value.source.disconnect(); value.gain.disconnect(); effects.delete(value)
      }
    },
    stop() {
      background.stop()
      for (const value of loops.values()) stopNode(value)
      for (const value of effects) stopNode(value)
      loops.clear(); effects.clear()
      Promise.resolve(context.suspend()).catch(() => {})
    }
  }
}
