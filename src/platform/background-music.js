export const MUSIC_CREDIT = Object.freeze({
  title: 'Carefree',
  artist: 'Kevin MacLeod',
  sourceUrl: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037',
  audioUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  changes: 'H5音频作格式压缩，曲目内容未改动；微信使用作者原始录音。'
})

export function createBackgroundMusic(options = {}) {
  let source = MUSIC_CREDIT.audioUrl, createAudio = options.createAudio
  // #ifdef H5
  if (!createAudio && globalThis.Audio) {
    createAudio = () => new globalThis.Audio()
    source = `${import.meta.env?.BASE_URL || '/'}static/h5/audio/carefree.mp3`
  }
  // #endif
  // #ifdef MP-WEIXIN
  if (!createAudio && typeof uni !== 'undefined' && uni.createInnerAudioContext)
    createAudio = () => uni.createInnerAudioContext()
  // #endif
  let audio = null, desired = false, revision = 0, onError = () => {}
  const failure = () => {
    if (desired) onError(new Error('背景音乐暂时无法播放，请检查网络后点击音乐开关重试。'))
  }
  return {
    onError(callback) { onError = callback },
    async sync({ enabled, underwater }) {
      const current = ++revision
      desired = enabled
      if (!enabled) { audio?.pause(); return }
      if (!audio) {
        if (!createAudio) throw new Error('当前设备暂不支持背景音乐。')
        audio = createAudio()
        audio.autoplay = false
        audio.loop = true
        audio.obeyMuteSwitch = true
        if (audio.addEventListener) audio.addEventListener('error', failure)
        else audio.onError(failure)
        audio.src = source
      }
      audio.volume = underwater ? 0.1 : 0.2
      try {
        if (audio.paused !== false) await audio.play()
        if (!desired) audio.pause()
      } catch {
        if (current === revision && desired)
          throw new Error('背景音乐暂时无法播放，请点击音乐开关重试。')
      }
    },
    stop() { revision++; desired = false; audio?.pause() }
  }
}
