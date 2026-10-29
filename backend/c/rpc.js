import { randomUUID } from 'node:crypto'
import { CServiceError } from './service.js'

// Mount behind the team's HTTPS endpoint. Authentication is provided by B;
// no demo identity, client-supplied userId or static shared token is accepted.
export function createCRpcHandler({ service, authenticate, onError = () => {} }) {
  if (typeof authenticate !== 'function') throw new Error('A trusted authenticate callback is required')
  return async (req, res) => {
    const requestId = randomUUID()
    const reply = (code, message, data = null, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ code, message, data, requestId }))
    }
    if (req.method !== 'POST' || req.url?.split('?')[0] !== '/rpc') {
      reply('NOT_FOUND', '接口不存在', null, 404); return
    }
    try {
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || ''))
        throw new CServiceError('INVALID_ARGUMENT', '请提交 JSON 请求')
      const bearer = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '')
      if (!bearer || bearer[1].length > 8192) throw new CServiceError('UNAUTHENTICATED', '请先登录')
      const principal = await authenticate(bearer[1])
      if (!principal?.userId) throw new CServiceError('UNAUTHENTICATED', '登录已过期')
      const chunks = []
      let bytes = 0
      // Keep the request stream readable on size rejection so the client can
      // receive the envelope instead of an unexplained connection reset.
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        bytes += chunk.length
        if (bytes > 64 * 1024) {
          req.resume()
          throw new CServiceError('INVALID_ARGUMENT', '请求内容过大')
        }
        chunks.push(chunk)
      }
      let payload
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      catch { throw new CServiceError('INVALID_ARGUMENT', 'JSON 格式不正确') }
      if (!payload || typeof payload !== 'object' || typeof payload.method !== 'string')
        throw new CServiceError('INVALID_ARGUMENT', '请求格式不正确')
      const data = service.invoke(payload.method, payload.params ?? {}, principal)
      reply('OK', '', data)
    } catch (error) {
      if (error instanceof CServiceError) reply(error.code, error.message)
      else {
        // Log only the server-assigned correlation ID; never a bearer or body.
        onError({ requestId, code: 'C_RPC_FAILURE' })
        reply('SERVICE_UNAVAILABLE', '服务暂时不可用，请稍后重试')
      }
    }
  }
}
