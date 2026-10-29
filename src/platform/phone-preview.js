import { ServiceError } from '../utils/errors.js'

// Only the explicit phone-preview build calls this gate. App registration stays
// synchronous; HTTP waits for the supported development API to finish instead.
export function createPreviewAccess(getPlatform, { timeoutMs = 3000 } = {}) {
  let preparation, ready = false
  return function ensure() {
    const platform = getPlatform()
    if (!platform?.getAccountInfoSync || !platform?.setEnableDebug) return Promise.resolve()
    let version
    try { version = platform.getAccountInfoSync()?.miniProgram?.envVersion } catch { return Promise.resolve() }
    if (!['develop', 'trial'].includes(version)) return Promise.resolve()
    let enabled
    try { enabled = platform.getAppBaseInfo?.()?.enableDebug } catch { /* Older runtimes may not expose this state. */ }
    if (preparation && (!ready || enabled !== false)) return preparation
    ready = false
    const pending = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new ServiceError('SERVICE_UNAVAILABLE', '微信开发调试准备超时，请重试或使用H5入口')), timeoutMs)
      const finish = (error) => { clearTimeout(timer); error ? reject(error) : resolve() }
      try {
        platform.setEnableDebug({ enableDebug: true,
          success: () => finish(),
          fail: () => finish(new ServiceError('SERVICE_UNAVAILABLE', '当前微信无法开启开发调试，请检查开发/体验权限或使用H5入口'))
        })
      } catch { finish(new ServiceError('SERVICE_UNAVAILABLE', '当前微信不支持开发调试，请使用H5入口')) }
    })
    preparation = pending
    pending.then(() => { if (preparation === pending) ready = true },
      () => { if (preparation === pending) preparation = undefined })
    return pending
  }
}

export const ensurePhonePreview = createPreviewAccess(() => typeof wx === 'undefined' ? undefined : wx)
