import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createEffectSamples, createUnderwaterSamples } from '../src/utils/soundscape-score.js'

export function wavBytes({ samples, sampleRate }) {
  const bytes = Buffer.alloc(44 + samples.length * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28)
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36)
  bytes.writeUInt32LE(samples.length * 2, 40)
  for (let index = 0; index < samples.length; index++)
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[index])) * 32767), 44 + index * 2)
  return bytes
}

export function prepareAppAudio() {
  const output = new URL('../src/static/app/audio/', import.meta.url)
  mkdirSync(output, { recursive: true })
  // static/h5 is deliberately omitted by the App compiler. Keep the same
  // licensed recording in App's platform-specific resource directory.
  copyFileSync(new URL('../src/static/h5/audio/carefree.mp3', import.meta.url), new URL('carefree.mp3', output))
  for (const name of ['water', 'bubble', 'pearl', 'hurt', 'clear', 'return', 'fail']) {
    const score = name === 'water' ? createUnderwaterSamples() : createEffectSamples(name)
    writeFileSync(new URL(`${name}.wav`, output), wavBytes(score))
  }
  return fileURLToPath(output)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(prepareAppAudio())
