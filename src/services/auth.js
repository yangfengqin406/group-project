import { call } from './transport.js'
import { getToken, setToken, setSession } from '../utils/session.js'
import { ServiceError } from '../utils/errors.js'
export async function login(params = {}) {
  const previousToken = getToken()
  const result = await call('auth.login', params)
  if (getToken() !== previousToken) throw new ServiceError('CONFLICT', '账号已切换，请重新登录')
  setToken(result.token)
  setSession(result.user)
  return result
}
export async function register(params = {}) {
  const previousToken = getToken()
  const result = await call('auth.register', params)
  if (getToken() !== previousToken) throw new ServiceError('CONFLICT', '账号已切换，请重新登录')
  setToken(result.token)
  setSession(result.user)
  return result
}
export async function logout() {
  const token = getToken()
  await call('auth.logout')
  if (getToken() === token) { setToken(''); setSession(null) }
}
