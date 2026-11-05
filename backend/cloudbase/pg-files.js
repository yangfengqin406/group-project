const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ACK_BYTES = 64 * 1024

class PgFileError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    if (status !== undefined) this.status = status
  }
}

const invalid = () => new PgFileError('CLOUD_FILE_INVALID', 'CloudBase file input is invalid')
const failure = (operation, status) => new PgFileError(
  'CLOUD_FILE_FAILED', `CloudBase file ${operation} failed${status === undefined ? '' : ` (HTTP ${status})`}`, status)
const tooLarge = () => new PgFileError('CLOUD_FILE_TOO_LARGE', 'CloudBase file exceeds the byte limit')

function validatePath(path) {
  // Validate the original spelling before URL encoding: URL parsing can erase
  // dot segments, and percent escapes can become a second path after decoding.
  if (typeof path !== 'string' || !path || Buffer.byteLength(path, 'utf8') > 4096 ||
    /[\\%?#:\u0000-\u001f\u007f]/u.test(path) ||
    path.split('/').some(segment => !segment || segment === '.' || segment === '..')) throw invalid()
  try { return path.split('/').map(segment => encodeURIComponent(segment)).join('/') }
  catch { throw invalid() }
}

async function discard(response) {
  try { await response?.body?.cancel?.() } catch { /* Error bodies remain private. */ }
}

async function readBytes(response, limit) {
  const length = response.headers.get('content-length')
  if (length !== null) {
    if (!/^\d+$/u.test(length)) { await discard(response); throw failure('response') }
    if (BigInt(length) > BigInt(limit)) { await discard(response); throw tooLarge() }
  }
  if (response.body === null) return Buffer.alloc(0)
  if (typeof response.body?.getReader !== 'function') throw failure('response')
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) throw failure('response')
      total += value.byteLength
      if (total > limit) {
        try { await reader.cancel() } catch { /* Preserve the size failure. */ }
        throw tooLarge()
      }
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks, total)
  } finally { reader.releaseLock() }
}

async function acknowledgement(response, required) {
  const bytes = await readBytes(response, MAX_ACK_BYTES)
  if (!bytes.length && !required) return null
  let payload
  try { payload = JSON.parse(bytes.toString('utf8')) } catch { throw failure('response') }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.Code || payload.code)
    throw failure('response')
  return payload
}

export function createPgCloudFiles({ envId, accessKey, bucket = 'campus-private', fetch: fetchImpl = globalThis.fetch } = {}) {
  if (typeof envId !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u.test(envId) ||
    typeof bucket !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(bucket) ||
    typeof accessKey !== 'string' || !accessKey.trim() || accessKey.length > 65536 || /[\u0000-\u0020\u007f]/u.test(accessKey) ||
    typeof fetchImpl !== 'function') throw invalid()

  const origin = `https://${envId}.api.tcloudbasegateway.com`
  const route = `${origin}/v1/storages/object/`
  const encodedBucket = encodeURIComponent(bucket)
  const prefix = `pg://${bucket}/`
  function objectPath(locator) {
    if (typeof locator !== 'string' || !locator.startsWith(prefix)) throw invalid()
    return validatePath(locator.slice(prefix.length))
  }
  async function request(url, method, extra = {}) {
    const response = await fetchImpl(url, {
      method, redirect: 'error', credentials: 'omit',
      signal: AbortSignal.timeout(30_000),
      ...extra,
      headers: { Authorization: `Bearer ${accessKey}`, ...extra.headers }
    })
    if (!response || !Number.isInteger(response.status) || response.status < 100 || response.status > 599 ||
      typeof response.headers?.get !== 'function') throw failure('response')
    if (response.redirected || response.type === 'opaqueredirect' ||
      (response.status >= 300 && response.status < 400) || (response.url && response.url !== url)) {
      await discard(response)
      throw new PgFileError('CLOUD_FILE_REDIRECT', 'CloudBase file redirect was rejected')
    }
    return response
  }
  async function run(operation, callback) {
    try { return await callback() }
    catch (error) { throw error instanceof PgFileError ? error : failure(operation) }
  }
  return {
    async upload(path, bytes) {
      return run('upload', async () => {
        const encodedPath = validatePath(path)
        if (!Buffer.isBuffer(bytes)) throw invalid()
        if (bytes.length > MAX_FILE_BYTES) throw tooLarge()
        // CLI 3.9 manager-node uploadObject: binary POST, per-segment encoding,
        // and no x-upsert header when upsert is false.
        const response = await request(`${route}${encodedBucket}/${encodedPath}`, 'POST', {
          headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length), 'Cache-Control': 'max-age=0' },
          body: bytes
        })
        if (response.status < 200 || response.status >= 300) {
          await discard(response); throw failure('upload', response.status)
        }
        const payload = await acknowledgement(response, true)
        if (typeof payload.Id !== 'string' || !payload.Id || typeof payload.Key !== 'string' || !payload.Key)
          throw failure('upload')
        return `${prefix}${path}`
      })
    },
    async download(locator) {
      return run('download', async () => {
        const path = objectPath(locator)
        const response = await request(`${route}authenticated/${encodedBucket}/${path}`, 'GET')
        // A partial response is not a complete object; no Range was requested.
        if (response.status !== 200) { await discard(response); throw failure('download', response.status) }
        return readBytes(response, MAX_FILE_BYTES)
      })
    },
    async remove(locator) {
      return run('remove', async () => {
        const path = objectPath(locator)
        const response = await request(`${route}${encodedBucket}/${path}`, 'DELETE')
        if (response.status === 404) { await discard(response); return }
        if (response.status < 200 || response.status >= 300) {
          await discard(response); throw failure('remove', response.status)
        }
        await acknowledgement(response, false)
      })
    }
  }
}
