import { isIP } from 'node:net'

const ip = value => {
  if (typeof value !== 'string') return ''
  const text = value.trim().replace(/^::ffff:/i, '')
  if (isIP(text) === 4) return text
  if (isIP(text) === 6) return new URL(`http://[${text}]/`).hostname.slice(1, -1)
  return ''
}

export function publicAccess(options = {}, env = process.env) {
  const configured = options.publicOrigin ?? env.CAMPUS_PUBLIC_ORIGIN ?? ''
  let origin = ''
  if (configured) {
    let url
    try { url = new URL(configured) } catch { throw new Error('CAMPUS_PUBLIC_ORIGIN 必须是完整HTTPS源') }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error('CAMPUS_PUBLIC_ORIGIN 只允许HTTPS源，不能含路径、查询或凭据')
    origin = url.origin
  }
  const source = options.trustedProxies ?? env.CAMPUS_TRUSTED_PROXIES ?? ''
  const entries = Array.isArray(source) ? source : String(source).split(',').map(value => value.trim()).filter(Boolean)
  const trusted = new Set(entries.map(value => {
    const parsed = ip(value)
    if (!parsed) throw new Error('CAMPUS_TRUSTED_PROXIES 只能填写明确的代理IP')
    return parsed
  }))
  return {
    origin,
    secureCookie: Boolean(origin),
    acceptsHost(host) {
      if (!origin || typeof host !== 'string') return false
      try {
        const value = new URL(`https://${host}`)
        return !value.username && !value.password && value.pathname === '/' && !value.search && !value.hash && value.origin === origin
      } catch { return false }
    },
    clientAddress(request) {
      const remote = ip(request.socket.remoteAddress) || request.socket.remoteAddress || 'unknown'
      if (!trusted.has(remote)) return remote
      const header = request.headers['x-forwarded-for']
      if (typeof header !== 'string' || header.length > 1024) return remote
      const chain = header.split(',').map(ip)
      if (!chain.length || chain.length > 16 || chain.some(value => !value)) return remote
      let current = remote
      for (let i = chain.length - 1; i >= 0 && trusted.has(current); i--) current = chain[i]
      return current
    }
  }
}
