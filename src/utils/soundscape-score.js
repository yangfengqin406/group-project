// Local water ambience and effects; background music uses a licensed recording.
const TAU = Math.PI * 2

function make(seconds, sampleRate) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000)
    throw new RangeError('Audio sample rate must be 8000–48000 Hz')
  return { samples: new Float32Array(Math.round(seconds * sampleRate)), sampleRate }
}

function finish(audio) {
  let peak = 0
  for (const value of audio.samples) peak = Math.max(peak, Math.abs(value))
  if (peak > 0.75) {
    const gain = 0.75 / peak
    for (let i = 0; i < audio.samples.length; i++) audio.samples[i] *= gain
  }
  return audio
}

function droplet(audio, at, startHz, endHz, seconds, volume) {
  const { samples, sampleRate } = audio
  const start = Math.round(at * sampleRate)
  let phase = 0
  for (let i = 0; i < Math.round(seconds * sampleRate) && start + i < samples.length; i++) {
    const t = i / sampleRate, progress = t / seconds
    phase += TAU * (endHz + (startHz - endHz) * Math.exp(-progress * 5)) / sampleRate
    const envelope = Math.min(1, t / 0.008) * (1 - progress) ** 2
    samples[start + i] += (Math.sin(phase) + 0.1 * Math.sin(phase * 2)) * envelope * volume
  }
}

export function createEffectSamples(name, { sampleRate = 22050 } = {}) {
  const patterns = {
    bubble: [[0, 680, 220, 0.18, 0.24], [0.07, 450, 880, 0.13, 0.12]],
    pearl: [[0, 880, 880, 0.28, 0.23], [0.09, 1320, 1320, 0.32, 0.14]],
    hurt: [[0, 270, 100, 0.34, 0.28], [0.08, 160, 75, 0.25, 0.1]],
    return: [[0, 330, 660, 0.3, 0.2], [0.15, 440, 880, 0.32, 0.18], [0.3, 660, 990, 0.4, 0.15]],
    clear: [[0, 523.25, 523.25, 0.5, 0.2], [0.16, 659.25, 659.25, 0.48, 0.18], [0.32, 783.99, 783.99, 0.6, 0.17]],
    fail: [[0, 330, 220, 0.45, 0.18], [0.2, 220, 164.8, 0.5, 0.15]]
  }
  const notes = patterns[name]
  if (!notes) throw new RangeError('Unknown sound effect')
  const audio = make(Math.max(...notes.map(([at, , , seconds]) => at + seconds)) + 0.025, sampleRate)
  for (const note of notes) droplet(audio, ...note)
  return finish(audio)
}

export function createUnderwaterSamples({ sampleRate = 22050 } = {}) {
  const audio = make(8, sampleRate)
  const { samples } = audio
  let seed = 581, water = 0
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    water += ((seed / 2147483648 - 1) - water) * 0.045
    const t = i / sampleRate
    const edge = Math.min(1, t / 0.2, (8 - t) / 0.2)
    samples[i] = edge * (water * 0.16 + Math.sin(TAU * 62.5 * t) * 0.018 * (0.8 + 0.2 * Math.sin(TAU * t / 8)))
  }
  for (let i = 0; i < 6; i++) droplet(audio, i * 1.15 + 0.3, 330 + i * 17, 140, 0.26, 0.022)
  return finish(audio)
}
