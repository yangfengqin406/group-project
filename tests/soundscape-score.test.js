import test from 'node:test'
import assert from 'node:assert/strict'
import { createEffectSamples, createUnderwaterSamples } from '../src/utils/soundscape-score.js'

function quality(audio) {
  assert.ok(audio.samples instanceof Float32Array)
  let peak = 0, energy = 0, jump = 0
  for (let i = 0; i < audio.samples.length; i++) {
    const value = audio.samples[i]
    assert.ok(Number.isFinite(value))
    peak = Math.max(peak, Math.abs(value))
    energy += value * value
    if (i) jump = Math.max(jump, Math.abs(value - audio.samples[i - 1]))
  }
  assert.ok(peak <= 0.750001, `Unclipped audio: ${peak}`)
  assert.ok(Math.sqrt(energy / audio.samples.length) > 0.004, 'Audible audio energy')
  assert.ok(jump < 0.25, `No isolated digital impulse: ${jump}`)
}

test('all six water effects have audible energy, finite samples and quiet release', () => {
  for (const name of ['bubble', 'pearl', 'hurt', 'return', 'clear', 'fail']) {
    const audio = createEffectSamples(name)
    quality(audio)
    assert.ok(audio.samples.length < audio.sampleRate, 'Effects stay under one second')
    assert.equal(audio.samples[0], 0)
    assert.equal(audio.samples.at(-1), 0)
  }
})

test('underwater loop is soft, continuous and reproducible at supported sample rates', () => {
  const audio = createUnderwaterSamples({ sampleRate: 8000 })
  assert.equal(audio.samples.length, 64000)
  quality(audio)
  assert.ok(Math.abs(audio.samples[0] - audio.samples.at(-1)) < 0.001)
  assert.deepEqual(audio, createUnderwaterSamples({ sampleRate: 8000 }))
})

test('invalid synthesis inputs are rejected without allocating an unbounded audio buffer', () => {
  for (const sampleRate of [0, NaN, Infinity, -1, 500000, 22050.5]) {
    assert.throws(() => createUnderwaterSamples({ sampleRate }), RangeError)
    assert.throws(() => createEffectSamples('bubble', { sampleRate }), RangeError)
  }
  assert.throws(() => createEffectSamples('missing'), RangeError)
})
