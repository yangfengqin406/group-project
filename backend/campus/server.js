import { randomUUID } from 'node:crypto'
import { createReadStream, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openCStore } from '../c/store.js'
import { createCampusService } from './service.js'
import { localAddresses } from './network.js'
import { publicAccess } from './public-access.js'
import { createLandlordServer } from '../../server/landlord/index.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fail = (code, message) => Object.assign(new Error(message), { code })

async function readBody(request, limit) {
  let bytes = 0
  const chunks = []
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length
    if (bytes > limit) { request.resume(); throw fail('INVALID_ARGUMENT', '上传或请求内容过大') }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function multipart(buffer, header) {
  const boundary = /boundary=(?:"([^"]{1,70})"|([^;\s]{1,70}))/i.exec(header)
  if (!boundary) throw fail('INVALID_ARGUMENT', '上传格式无效')
  const marker = Buffer.from(`--${boundary[1] || boundary[2]}`)
  if (!buffer.subarray(0, marker.length).equals(marker)) throw fail('INVALID_ARGUMENT', '上传格式无效')
  let cursor = marker.length
  let image
  let closed = false
  while (cursor < buffer.length) {
    if (buffer.subarray(cursor, cursor + 2).toString() === '--') {
      const tail = buffer.subarray(cursor + 2).toString()
      if (tail !== '' && tail !== '\r\n') throw fail('INVALID_ARGUMENT', '上传结束标记无效')
      closed = true
      break
    }
    if (buffer.subarray(cursor, cursor + 2).toString() !== '\r\n') throw fail('INVALID_ARGUMENT', '上传格式无效')
    cursor += 2
    const endHeaders = buffer.indexOf('\r\n\r\n', cursor)
    if (endHeaders < 0 || endHeaders - cursor > 4096) throw fail('INVALID_ARGUMENT', '上传头无效')
    const headers = buffer.subarray(cursor, endHeaders).toString('utf8')
    const start = endHeaders + 4
    const next = buffer.indexOf(Buffer.concat([Buffer.from('\r\n'), marker]), start)
    if (next < 0) throw fail('INVALID_ARGUMENT', '图片上传不完整')
    const isFile = /content-disposition:\s*form-data;[^\r\n]*\bname="file"/i.test(headers) && /\bfilename="[^"\r\n]*"/i.test(headers)
    if (isFile) {
      if (image) throw fail('INVALID_ARGUMENT', '每次只能上传一张图片')
      image = { buffer: buffer.subarray(start, next), mime: /^content-type:\s*([^\r\n]+)/im.exec(headers)?.[1]?.trim() || '' }
    } else throw fail('INVALID_ARGUMENT', '只允许上传 file 图片字段')
    cursor = next + 2 + marker.length
  }
  if (!closed) throw fail('INVALID_ARGUMENT', '图片上传不完整')
  if (!image) throw fail('INVALID_ARGUMENT', '请选择图片文件')
  return image
}

