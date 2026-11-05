import { ServiceError, requireThat } from '../utils/errors.js'
import { pngDataFromBytes, validateArtFrame } from '../utils/pet-art.js'
import { readNativePng } from './native-file.js'

export async function choosePetPng() {
  if (typeof uni === 'undefined' || typeof uni.chooseImage !== 'function')
    throw new ServiceError('NOT_SUPPORTED', '当前平台无法选择本地图片')
  const selection = await new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sourceType: ['album'],
      sizeType: ['original'],
      extension: ['png'],
      success: resolve,
      fail: (error) => {
        if (/cancel/i.test(error?.errMsg || error?.message || '')) resolve(null)
        else
          reject(
            new ServiceError(
              'SERVICE_UNAVAILABLE',
              '选图未完成，请重新选择 PNG 图片'
            )
          )
      }
    })
  })
  if (!selection) return null
  const file = selection.tempFiles?.[0]
  const path = selection.tempFilePaths?.[0] || file?.path || file?.tempFilePath
  if (!file && !path) return null
  requireThat(
    !Number.isFinite(file?.size) || file.size <= 256 * 1024,
    'INVALID_ARGUMENT',
    'PNG 图片不能超过 256 KiB'
  )
  let frame
  try {
    // #ifdef H5
    const localFile = file?.file || file
    if (typeof localFile?.arrayBuffer === 'function') {
      frame = {
        type: 'png',
        data: pngDataFromBytes(await localFile.arrayBuffer())
      }
    } else if (typeof path === 'string' && path.startsWith('blob:')) {
      const response = await fetch(path)
      if (!response.ok) throw new Error('本地图片地址不可读')
      frame = {
        type: 'png',
        data: pngDataFromBytes(await response.arrayBuffer())
      }
    }
    // #endif
    // #ifdef MP-WEIXIN
    if (!frame && path && typeof uni.getFileSystemManager === 'function') {
      const data = await new Promise((resolve, reject) =>
        uni.getFileSystemManager().readFile({
          filePath: path,
          encoding: 'base64',
          success: (result) => resolve(result.data),
          fail: () =>
            reject(
              new ServiceError(
                'SERVICE_UNAVAILABLE',
                '无法读取本地图片，请重新选择 PNG'
              )
            )
        })
      )
      frame = validateArtFrame(
        { type: 'png', data: `data:image/png;base64,${data}` },
        { required: true }
      )
    }
    // #endif
    // #ifdef APP-PLUS
    if (!frame && path && globalThis.plus?.io) frame = await readNativePng(path)
    // #endif
    if (!frame)
      throw new ServiceError('NOT_SUPPORTED', '当前平台无法读取这张本地图片')
  } catch (error) {
    if (error instanceof ServiceError) throw error
    throw new ServiceError(
      'SERVICE_UNAVAILABLE',
      '无法读取本地图片，请重新选择 PNG'
    )
  }
  frame = validateArtFrame(frame, { required: true })
  if (typeof uni.getImageInfo !== 'function')
    throw new ServiceError('NOT_SUPPORTED', '当前平台无法验证图片是否可显示')
  const info = await new Promise((resolve, reject) =>
    uni.getImageInfo({
      src: path || frame.data,
      success: resolve,
      fail: () =>
        reject(
          new ServiceError(
            'INVALID_ARGUMENT',
            '图片无法解码，请重新导出 PNG 后再试'
          )
        )
    })
  )
  requireThat(
    Number.isInteger(info?.width) &&
      info.width > 0 &&
      info.width <= 512 &&
      Number.isInteger(info?.height) &&
      info.height > 0 &&
      info.height <= 512,
    'INVALID_ARGUMENT',
    'PNG 图片宽高需为 1～512 像素'
  )
  return frame
}
