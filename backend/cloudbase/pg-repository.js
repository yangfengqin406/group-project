import { isDeepStrictEqual } from 'node:util'
import { validateCloudState } from './repository.js'
import { SNAPSHOT_LIMITS } from './state.js'

const RESPONSE_OVERHEAD_BYTES = 1024 * 1024
class PgStateError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    if (status !== undefined) this.status = status
  }
}
const invalid = () => new PgStateError('CLOUD_STATE_INVALID', 'Cloud state or repository input is invalid')
const conflict = () => new PgStateError('CLOUD_STATE_CONFLICT', 'Cloud state changed; refresh before trying the operation again')
const uncertain = () => new PgStateError('CLOUD_STATE_COMMIT_UNCERTAIN', 'Cloud commit outcome is unknown; refresh state before retrying')
const failed = (writing, status) => new PgStateError(writing ? 'CLOUD_STATE_WRITE_FAILED' : 'CLOUD_STATE_READ_FAILED',
  `Cloud state ${writing ? 'write' : 'read'} failed${status === undefined ? '' : ` (HTTP ${status})`}`, status)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)

async function discard(response) {
  try { await response?.body?.cancel?.() } catch { /* Never expose an upstream body or transport error. */ }
}

async function readRows(response, maxBytes) {
  const length = response.headers.get('content-length')
  if (length !== null && (!/^\d+$/u.test(length) || BigInt(length) > BigInt(maxBytes))) {
    await discard(response); throw invalid()
  }
  if (typeof response.body?.getReader !== 'function') throw invalid()
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) throw invalid()
      size += value.byteLength
      if (size > maxBytes) {
        try { await reader.cancel() } catch { /* Preserve the bounded-response failure. */ }
        throw invalid()
      }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  let rows
  try { rows = JSON.parse(Buffer.concat(chunks, size).toString('utf8')) } catch { throw invalid() }
  if (!Array.isArray(rows) || rows.length > 1) throw invalid()
  return rows
}

// PostgreSQL owns persistence. A single UPDATE guarded by the old version is
// atomic, so business execution never spans a remote database transaction.
export function createPgRepository({ envId, accessKey, table = 'campus_runtime', document = 'primary',
  fetch: fetchImpl = globalThis.fetch, maxBytes = SNAPSHOT_LIMITS.maxBytes } = {}) {
  if (typeof envId !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u.test(envId) ||
    typeof accessKey !== 'string' || !accessKey || accessKey.length > 65536 || /[\u0000-\u0020\u007f]/u.test(accessKey) ||
    typeof table !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,62}$/u.test(table) ||
    typeof document !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(document) ||
    typeof fetchImpl !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > SNAPSHOT_LIMITS.maxBytes)
    throw invalid()

  const base = `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/${table}`
  const filtered = (version, select = false) => {
    const query = new URLSearchParams({ id: `eq.${document}` })
    if (version !== undefined) query.set('version', `eq.${version}`)
    if (select) query.set('select', 'id,version,state')
    return `${base}?${query}`
  }
  function validate(state, version) {
    try { return validateCloudState(state, version, maxBytes) }
    catch { throw invalid() }
  }
  function unpack(rows) {
    if (!rows.length) return null
    const row = rows[0]
    if (!object(row) || Object.keys(row).length !== 3 || row.id !== document ||
      !Object.hasOwn(row, 'state') || !Number.isSafeInteger(row.version) || row.version < 1 ||
      row.version >= Number.MAX_SAFE_INTEGER || !object(row.state) || row.state.version !== row.version) throw invalid()
    return validate(row.state, row.version)
  }
  async function request(url, method, body) {
    const response = await fetchImpl(url, {
      method, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${accessKey}`, Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', Prefer: 'return=representation' }) },
      ...(body === undefined ? {} : { body })
    })
    if (!response || !Number.isInteger(response.status) || response.status < 100 || response.status > 599 ||
      typeof response.headers?.get !== 'function') throw invalid()
    if (response.redirected || response.type === 'opaqueredirect' ||
      (response.status >= 300 && response.status < 400) || (response.url && response.url !== url)) {
      await discard(response); throw invalid()
    }
    return response
  }
  async function write(expectedVersion, state, initializing = false) {
    if (!initializing && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 ||
      expectedVersion >= Number.MAX_SAFE_INTEGER - 1)) throw invalid()
    // Complete validation and serialization before the one remote write. Local
    // failures are definite; after dispatch, a missing acknowledgement is not.
    const next = validate(state, initializing ? 1 : expectedVersion + 1)
    const body = JSON.stringify(initializing ? { id: document, version: 1, state: next } : { version: next.version, state: next })
    let response
    try { response = await request(initializing ? base : filtered(expectedVersion), initializing ? 'POST' : 'PATCH', body) }
    catch { throw uncertain() }
    if (initializing && response.status === 409) { await discard(response); throw conflict() }
    if (response.status >= 400 && response.status < 500) {
      await discard(response); throw failed(true, response.status)
    }
    if (response.status < 200 || response.status >= 300) { await discard(response); throw uncertain() }
    let rows, stored
    try {
      rows = await readRows(response, maxBytes + RESPONSE_OVERHEAD_BYTES)
      stored = unpack(rows)
      if (stored && (stored.version !== next.version || !isDeepStrictEqual(stored, next))) throw invalid()
    } catch { throw uncertain() }
    // PATCH returning no row proves that its version predicate did not match.
    // An INSERT without its expected returned row has an unknown outcome.
    if (!stored) { if (initializing) throw uncertain(); throw conflict() }
    return stored
  }
  return {
    async read() {
      let response
      try { response = await request(filtered(undefined, true), 'GET') }
      catch { throw failed(false) }
      if (response.status !== 200) { await discard(response); throw failed(false, response.status) }
      try { return unpack(await readRows(response, maxBytes + RESPONSE_OVERHEAD_BYTES)) }
      catch (error) { throw error instanceof PgStateError ? error : failed(false) }
    },
    initialize(state) { return write(null, state, true) },
    compareAndSwap(expectedVersion, state) { return write(expectedVersion, state) }
  }
}
