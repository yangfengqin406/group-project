import { call } from './transport.js'
import { getToken, setSession } from '../utils/session.js'
export async function getProfile(params = {}) {
  const token = getToken()
  const profile = await call('user.getProfile', params)
  if (!params.userId && getToken() === token) setSession(profile)
  return profile
}
export async function updateProfile(params = {}) {
  const token = getToken()
  const profile = await call('user.updateProfile', params)
  if (getToken() === token) setSession(profile)
  return profile
}
export const listPublicContent = (params = {}) =>
  call('user.listPublicContent', params)
