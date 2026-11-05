import { randomUUID, createHash, createHmac } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createCampusServer } from '../campus/server.js'
import { createGameService } from '../../server/landlord/service.mjs'
import { hydrateStore, exportSnapshot } from './state.js'

const fail = (code, message) => Object.assign(new Error(message), { code })
const clone = value => JSON.parse(JSON.stringify(value))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const uploads = store => store.query('campus.uploads', '1', [], 'seq ASC', 2001).map(row => row.value)
const filename = value => typeof value === 'string' && /^[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/.test(value)
const canonicalPath = name => `/cloudbase/uploads/${name}`

// Serialize the old HTTP protocol through a request-private engine. Neither
// the loopback listener nor this temporary directory is a persistent database.
async function exchange(server, input, origin) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return await new Promise((resolve, reject) => {
    const headers = { host: new URL(origin).host }
    for (const key of ['authorization', 'cookie', 'origin', 'content-type'])
      if (typeof input.headers?.[key] === 'string') headers[key] = input.headers[key]
    if (input.body?.length) headers['content-length'] = String(input.body.length)
    const call = httpRequest({ hostname: '127.0.0.1', port: server.address().port,
      path: input.url, method: input.method, headers }, response => {
      const chunks = []; let size = 0
      response.on('data', chunk => {
        size += chunk.length
        if (size > 6 * 1024 * 1024) { response.destroy(); return reject(fail('SERVICE_UNAVAILABLE', '响应内容过大')) }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }))
    })
    call.on('error', reject)
    call.setTimeout(20_000, () => call.destroy(fail('SERVICE_UNAVAILABLE', '云端业务执行超时')))
    call.end(input.body)
  })
}

function consumeAuthLimit(state, input, store, now) {
  let method, params
  if (input.method === 'POST' && new URL(input.url, 'http://localhost').pathname === '/api/rpc') {
    try { ({ method, params } = JSON.parse(input.body.toString('utf8'))) } catch { return }
  }
  if (!['auth.login', 'auth.register', 'auth.deleteAccount'].includes(method)) return
  const minute = Math.floor(now / 60_000)
  const source = typeof params?.studentId === 'string' ? params.studentId.trim().toLowerCase() : input.headers?.authorization || 'anonymous'
  const digest = createHmac('sha256', store.cursorSecret).update(`${method}:${source.slice(0,512)}`).digest('hex')
  const limits = state.authLimits ||= {}
  for (const [key, value] of Object.entries(limits)) if (value.minute !== minute) delete limits[key]
  const key = `${method}:${digest}`
  const record = limits[key] || { minute, count: 0 }
  record.count++; limits[key] = record
  const globalKey = `${method}:total`, total = limits[globalKey] || { minute, count: 0 }
  total.count++; limits[globalKey] = total
  if (record.count > (method === 'auth.register' ? 10 : 25) || total.count > (method === 'auth.register' ? 60 : 180))
    return { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: Buffer.from(JSON.stringify({ code: 'RATE_LIMITED', message: '尝试过于频繁，请一分钟后再试', data: null, requestId: randomUUID() })) }
}

