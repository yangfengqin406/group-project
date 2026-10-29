import { call } from './transport.js'
import { config } from '../config/index.js'
import { getToken } from '../utils/session.js'
import { ServiceError } from '../utils/errors.js'
export async function create(params = {}) {
  if (config.apiMode === 'mock') return call('upload.create', params)
  if (!config.apiBaseUrl) throw new ServiceError('SERVICE_UNAVAILABLE', '请先配置后端地址')
  const token = getToken()
  const image = await new Promise((resolve, reject) => uni.uploadFile({
    url: `${config.apiBaseUrl}/upload?usage=${encodeURIComponent(params.usage || '')}`,
    filePath: params.data, name: 'file',
    header: { Authorization: `Bearer ${token}` },
    success(response) {
      let result
      try { result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data } catch { /* Invalid response below. */ }
      if (response.statusCode !== 200 || !result?.code) return reject(new ServiceError('SERVICE_UNAVAILABLE', '图片上传失败，请重试'))
      if (result.code !== 'OK') return reject(new ServiceError(result.code, result.message))
      resolve(result.data)
    },
    fail: () => reject(new ServiceError('SERVICE_UNAVAILABLE', '图片上传连接失败，请检查网络'))
  }))
  if (getToken() !== token) throw new ServiceError('CONFLICT', '账号已切换，请重新选择图片')
  await call('upload.confirm', { imageId: image.imageId })
  return image
}
export const confirm = (params = {}) => call('upload.confirm', params)
