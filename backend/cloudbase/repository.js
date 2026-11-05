import { validateSnapshot, SNAPSHOT_LIMITS } from './state.js'

const fail = (code, message, cause) => Object.assign(new Error(message, { cause }), { code })
const need = (ok, message) => { if (!ok) throw fail('CLOUD_STATE_INVALID', message) }
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))
const isConflict = (error) => ['DATABASE_TRANSACTION_CONFLICT', 'DATABASE_TRANSACTION_CONFLICT_ERROR'].includes(error?.code)
const conflict = (cause) => fail('CLOUD_STATE_CONFLICT', 'Cloud state changed; refresh before trying the operation again', cause)
function checkResult(result, label) {
  need(result !== null && typeof result === 'object' && !Array.isArray(result), `CloudBase ${label} returned an invalid response`)
  if (result?.code) throw fail(result.code, `CloudBase ${label} failed`, result)
  return result
}
function jsonTree(value, ancestors = new Set(), depth = 0) {
  need(depth <= 80, 'cloud state exceeds maximum nesting depth')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return
  if (typeof value === 'number') { need(Number.isFinite(value), 'cloud state contains a non-finite number'); return }
  need(Array.isArray(value) || object(value), 'cloud state must contain only JSON values')
  need(!ancestors.has(value), 'cloud state contains a cycle')
  ancestors.add(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue
    need(typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key), 'cloud state contains an unsafe key')
    const descriptor = descriptors[key]
    need(descriptor.enumerable && 'value' in descriptor, 'cloud state must contain plain JSON properties')
    jsonTree(descriptor.value, ancestors, depth + 1)
  }
  if (Array.isArray(value)) need(Object.keys(value).length === value.length, 'cloud state contains a sparse array')
  ancestors.delete(value)
}
function copyState(state, version, maxBytes) {
  need(object(state) && !Object.hasOwn(state, '_id') && !Object.hasOwn(state, '_openid'), 'invalid cloud state document')
  jsonTree(state)
  if (Object.hasOwn(state, 'version')) need(state.version === version || state.version === version - 1, 'state version does not match write')
  validateSnapshot(state.snapshot, { maxBytes })
  need(object(state.files) && Object.keys(state.files).length <= 2000, 'cloud files must be a bounded object')
  need(Array.isArray(state.cleanup) && state.cleanup.length <= 2000, 'cloud cleanup must be a bounded array')
  need(state.game === null || object(state.game), 'cloud game must be null or an object')
  const serialized = JSON.stringify({ ...state, version })
  need(Buffer.byteLength(serialized) <= maxBytes, 'cloud state byte limit exceeded')
  return JSON.parse(serialized)
}

// Shared, pure validation for the legacy document and PostgreSQL adapters.
export function validateCloudState(state, version, maxBytes = SNAPSHOT_LIMITS.maxBytes) {
  need(Number.isSafeInteger(version) && version >= 1 && version < Number.MAX_SAFE_INTEGER, 'invalid cloud version')
  need(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= SNAPSHOT_LIMITS.maxBytes, 'invalid cloud byte limit')
  return copyState(state, version, maxBytes)
}

// Server-only adapter. Do not expose this document or its credential snapshot to
// browser SDKs. The caller injects the official @cloudbase/node-sdk database.
export function createCloudRepository({ db, collection = 'campus_runtime', document = 'primary', maxBytes = SNAPSHOT_LIMITS.maxBytes } = {}) {
  need(db && typeof db.collection === 'function' && typeof db.startTransaction === 'function', 'CloudBase database with transactions is required')
  need(typeof collection === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(collection), 'invalid cloud collection')
  need(typeof document === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(document), 'invalid cloud document')
  need(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= SNAPSHOT_LIMITS.maxBytes, 'invalid cloud byte limit')
  function unpack(result, validate = true) {
    checkResult(result, 'get')
    need(result && Object.hasOwn(result, 'data'), 'CloudBase get returned no data field')
    let data = result.data
    if (Array.isArray(data)) {
      need(data.length <= 1, 'CloudBase get returned multiple primary documents')
      if (data.length === 0) return null
      data = data[0]
      need(object(data), 'CloudBase get returned invalid document array')
    }
    if (data === null) return null
    need(object(data), 'CloudBase get returned invalid document data')
    if (Object.hasOwn(data, '_id')) need(data._id === document, 'CloudBase returned a different document')
    const { _id, _openid, ...state } = data
    need(Number.isSafeInteger(state.version) && state.version >= 1 && state.version < Number.MAX_SAFE_INTEGER, 'invalid persisted cloud version')
    return validate ? copyState(state, state.version, maxBytes) : state
  }
  async function write(expectedVersion, state, initializing = false) {
    need(initializing || (Number.isSafeInteger(expectedVersion) && expectedVersion >= 1 && expectedVersion < Number.MAX_SAFE_INTEGER - 1), 'invalid expected cloud version')
    const next = copyState(state, initializing ? 1 : expectedVersion + 1, maxBytes)
    const transaction = checkResult(await db.startTransaction(), 'startTransaction')
    need(transaction && typeof transaction.collection === 'function' && typeof transaction.commit === 'function' &&
      typeof transaction.rollback === 'function', 'CloudBase returned an invalid transaction')
    let committing = false
    try {
      const ref = transaction.collection(collection).doc(document)
      const current = unpack(await ref.get(), false)
      if (initializing ? current !== null : current?.version !== expectedVersion) throw conflict()
      // Business execution, upload I/O and serialization happened before starting
      // the SDK transaction. Only this read/check/set/commit uses its 10s window.
      checkResult(await ref.set(next), 'set')
      committing = true
      checkResult(await transaction.commit(), 'commit')
      return next
    } catch (cause) {
      if (committing) {
        // A transport error can occur after the server committed. Never report
        // success or replay the operation; its durable receipt resolves a retry.
        if (isConflict(cause)) throw conflict(cause)
        throw fail('CLOUD_STATE_COMMIT_UNCERTAIN', 'Cloud commit outcome is unknown; refresh state before retrying', cause)
      }
      try { checkResult(await transaction.rollback(), 'rollback') } catch { /* Preserve the primary failure. */ }
      if (isConflict(cause)) throw conflict(cause)
      throw cause
    }
  }
  return {
    async read() { return unpack(await db.collection(collection).doc(document).get()) },
    initialize(state) { return write(null, state, true) },
    compareAndSwap(expectedVersion, state) { return write(expectedVersion, state) }
  }
}
