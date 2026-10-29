import { createBackgroundMusic } from './background-music.js'
import { respectMuteSwitch } from './audio-options.js'

export function createNativeSoundscapeAudio(options = {}) {
  const createAudio = options.createAudio || (() => uni.createInnerAudioContext())
  const background = options.music || createBackgroundMusic()
  const now = options.now || Date.now
  const effects = new Set()
  const names = new Set(['bubble', 'pearl', 'hurt', 'clear', 'return', 'fail'])
  let water = null, enabled = true, lastBubble = -Infinity, onError = () => {}
  const dispose = (audio) => { audio.stop(); audio.destroy() }
  const audioFor = (name, loop, volume) => {
    const audio = createAudio()
    audio.src = `/static/app/audio/${name}.wav`
    audio.loop = loop
    audio.autoplay = false
    respectMuteSwitch(audio)
    audio.volume = volume
    return audio
  }
  const stopEffects = () => {
    for (const audio of effects) dispose(audio)
    effects.clear()
  }
  return {
    onError(callback) { onError = callback; background.onError(callback) },
    resume: () => Promise.resolve(),
    async sync({ music, water: underwater, underwater: quiet, effects: allowEffects }) {
      enabled = allowEffects
      if (!enabled) stopEffects()
      if ((!underwater || !enabled) && water) { dispose(water); water = null }
      if (underwater && enabled && !water) {
        const stream = audioFor('water', true, 0.45)
        water = stream
        stream.onError(() => {
          if (water !== stream) return
          dispose(stream); water = null
          onError(new Error('水声暂时无法播放，请重新打开水声开关。'))
        })
        stream.play()
      }
      await background.sync({ enabled: music, underwater: quiet })
    },
    effect(name) {
      if (!enabled || !names.has(name) || effects.size >= 6) return
      if (name === 'bubble' && now() - lastBubble < 250) return
      if (name === 'bubble') lastBubble = now()
      const audio = audioFor(name, false, name === 'hurt' ? 0.3 : 0.45)
      const finished = () => { if (effects.delete(audio)) audio.destroy() }
      audio.onEnded(finished)
      audio.onError(finished)
      effects.add(audio)
      audio.play()
    },
    stop() {
      enabled = false
      background.stop()
      if (water) { dispose(water); water = null }
      stopEffects()
    }
  }
}
