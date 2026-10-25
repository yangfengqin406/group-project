import { config } from '../config/index.js'
import { readGameSession } from '../utils/game-session.js'
import { ServiceError } from '../utils/errors.js'

// Intentionally independent from business transport: no mock branch, no demo
// fallback, and no campus-account bearer sent to the card-game server.
export async function gameCall(method, params = {}, options = {}) {
  if (!config.gameBaseUrl) throw new ServiceError('SERVICE_UNAVAILABLE',
    '牌桌联机服务尚未配置。请从主机提供的局域网链接进入，暂时不能匹配。')
  const token = options.token ?? readGameSession(config.gameBaseUrl)?.token
  const result = await new Promise((resolve, reject) => uni.request({
    url: `${config.gameBaseUrl}/rpc`, method: 'POST', data: { method, params }, timeout: 10000,
    header: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    success: (response) => {
      const value = response.data
      if (value && typeof value.code === 'string' && 'data' in value) {
        if (value.code !== 'OK') return reject(new ServiceError(value.code, value.message || '牌桌操作失败'))
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(value.data)
      }
      reject(new ServiceError('SERVICE_UNAVAILABLE', `牌桌暂时没有正确回应（${response.statusCode}），请重试。`))
    },
    fail: () => reject(new ServiceError('SERVICE_UNAVAILABLE', '连接牌桌失败。请检查 Wi-Fi 和主机服务，再试一次。'))
  }))
  return result
}
