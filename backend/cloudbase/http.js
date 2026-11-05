import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, relative, isAbsolute, extname, sep } from 'node:path'

const TYPES = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon' }

export function createCloudHttpServer({ coordinator, repository, publicOrigin, staticRoot }) {
  const origin = new URL(publicOrigin), root = resolve(staticRoot)
  if (origin.protocol !== 'https:' || origin.origin !== publicOrigin) throw new Error('Fixed HTTPS origin is required')
  const send = (response, code, message, data = null, status = 200) => {
    response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' })
    response.end(JSON.stringify({ code, message, data, requestId: randomUUID() }))
  }
  return createServer(async (request, response) => {
    try {
      // A platform proxy may rewrite Host. The configured public origin is
      // authoritative; reject a foreign browser Origin before any state access.
      if (request.headers.origin && request.headers.origin !== publicOrigin)
        return send(response,'FORBIDDEN','请使用本应用的云端入口',null,403)
      if (request.headers.origin) {
        response.setHeader('Access-Control-Allow-Origin',publicOrigin)
        response.setHeader('Access-Control-Allow-Credentials','true')
        response.setHeader('Vary','Origin')
      }
      const url = new URL(request.url,'http://localhost')
      const path = url.pathname
      if (path.startsWith('/api/') || path.startsWith('/game/')) {
        if (request.method === 'OPTIONS') {
          response.writeHead(204, { 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Access-Control-Allow-Methods':'GET, HEAD, POST, OPTIONS' })
          return response.end()
        }
        if (request.method === 'GET' && path === '/api/health') {
          const state = await repository.read()
          if (!state) return send(response,'SERVICE_UNAVAILABLE','云端数据尚未初始化',null,503)
          return send(response,'OK','',{ mode:'local-persistent', database:'sqlite', wechatConfigured:false,
            persistence:'cloudbase', profile:'course-test' })
        }
        const limit = path === '/api/upload' ? 5*1024*1024+8192 : path === '/api/rpc' ? 1024*1024 : 32*1024
        let length = 0; const chunks = []
        for await (const chunk of request.iterator({ destroyOnReturn:false })) {
          length += chunk.length
          if (length > limit) { request.resume(); return send(response,'INVALID_ARGUMENT','上传或请求内容过大') }
          chunks.push(chunk)
        }
        const result = await coordinator.dispatch({ method:request.method, url:path+url.search, headers:request.headers, body:Buffer.concat(chunks) })
        const headers = { ...result.headers }
        delete headers.connection; delete headers['keep-alive']; delete headers['transfer-encoding']
        response.writeHead(result.status, headers)
        return response.end(result.body)
      }
      if (!['GET','HEAD'].includes(request.method)) return send(response,'NOT_FOUND','接口不存在',null,404)
      let decoded
      try { decoded = decodeURIComponent(path) } catch { return send(response,'NOT_FOUND','文件不存在',null,404) }
      if (decoded.includes('\0') || decoded.includes('\\')) return send(response,'NOT_FOUND','文件不存在',null,404)
      const target = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`), location = relative(root,target)
      if (isAbsolute(location) || location === '..' || location.startsWith(`..${sep}`)) return send(response,'NOT_FOUND','文件不存在',null,404)
      let info
      try { info = await stat(target) } catch { return send(response,'NOT_FOUND','文件不存在',null,404) }
      if (!info.isFile()) return send(response,'NOT_FOUND','文件不存在',null,404)
      response.writeHead(200, { 'Content-Type':TYPES[extname(target)] || 'application/octet-stream',
        'Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff' })
      if (request.method === 'HEAD') return response.end()
      createReadStream(target).on('error',()=>response.destroy()).pipe(response)
    } catch (error) {
      // Never log SDK errors or request bodies: either can contain credentials.
      const message = error.code === 'CLOUD_STATE_CONFLICT' ? '操作较多，请稍后重试' :
        error.code === 'CLOUD_STATE_COMMIT_UNCERTAIN' ? '连接中断，操作结果待确认，请先刷新查看' :
        ['CLOUD_STATE_INVALID','CLOUD_SNAPSHOT_INVALID'].includes(error.code) ? '云端数据校验未通过，请联系项目维护者' :
        error.code === 'SERVICE_UNAVAILABLE' ? error.message : '云端服务暂时不可用，请稍后重试'
      if (!response.headersSent) send(response,'SERVICE_UNAVAILABLE',message)
      else response.destroy()
    }
  })
}
