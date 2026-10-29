import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createGameService, GameError } from './service.mjs'

export { createGameService, GameError } from './service.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2'
}

function send(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(JSON.stringify(value))
}

async function body(request) {
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 32 * 1024) throw new GameError('INVALID_ARGUMENT', '请求内容过大')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new GameError('INVALID_ARGUMENT', '请求必须是有效JSON') }
}

export function createLandlordServer(options = {}) {
  const service = options.service || createGameService(options)
  const staticRoot = resolve(options.staticRoot || resolve(ROOT, 'dist/build/h5'))
  const server = createServer(async (request, response) => {
    try {
      const origin = request.headers.origin
      if (origin) {
        let originHost
        try { originHost = new URL(origin).host } catch { /* Reject malformed origins below. */ }
        const allowed = originHost === request.headers.host || (options.allowedOrigins || []).includes(origin)
        if (!allowed) return send(response, 403, { code: 'FORBIDDEN', message: '请从本机或局域网游戏页面进入', data: null })
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Vary', 'Origin')
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      }
      const url = new URL(request.url, 'http://localhost')
      if (request.method === 'OPTIONS' && url.pathname === '/game/rpc') {
        response.writeHead(204)
        response.end()
        return
      }
      if (request.method === 'GET' && url.pathname === '/game/health')
        return send(response, 200, { code: 'OK', message: '', data: service.health() })
      if (request.method === 'POST' && url.pathname === '/game/rpc') {
        if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || ''))
          throw new GameError('INVALID_ARGUMENT', '请使用application/json提交')
        const input = await body(request)
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
            Object.keys(input).some((key) => !['method', 'params'].includes(key)))
          throw new GameError('INVALID_ARGUMENT', '请求格式不符合约定')
        const auth = request.headers.authorization || ''
        const token = /^Bearer [A-Za-z0-9_-]+$/.test(auth) ? auth.slice(7) : ''
        if (auth && !token) throw new GameError('UNAUTHORIZED', '访客令牌格式无效')
        return send(response, 200, { code: 'OK', message: '', data: service.dispatch(input.method, input.params, token) })
      }
      if (url.pathname.startsWith('/game/'))
        return send(response, 404, { code: 'NOT_FOUND', message: '接口不存在', data: null })
      if (!['GET', 'HEAD'].includes(request.method))
        return send(response, 405, { code: 'INVALID_ARGUMENT', message: '请求方式不支持', data: null })
      let pathname
      try { pathname = decodeURIComponent(url.pathname) }
      catch { return send(response, 400, { code: 'INVALID_ARGUMENT', message: '地址格式无效', data: null }) }
      if (pathname.includes('\0') || pathname.includes('\\'))
        return send(response, 404, { code: 'NOT_FOUND', message: '文件不存在', data: null })
      const target = resolve(staticRoot, `.${pathname === '/' ? '/index.html' : pathname}`)
      const location = relative(staticRoot, target)
      if (location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location))
        return send(response, 404, { code: 'NOT_FOUND', message: '文件不存在', data: null })
      let info
      try { info = await stat(target) }
      catch { return send(response, 404, { code: 'NOT_FOUND', message: '文件不存在；请先运行本地游戏构建命令', data: null }) }
      if (!info.isFile()) return send(response, 404, { code: 'NOT_FOUND', message: '文件不存在', data: null })
      response.writeHead(200, {
        'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      })
      if (request.method === 'HEAD') response.end()
      else createReadStream(target).on('error', () => response.destroy()).pipe(response)
    } catch (error) {
      const known = error instanceof GameError
      send(response, known && error.code === 'UNAUTHORIZED' ? 401 : known ? 400 : 500, {
        code: known ? error.code : 'SERVICE_UNAVAILABLE',
        message: known ? error.message : '牌桌服务暂时不可用，请稍后重试', data: null
      })
    }
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  const interval = setInterval(() => service.tick(), options.tickMs ?? 250)
  interval.unref()
  server.once('close', () => clearInterval(interval))
  server.gameService = service
  return server
}

export async function startLandlordServer(options = {}) {
  const host = options.host || process.env.GAME_HOST || '0.0.0.0'
  const rawPort = options.port ?? process.env.GAME_PORT ?? 8787
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('GAME_PORT必须是0到65535的整数')
  const server = createLandlordServer(options)
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(port, host, done)
  })
  const activePort = server.address().port
  process.stdout.write(`斗地主局域网服务：http://127.0.0.1:${activePort}/#/\n`)
  if (host === '0.0.0.0') {
    for (const entries of Object.values(networkInterfaces())) {
      for (const address of entries || []) {
        if (address.family === 'IPv4' && !address.internal)
          process.stdout.write(`同Wi-Fi设备打开：http://${address.address}:${activePort}/#/\n`)
      }
    }
  }
  process.stdout.write('访客与牌局仅保存在本进程内存；服务重启后重新入座。\n')
  return server
}

export const startServer = startLandlordServer

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startLandlordServer().catch((error) => {
    process.stderr.write(`启动失败：${error.message}\n`)
    process.exitCode = 1
  })
}
