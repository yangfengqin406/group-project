import { ServiceError } from '../utils/errors.js'

export async function resolveNativeImage(src, { baseUrl, token, current = () => true, api, native } = {}) {
  const direct = { src, release() {} }
  if (!native?.io || !api?.downloadFile || typeof src !== 'string') return direct
  // App's service JS engine need not provide the browser URL constructor.
  // Only this service's exact opaque file IDs may receive the session header.
  if (typeof baseUrl !== 'string' || !/^https?:\/\/[^\s/@?#]+\/api\/?$/.test(baseUrl)) return direct
  const prefix = baseUrl.replace(/\/$/, '') + '/files/'
  if (!src.startsWith(prefix) || !/^[A-Za-z0-9_-]+$/.test(src.slice(prefix.length))) return direct
  const path = await new Promise((resolve, reject) => api.downloadFile({
    url: src, header: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 12000,
    success(result) {
      if (result.statusCode !== 200 || typeof result.tempFilePath !== 'string' || !result.tempFilePath)
        return reject(new ServiceError('SERVICE_UNAVAILABLE', '图片暂时无法读取'))
      resolve(result.tempFilePath)
    },
    fail: () => reject(new ServiceError('SERVICE_UNAVAILABLE', '图片暂时无法读取，请检查网络'))
  }))
  let released = false
  const release = () => {
    if (released) return
    released = true
    try { native.io.resolveLocalFileSystemURL(path, (entry) => entry.remove(() => {}, () => {}), () => {}) } catch { /* OS may already have removed temporary media. */ }
  }
  if (!current()) { release(); throw new ServiceError('CONFLICT', '账号已切换') }
  return { src: path, release }
}
