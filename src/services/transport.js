import { config } from '../config/index.js'
import { mockRequest } from '../mock/index.js'
import { session, getToken, setToken, setSession, openLogin } from '../utils/session.js'
import { ServiceError } from '../utils/errors.js'
let restoringIdentity
let restoringToken
export async function restoreIdentity() {
  const token = getToken()
  if (config.apiMode !== 'http' || !token || session.user) return session.user
  if (!restoringIdentity || restoringToken !== token) {
    const pending = call('user.getProfile').then((profile) => {
      if (getToken() === token) setSession(profile)
      return session.user
    }).finally(() => { if (restoringIdentity === pending) restoringIdentity = null })
    restoringToken = token
    restoringIdentity = pending
  }
  return restoringIdentity
}
export async function call(method, params = {}) {
  const requestToken = getToken()
  let result
  if (config.apiMode === 'mock') result = await mockRequest(method, params)
  else if (config.apiMode === 'http') {
    if (!config.apiBaseUrl)
      throw new ServiceError('SERVICE_UNAVAILABLE', '请先配置后端地址')
    if (method !== 'user.getProfile' && !method.startsWith('auth.')) await restoreIdentity()
    if (getToken() !== requestToken) throw new ServiceError('CONFLICT', '账号已切换，请重新操作')
    result = await new Promise((resolve, reject) =>
      uni.request({
        url: `${config.apiBaseUrl}/rpc`,
        method: 'POST',
        data: { method, params },
        timeout: 12000,
        header: {
          'Content-Type': 'application/json',
          ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {})
        },
        success: (response) => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new ServiceError(
                'SERVICE_UNAVAILABLE',
                `服务请求失败（${response.statusCode}）`
              )
            )
            return
          }
          resolve(response.data)
        },
        fail: () =>
          reject(
            new ServiceError(
              'SERVICE_UNAVAILABLE',
              '网络连接失败，请检查网络或服务地址'
            )
          )
      })
    )
  } else
    throw new ServiceError(
      'INVALID_ARGUMENT',
      '未知接口模式，请使用 mock 或 http'
    )
  if (!result || typeof result.code !== 'string' || !('data' in result))
    throw new ServiceError('SERVICE_UNAVAILABLE', '服务返回格式不符合约定')
  if (result.code === 'UNAUTHENTICATED' && !method.startsWith('auth.') && getToken() === requestToken) {
    setToken('')
    setSession(null)
    openLogin()
  }
  if (result.code !== 'OK')
    throw new ServiceError(result.code, result.message || '操作失败')
  return result.data
}
