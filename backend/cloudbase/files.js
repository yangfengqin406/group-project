export function createCloudFiles(app) {
  return {
    async upload(cloudPath, bytes) {
      const result = await app.uploadFile({ cloudPath, fileContent: bytes })
      if (result.code || typeof result.fileID !== 'string' || !result.fileID.startsWith('cloud://'))
        throw new Error('CloudBase upload failed')
      return result.fileID
    },
    async download(fileID) {
      const result = await app.downloadFile({ fileID })
      if (result.code || !Buffer.isBuffer(result.fileContent)) throw new Error('CloudBase download failed')
      return result.fileContent
    },
    async remove(fileID) {
      const result = await app.deleteFile({ fileList: [fileID] })
      if (result.code || !Array.isArray(result.fileList) || result.fileList.length !== 1 ||
        (result.fileList[0].code && result.fileList[0].code !== 'SUCCESS')) throw new Error('CloudBase delete failed')
    }
  }
}