export function createCampusServer(options = {}) {
  const access = publicAccess(options)
  const dataDir = resolve(options.dataDir || process.env.CAMPUS_DATA_DIR || resolve(ROOT, '.local-campus'))
  mkdirSync(dataDir, { recursive: true })
  const store = options.store || openCStore(resolve(dataDir, 'campus.sqlite'))
  const trustedUploadOrigins = []
  const service = createCampusService({
    store, uploadsDir: resolve(dataDir, 'uploads'), uploadOrigin: '', trustedUploadOrigins
  })
  const server = createLandlordServer({ ...options, staticRoot: options.staticRoot || resolve(ROOT, 'dist/local/campus-h5') })
  const [fallback] = server.listeners('request')
  server.removeAllListeners('request')
  const attempts = new Map()
  // Keep one address for stored image URLs. Every H5 client uses this origin,
  // including the host computer, so cookies and uploads work on all devices.
  const publicHost = options.publicHost || process.env.CAMPUS_PUBLIC_HOST || localAddresses().find((host) => !['127.0.0.1', 'localhost'].includes(host)) || '127.0.0.1'
  const publicOrigin = () => access.origin || `http://${publicHost}:${server.address()?.port}`
  const origins = () => {
    const port = server.address()?.port
    const values = access.origin ? [access.origin] : [...new Set([...localAddresses(), publicHost])].map((host) => `http://${host}:${port}`)
    trustedUploadOrigins.splice(0, trustedUploadOrigins.length, ...values)
    return values
  }
  const principal = (request, cookies = false) => {
    const bearer = /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.authorization || '')?.[1]
    const cookie = cookies ? /(?:^|;\s*)campus_session=([A-Za-z0-9_-]+)/.exec(request.headers.cookie || '')?.[1] : ''
    const token = bearer || cookie || ''
    return { ...(token ? service.accounts.authenticate(token) : null), token }
  }
  const limited = (request, method) => {
    const key = `${access.clientAddress(request)}:${method}`
    const now = Date.now()
    for (const [id, row] of attempts) if (now - row.start > 60_000) attempts.delete(id)
    const row = attempts.get(key) || { start: now, count: 0 }
    row.count++
    attempts.set(key, row)
    if (row.count > (method === 'auth.register' ? 10 : 25)) throw fail('RATE_LIMITED', '尝试过于频繁，请一分钟后再试')
  }
  server.on('request', async (request, response) => {
    const requestId = randomUUID()
    const reply = (code, message = '', data = null, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      response.end(JSON.stringify({ code, message, data, requestId }))
    }
    try {
      const url = new URL(request.url, 'http://localhost')
      if (!url.pathname.startsWith('/api/')) {
        const correctHost = access.origin ? access.acceptsHost(request.headers.host) : `http://${request.headers.host}` === publicOrigin()
        if (['GET', 'HEAD'].includes(request.method) && !url.pathname.startsWith('/game/') && !correctHost) {
          response.writeHead(302, { Location: `${publicOrigin()}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' })
          return response.end()
        }
        return await fallback(request, response)
      }
      const allowed = origins()
      // Local process/container health checks need no public Host override.
      if (request.method === 'GET' && url.pathname === '/api/health' && !request.headers.origin &&
        ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress))
        return reply('OK', '', { mode: 'local-persistent', database: 'sqlite', wechatConfigured: false })
      const origin = access.origin && access.acceptsHost(request.headers.host) ? access.origin : `http://${request.headers.host}`
      if (!allowed.includes(origin) || (request.headers.origin && !allowed.includes(request.headers.origin)))
        return reply('FORBIDDEN', '请使用服务打印的本机或同 Wi-Fi 地址', null, 403)
      if (request.headers.origin) {
        response.setHeader('Access-Control-Allow-Origin', request.headers.origin)
        response.setHeader('Access-Control-Allow-Credentials', 'true')
        response.setHeader('Vary', 'Origin')
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      }
      if (request.method === 'OPTIONS') { response.writeHead(204); return response.end() }
      if (request.method === 'GET' && url.pathname === '/api/health')
        return reply('OK', '', { mode: 'local-persistent', database: 'sqlite', wechatConfigured: false })
      if (request.method === 'POST' && url.pathname === '/api/rpc') {
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw fail('INVALID_ARGUMENT', '请提交 JSON 请求')
        let input, raw
        try { raw = await readBody(request, 1024 * 1024); input = JSON.parse(raw.toString('utf8')) }
        catch (error) { if (error.code) throw error; throw fail('INVALID_ARGUMENT', 'JSON 格式不正确') }
        if (!input || typeof input.method !== 'string' || Object.keys(input).some((key) => !['method', 'params'].includes(key)))
          throw fail('INVALID_ARGUMENT', '请求格式不正确')
        if (raw.length > 64 * 1024 && input.method !== 'pet.save') throw fail('INVALID_ARGUMENT', '请求内容过大')
        if (['auth.login', 'auth.register'].includes(input.method)) limited(request, input.method)
        const data = service.invoke(input.method, input.params ?? {}, principal(request))
        if (['auth.login', 'auth.register'].includes(input.method) && data.token)
          response.setHeader('Set-Cookie', `campus_session=${data.token}; HttpOnly; SameSite=Strict; Path=/api/files; Max-Age=604800${access.secureCookie ? '; Secure' : ''}`)
        if (input.method === 'auth.logout') response.setHeader('Set-Cookie', `campus_session=; HttpOnly; SameSite=Strict; Path=/api/files; Max-Age=0${access.secureCookie ? '; Secure' : ''}`)
        return reply('OK', '', data)
      }
      if (request.method === 'POST' && url.pathname === '/api/upload') {
        const identity = principal(request)
        if (!identity.userId) throw fail('UNAUTHENTICATED', '请先登录本地账号')
        if (!/^multipart\/form-data;/i.test(request.headers['content-type'] || '')) throw fail('INVALID_ARGUMENT', '请上传图片文件')
        const image = multipart(await readBody(request, 5 * 1024 * 1024 + 8192), request.headers['content-type'])
        return reply('OK', '', service.accounts.receiveUpload({ ...image, userId: identity.userId, usage: url.searchParams.get('usage'), origin: publicOrigin() }))
      }
      const file = /^\/api\/files\/([A-Za-z0-9_-]+)$/.exec(url.pathname)
      if (['GET', 'HEAD'].includes(request.method) && file) {
        const image = service.accounts.getUpload(file[1])
        if (!service.canReadUpload(image, principal(request, true))) return reply('NOT_FOUND', '图片不存在或无权查看', null, 404)
        response.writeHead(200, { 'Content-Type': image.mime, 'Content-Length': image.size, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-site' })
        if (request.method === 'HEAD') return response.end()
        createReadStream(image.filePath).on('error', () => response.destroy()).pipe(response)
        return
      }
      reply('NOT_FOUND', '接口不存在', null, 404)
    } catch (error) {
      const known = ['INVALID_ARGUMENT', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'NOT_IMPLEMENTED', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE'].includes(error.code)
      if (!known) options.onError?.({ requestId, code: 'CAMPUS_FAILURE' })
      reply(known ? error.code : 'SERVICE_UNAVAILABLE', known ? error.message : '服务暂时不可用，请稍后重试')
    }
  })
  server.once('close', () => { if (!options.store) store.close() })
  server.campusService = service
  return server
}

export async function startCampusServer(options = {}) {
  const port = Number(options.port ?? process.env.CAMPUS_PORT ?? 8788)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('CAMPUS_PORT 必须为 0～65535')
  const server = createCampusServer(options)
  await new Promise((done, reject) => { server.once('error', reject); server.listen(port, options.host || process.env.CAMPUS_BIND_HOST || '0.0.0.0', done) })
  const activePort = server.address().port
  const bindHost = options.host || process.env.CAMPUS_BIND_HOST || '0.0.0.0'
  const printedAddresses = ['127.0.0.1', '::1'].includes(bindHost) ? [bindHost === '::1' ? '[::1]' : bindHost] : localAddresses()
  for (const address of printedAddresses) process.stdout.write(`${address === '127.0.0.1' ? '本机' : '访问'}：http://${address}:${activePort}/#/\n`)
  if (options.publicOrigin || process.env.CAMPUS_PUBLIC_ORIGIN) process.stdout.write(`公共入口：${options.publicOrigin || process.env.CAMPUS_PUBLIC_ORIGIN}/#/\n`)
  process.stdout.write('账号、图片、业务与玩法进度保存在SQLite；保持服务运行。独立账号未核验学籍；微信审核需另行完成。\n')
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startCampusServer().catch((error) => { process.stderr.write(`启动失败：${error.message}\n`); process.exitCode = 1 })
}
