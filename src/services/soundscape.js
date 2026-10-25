import { reactive } from 'vue'
import { createSoundscapeAudio } from '../platform/soundscape-audio.js'
import { MUSIC_CREDIT } from '../platform/background-music.js'

export function createSoundscape(audioFactory = createSoundscapeAudio) {
  const state = reactive({ music: false, effects: true, message: '' })
  let player = null, visible = false, paused = false, scene = 'plaza', revision = 0
  async function update(gesture = false) {
    const current = ++revision
    if (!visible || paused || (!state.music && !state.effects)) { player?.stop(); return }
    try {
      if (!player && gesture) {
        player = audioFactory()
        player.onError?.((error) => {
          revision++
          state.message = error.message
          player.stop()
        })
      }
      if (!player) return
      await player.resume()
      if (current !== revision) return
      await player.sync({ music: state.music, water: state.effects && scene === 'dive', underwater: scene !== 'plaza', effects: state.effects })
      if (current !== revision) return
      state.message = ''
    } catch (error) {
      if (current === revision) {
        state.message = error.message || '声音暂时无法播放，请点击声音开关重试。'
        player?.stop()
      }
    }
  }
  return {
    state,
    musicCredit: MUSIC_CREDIT,
    unlock: () => update(true),
    toggleMusic() { state.music = !state.music; return update(true) },
    toggleEffects() { state.effects = !state.effects; return update(true) },
    setVisible(value) { visible = value; return update() },
    setScene(value) { scene = value; paused = false; return update() },
    setPaused(value) { paused = value; return update() },
    effect(name) {
      if (!visible || paused || !state.effects || !player) return
      try { player.effect(name) } catch { state.message = '水声暂时无法播放，仍可继续游玩。' }
    }
  }
}

export const soundscape = createSoundscape()
