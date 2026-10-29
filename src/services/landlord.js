import { config } from '../config/index.js'
import { gameCall } from './game-transport.js'
import { readGameSession, writeGameSession, removeGameSession } from '../utils/game-session.js'
import { ServiceError } from '../utils/errors.js'

let openingRevision = 0
export function getSetup() { return { configured: Boolean(config.gameBaseUrl) } }
export function getSavedSession() {
  const value = readGameSession(config.gameBaseUrl)
  return value ? { playerId: value.playerId, nickname: value.nickname } : null
}
export function clearSession() { openingRevision++; removeGameSession() }
export async function openSession(params) {
  const current = ++openingRevision
  const previousToken = readGameSession(config.gameBaseUrl)?.token || ''
  const result = await gameCall('session.open', params, { token: previousToken })
  if (current !== openingRevision || (readGameSession(config.gameBaseUrl)?.token || '') !== previousToken)
    throw new ServiceError('CONFLICT', '这次入座已被更新的会话替代，请继续当前牌桌。')
  if (!result || !result.token || !result.playerId || !result.nickname)
    throw new ServiceError('SERVICE_UNAVAILABLE', '访客会话没有正确建立，请重新进入。')
  writeGameSession(config.gameBaseUrl, result)
  return { playerId: result.playerId, nickname: result.nickname }
}
export const getLobby = () => gameCall('landlord.getLobby')
export const joinQueue = (params) => gameCall('landlord.joinQueue', params)
export const cancelQueue = (params) => gameCall('landlord.cancelQueue', params)
export const getRoom = (params) => gameCall('landlord.getRoom', params)
export const bid = (params) => gameCall('landlord.bid', params)
export const play = (params) => gameCall('landlord.play', params)
export const pass = (params) => gameCall('landlord.pass', params)
export const hint = (params) => gameCall('landlord.hint', params)
export const setAuto = (params) => gameCall('landlord.setAuto', params)
export const leave = (params) => gameCall('landlord.leave', params)
