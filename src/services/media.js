import { config } from '../config/index.js'
import { getToken } from '../utils/session.js'
import { resolveNativeImage } from '../platform/native-image.js'

export function resolveImage(src) {
  const token = getToken()
  return resolveNativeImage(src, {
    baseUrl: config.apiBaseUrl, token, current: () => getToken() === token,
    api: typeof uni === 'undefined' ? null : uni,
    native: globalThis.plus
  })
}
