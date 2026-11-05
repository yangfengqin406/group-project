import { call, readOwnProfile } from './transport.js'
import { getToken, setSession } from '../utils/session.js'
export async function getProfile(params = {}) {
  if (params && typeof params === 'object' && !Array.isArray(params) && !Object.keys(params).length)
    return readOwnProfile()
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
export const block = (params = {}) => call('user.block', params)
export const unblock = (params = {}) => call('user.unblock', params)
export const listBlocked = (params = {}) => call('user.listBlocked', params)