export function createCloudEngine({ files, publicOrigin, staticRoot, now = () => Date.now() }) {
  const origin = new URL(publicOrigin)
  if (origin.protocol !== 'https:' || origin.origin !== publicOrigin) throw new Error('CloudBase requires a fixed HTTPS origin')
  return {
    async execute(persisted, input) {
      const state = clone(persisted), store = hydrateStore(state.snapshot)
      const directory = await mkdtemp(join(tmpdir(), 'campus-cloud-request-'))
      const uploadsDir = join(directory, 'uploads'), staged = []
      let server
      try {
        // Retire at most one durable deletion per business request. Missing
        // objects are idempotent, and a conflict leaves the job safe to retry.
        const activeFiles = new Set(Object.values(state.files).map(file => file.fileID))
        const pending = state.cleanup.find(job => !activeFiles.has(job.fileID))
        if (pending) {
          try {
            await files.remove(pending.fileID)
            state.cleanup = state.cleanup.filter(job => job.fileID !== pending.fileID)
          } catch { /* Keep the durable job when storage is unavailable. */ }
        }
        for (const image of uploads(store)) {
          if (!filename(image.filename)) throw fail('SERVICE_UNAVAILABLE', '图片元数据损坏')
          store.update('campus.uploads', { ...image, filePath: join(uploadsDir, image.filename) })
        }
        // Local cleanup is only a compatibility side effect. Cloud object
        // removals are derived below and persisted in state.cleanup instead.
        for (const { value: job } of store.query('campus.file_cleanup', '1', [], 'seq ASC', 2001)) {
          const name = String(job.filePath || '').split(/[\\/]/).at(-1)
          if (!filename(name)) throw fail('SERVICE_UNAVAILABLE', '图片清理任务损坏')
          store.update('campus.file_cleanup', { ...job, filePath: join(uploadsDir, name) })
        }
        const game = createGameService(state.game === null ? {} : { checkpoint: state.game })
        game.tick()
        const limited = consumeAuthLimit(state, input, store, now())
        if (!limited) server = createCampusServer({ store, dataDir: directory, publicOrigin, staticRoot,
          // The request-private store is saved only after the response is
          // prepared. A separate worker must read committed state to send push.
          pushProvider: null, service: game, tickMs: 2_147_483_647,
          async readUploadFile(image) {
            const entry = state.files[image.id]
            if (!entry || entry.size !== image.size) throw fail('SERVICE_UNAVAILABLE', '云端图片尚未迁移')
            const bytes = await files.download(entry.fileID)
            if (!Buffer.isBuffer(bytes) || bytes.length !== entry.size || hash(bytes) !== entry.sha256)
              throw fail('SERVICE_UNAVAILABLE', '云端图片校验失败')
            return bytes
          }
        })
        const response = limited || await exchange(server, input, publicOrigin)
        if (server?.listening) await new Promise(resolve => server.close(resolve))
        server = null
        const active = new Set()
        for (const image of uploads(store)) {
          active.add(image.id)
          if (!state.files[image.id]) {
            const bytes = await readFile(join(uploadsDir, image.filename))
            if (bytes.length !== image.size) throw fail('SERVICE_UNAVAILABLE', '上传图片字节校验失败')
            const cloudPath = `campus-private/${now()}/${randomUUID()}/${image.filename}`
            const fileID = await files.upload(cloudPath, bytes)
            staged.push(fileID)
            state.files[image.id] = { fileID, filename: image.filename, size: bytes.length, sha256: hash(bytes) }
          }
          store.update('campus.uploads', { ...image, filePath: canonicalPath(image.filename) })
        }
        for (const [id, entry] of Object.entries(state.files)) {
          if (active.has(id)) continue
          if (!state.cleanup.some(job => job.fileID === entry.fileID)) state.cleanup.push({ fileID: entry.fileID, createdAt: now() })
          delete state.files[id]
        }
        state.snapshot = exportSnapshot(store)
        state.game = game.checkpoint()
        return { state, response, staged }
      } catch (error) {
        // No state was submitted yet. Failed cleanup can leave private orphan
        // objects; operators must reconcile those against referenced paths.
        await Promise.allSettled(staged.map(id => files.remove(id)))
        throw error
      } finally {
        if (server?.listening) await new Promise(resolve => server.close(resolve))
        store.close()
        await rm(directory, { recursive: true, force: true })
      }
    }
  }
}

export function createCloudCoordinator({ repository, engine, files, retries = 3 }) {
  return {
    async dispatch(input) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const before = await repository.read()
        if (!before) throw fail('SERVICE_UNAVAILABLE', '云端数据库尚未初始化，请联系项目维护者')
        const result = await engine.execute(before, input)
        if (isDeepStrictEqual(before, result.state)) return result.response
        try {
          await repository.compareAndSwap(before.version, result.state)
          return result.response
        } catch (error) {
          // An uncertain commit may already reference newly uploaded objects.
          // Never delete those bytes or blindly repeat its business operation.
          if (error.code !== 'CLOUD_STATE_COMMIT_UNCERTAIN')
            await Promise.allSettled(result.staged.map(id => files.remove(id)))
          if (error.code !== 'CLOUD_STATE_CONFLICT' || attempt === retries) throw error
        }
      }
    },
    async cleanup() {
      const state = await repository.read()
      if (!state) return 0
      const active = new Set(Object.values(state.files).map(file => file.fileID)), removed = new Set()
      for (const job of state.cleanup.slice(0, 20)) {
        if (active.has(job.fileID)) continue
        try { await files.remove(job.fileID); removed.add(job.fileID) } catch { /* Durable job remains for retry. */ }
      }
      if (!removed.size) return 0
      const next = { ...state, cleanup: state.cleanup.filter(job => !removed.has(job.fileID)) }
      try { await repository.compareAndSwap(state.version, next) }
      catch (error) { if (error.code !== 'CLOUD_STATE_CONFLICT') throw error }
      return removed.size
    }
  }
}
