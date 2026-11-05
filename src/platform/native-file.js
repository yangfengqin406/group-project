import { ServiceError } from '../utils/errors.js'

export function readNativePng(path, platform = globalThis.plus) {
  return new Promise((resolve, reject) => {
    if (!platform?.io?.resolveLocalFileSystemURL || !platform.io.FileReader)
      return reject(new ServiceError('NOT_SUPPORTED', '当前设备无法读取本地 PNG'))
    if (typeof path !== 'string' || !path || /^(https?:|data:|blob:)/i.test(path))
      return reject(new ServiceError('INVALID_ARGUMENT', '请选择手机相册中的 PNG 图片'))
    let finished = false
    const finish = (error, value) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      error ? reject(error) : resolve(value)
    }
    const failed = () => finish(new ServiceError('SERVICE_UNAVAILABLE', '无法读取本地图片，请重新选择 PNG'))
    const timer = setTimeout(failed, 10000)
    try {
      platform.io.resolveLocalFileSystemURL(path, (entry) => entry.file((file) => {
        if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 256 * 1024)
          return finish(new ServiceError('INVALID_ARGUMENT', 'PNG 图片需大于 0 且不超过 256 KiB'))
        const reader = new platform.io.FileReader()
        reader.onerror = failed
        reader.onloadend = (event) => {
          const data = event?.target?.result ?? reader.result
          if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,'))
            return finish(new ServiceError('INVALID_ARGUMENT', '请选择有效的 PNG 图片'))
          finish(null, { type: 'png', data })
        }
        reader.readAsDataURL(file)
      }, failed), failed)
    } catch { failed() }
  })
}
