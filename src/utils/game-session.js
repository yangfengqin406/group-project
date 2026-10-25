// This is a separate, real guest credential. It is never a mock business save
// and must not share the campus-account token or travel between game servers.
const key = 'campus-plaza-game-guest-v1'
export function readGameSession(baseUrl) {
  const value = uni.getStorageSync(key)
  if (!value || value.baseUrl !== baseUrl || typeof value.token !== 'string' ||
    typeof value.playerId !== 'string' || typeof value.nickname !== 'string') return null
  return { token: value.token, playerId: value.playerId, nickname: value.nickname }
}
export function writeGameSession(baseUrl, value) {
  uni.setStorageSync(key, { baseUrl, token: value.token, playerId: value.playerId, nickname: value.nickname })
}
export function removeGameSession() {
  uni.removeStorageSync(key)
}
