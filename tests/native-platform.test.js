import test from 'node:test'
import assert from 'node:assert/strict'
import { readNativePng } from '../src/platform/native-file.js'
import { createNativeSoundscapeAudio } from '../src/platform/native-audio.js'
import { appBuildOptions } from '../scripts/app-build-options.mjs'
import { wavBytes } from '../scripts/prepare-app-audio.mjs'
import { readFileSync } from 'node:fs'
import { choosePetPng } from '../src/platform/pet-image.js'
import { resolveNativeImage } from '../src/platform/native-image.js'

test('native media authenticates only our file endpoint without a browser URL API and removes obsolete downloads', async (t) => {
  const browserUrl = globalThis.URL
  t.after(() => { globalThis.URL = browserUrl })
  globalThis.URL = undefined
  let request, removed = 0, current = true
  const options = {
    baseUrl: 'https://example.com/api', token: 'private-session', current: () => current,
    native: { io: { resolveLocalFileSystemURL: (path, done) => done({ remove: (done) => { removed++; done() } }) } },
    api: { downloadFile: (input) => { request = input; input.success({ statusCode: 200, tempFilePath: '_doc/temp-downloaded.png' }) } }
  }
  const input = 'https://example.com/api/files/private-image'
  const resolved = await resolveNativeImage(input, options)
  assert.equal(request.url, input)
  assert.equal(request.header.Authorization, 'Bearer private-session')
  assert.equal(resolved.src, '_doc/temp-downloaded.png')
  resolved.release(); resolved.release()
  assert.equal(removed, 1)
  request = null
  assert.equal((await resolveNativeImage('https://outside.example/image.png', options)).src, 'https://outside.example/image.png')
  assert.equal(request, null)
  for (const src of ['https://example.com.evil/api/files/private-image', 'https://example.com/api/files/../private-image', 'https://example.com/api/files/private-image?token=x']) {
    assert.equal((await resolveNativeImage(src, options)).src, src)
    assert.equal(request, null)
  }
  current = false
  await assert.rejects(resolveNativeImage(input, options), { code: 'CONFLICT' })
  assert.equal(removed, 2)
})

test('App picker import passes the same PNG validation used by saved pets', async (t) => {
  const previousUni = globalThis.uni, previousPlus = globalThis.plus
  t.after(() => { globalThis.uni = previousUni; globalThis.plus = previousPlus })
  const data = readFileSync(new URL('../src/static/tabs/home.png', import.meta.url)).toString('base64')
  globalThis.uni = {
    chooseImage: (options) => options.success({ tempFilePaths: ['_doc/pet.png'], tempFiles: [{ path: '_doc/pet.png', size: 315 }] }),
    getImageInfo: (options) => options.success({ width: 48, height: 48 })
  }
  globalThis.plus = { io: {
    resolveLocalFileSystemURL: (path, ready) => ready({ file: (done) => done({ size: 315 }) }),
    FileReader: class { readAsDataURL() { this.onloadend({ target: { result: `data:image/png;base64,${data}` } }) } }
  } }
  assert.equal((await choosePetPng()).data, `data:image/png;base64,${data}`)
})

test('App PNG adapter reads only picker-local files and enforces size before decoding', async () => {
  let size = 100, reads = 0
  class Reader {
    readAsDataURL() { reads++; this.onloadend({ target: { result: 'data:image/png;base64,example' } }) }
  }
  const platform = { io: {
    FileReader: Reader,
    resolveLocalFileSystemURL(path, ready) {
      assert.equal(path, '_doc/chosen.png')
      ready({ file: (done) => done({ size }) })
    }
  } }
  assert.equal((await readNativePng('_doc/chosen.png', platform)).data, 'data:image/png;base64,example')
  size = 256 * 1024 + 1
  await assert.rejects(readNativePng('_doc/chosen.png', platform), { code: 'INVALID_ARGUMENT' })
  assert.equal(reads, 1)
  await assert.rejects(readNativePng('https://example.com/private.png', platform), { code: 'INVALID_ARGUMENT' })
  await assert.rejects(readNativePng('_doc/chosen.png', {}), { code: 'NOT_SUPPORTED' })
})

test('App audio preserves water/effects independently of music and disposes on background', async () => {
  const audios = [], background = []
  let time = 0
  const player = createNativeSoundscapeAudio({
    now: () => time,
    music: { sync: (state) => background.push(state), stop: () => background.push('stop'), onError() {} },
    createAudio: () => {
      const audio = { playing: false, destroyed: false, play() { this.playing = true }, stop() { this.playing = false }, destroy() { this.destroyed = true }, onEnded(fn) { this.ended = fn }, onError(fn) { this.failed = fn } }
      audios.push(audio)
      return audio
    }
  })
  await player.sync({ music: false, water: true, underwater: true, effects: true })
  assert.equal(audios[0].src, '/static/app/audio/water.wav')
  assert.equal(audios[0].loop, true)
  player.effect('bubble'); player.effect('bubble')
  assert.equal(audios.length, 2)
  time = 251; player.effect('bubble'); player.effect('clear')
  assert.equal(audios.length, 4)
  assert.equal(audios[3].src, '/static/app/audio/clear.wav')
  player.stop()
  assert.ok(audios.every((audio) => !audio.playing && audio.destroyed))
  assert.equal(background.at(-1), 'stop')
  await player.sync({ music: true, water: false, underwater: false, effects: false })
  player.effect('pearl')
  assert.equal(audios.length, 4)
})

test('native water and effects work with the SDK getter-only mute property', async () => {
  let plays = 0
  const player = createNativeSoundscapeAudio({
    music: { sync: async () => {}, stop() {}, onError() {} },
    createAudio: () => {
      const audio = { play() { plays++ }, stop() {}, destroy() {}, onEnded() {}, onError() {} }
      Object.defineProperty(audio, 'obeyMuteSwitch', { get: () => true })
      return audio
    }
  })
  await player.sync({ music: false, water: true, underwater: true, effects: true })
  player.effect('pearl')
  assert.equal(plays, 2)
  player.stop()
})

test('App build uses explicit real backend and never silently becomes a mock or localhost build', () => {
  assert.throws(() => appBuildOptions({}), /CAMPUS_APP_ORIGIN/)
  for (const origin of ['https://example.com/api', 'https://name:pass@example.com', 'https://example.com/?x=1', 'http://127.0.0.1:8791'])
    assert.throws(() => appBuildOptions({ CAMPUS_APP_ORIGIN: origin }), /CAMPUS_APP_ORIGIN/)
  const config = appBuildOptions({ CAMPUS_APP_ORIGIN: 'https://example.com' })
  assert.equal(config.apiBaseUrl, 'https://example.com/api')
  assert.equal(config.gameBaseUrl, 'https://example.com/game')
  assert.equal(config.bound, false)
  assert.throws(() => appBuildOptions({ CAMPUS_APP_ORIGIN: 'https://example.com', CAMPUS_APP_RELEASE: 'true' }), /正式发布构建/)
  assert.equal(appBuildOptions({ CAMPUS_APP_ORIGIN: 'http://192.168.1.2:8791', CAMPUS_APP_ALLOW_LOCAL: 'true' }).origin, 'http://192.168.1.2:8791')
})

test('native water audio is a real PCM WAV with correctly bounded samples', () => {
  const wav = wavBytes({ sampleRate: 22050, samples: new Float32Array([-2, 0, 2]) })
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.readUInt32LE(40), 6)
  assert.equal(wav.readInt16LE(44), -32767)
  assert.equal(wav.readInt16LE(48), 32767)
})
