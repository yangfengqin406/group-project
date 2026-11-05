import { openCStore } from '../c/store.js'

// Course-sized state is deliberately bounded. Crossing a limit fails the write;
// records, credentials and idempotency receipts are never silently discarded.
export const SNAPSHOT_LIMITS = Object.freeze({
  maxBytes: 4 * 1024 * 1024, maxRecords: 20000, maxReceipts: 10000,
  maxSettings: 64, maxRowBytes: 2 * 1024 * 1024, maxIdentifierBytes: 2048
})
const fail = (message, cause) => Object.assign(new Error(message, { cause }), { code: 'CLOUD_SNAPSHOT_INVALID' })
const need = (ok, message) => { if (!ok) throw fail(message) }
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))
const shape = (value, keys, label) => need(object(value) && Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key)), `${label}: unexpected or missing fields`)
const text = (value, label, max = SNAPSHOT_LIMITS.maxIdentifierBytes) => need(typeof value === 'string' &&
  value.length > 0 && !value.includes('\0') && Buffer.byteLength(value) <= max, `${label}: invalid text or size`)
const integer = (value, min, label) => need(Number.isSafeInteger(value) && value >= min && value < Number.MAX_SAFE_INTEGER,
  `${label}: invalid safe integer`)
const byteLimit = (options) => {
  const max = options?.maxBytes ?? SNAPSHOT_LIMITS.maxBytes
  need(Number.isSafeInteger(max) && max > 0 && max <= SNAPSHOT_LIMITS.maxBytes, 'snapshot: invalid byte limit')
  return max
}
const json = (value, label) => {
  text(value, label, SNAPSHOT_LIMITS.maxRowBytes)
  try { return JSON.parse(value) } catch (cause) { throw fail(`${label}: invalid JSON`, cause) }
}

export function validateSnapshot(snapshot, options = {}) {
  const maxBytes = byteLimit(options)
  shape(snapshot, ['schemaVersion', 'records', 'receipts', 'settings', 'sequence'], 'snapshot')
  need(snapshot.schemaVersion === 1, 'snapshot: unsupported schemaVersion')
  for (const [name, cap] of [['records', SNAPSHOT_LIMITS.maxRecords], ['receipts', SNAPSHOT_LIMITS.maxReceipts],
    ['settings', SNAPSHOT_LIMITS.maxSettings]]) {
    need(Array.isArray(snapshot[name]) && snapshot[name].length <= cap, `snapshot.${name}: invalid array or count limit`)
  }
  integer(snapshot.sequence, 0, 'snapshot.sequence')
  const sequences = new Set(), records = new Set(), receipts = new Set(), settings = new Set()
  for (const row of snapshot.records) {
    shape(row, ['seq', 'collection', 'id', 'data'], 'record')
    integer(row.seq, 1, 'record.seq'); text(row.collection, 'record.collection'); text(row.id, 'record.id')
    const value = json(row.data, 'record.data'), key = JSON.stringify([row.collection, row.id])
    need(object(value) && value.id === row.id, 'record.data: object id must match record id')
    need(row.seq <= snapshot.sequence && !sequences.has(row.seq) && !records.has(key), 'record: duplicate key or invalid sequence')
    sequences.add(row.seq); records.add(key)
  }
  for (const row of snapshot.receipts) {
    shape(row, ['user_id', 'method', 'operation_key', 'fingerprint', 'response'], 'receipt')
    for (const key of ['user_id', 'method', 'operation_key']) text(row[key], `receipt.${key}`)
    text(row.fingerprint, 'receipt.fingerprint', SNAPSHOT_LIMITS.maxRowBytes)
    json(row.response, 'receipt.response')
    const key = JSON.stringify([row.user_id, row.method, row.operation_key])
    need(!receipts.has(key), 'receipt: duplicate key'); receipts.add(key)
  }
  for (const row of snapshot.settings) {
    shape(row, ['name', 'value'], 'setting'); text(row.name, 'setting.name')
    need(typeof row.value === 'string' && Buffer.byteLength(row.value) <= SNAPSHOT_LIMITS.maxRowBytes,
      'setting.value: invalid text or size')
    need(!settings.has(row.name), 'setting: duplicate name'); settings.add(row.name)
  }
  const secret = snapshot.settings.find((row) => row.name === 'cursor_secret')?.value
  need(typeof secret === 'string' && /^[a-f0-9]{64}$/i.test(secret), 'snapshot: missing or invalid cursor_secret')
  need(Buffer.byteLength(JSON.stringify(snapshot)) <= maxBytes, 'snapshot: byte limit exceeded')
  return snapshot
}

const TABLES = {
  c_records: ['seq', 'collection', 'id', 'data'],
  c_receipts: ['user_id', 'method', 'operation_key', 'fingerprint', 'response'],
  c_settings: ['name', 'value'], sqlite_sequence: ['name', 'seq']
}
function checkSchema(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
  need(tables.length === 3 && tables.every(({ name }) => Object.hasOwn(TABLES, name)), 'store: unsupported tables')
  // All identifiers below are private constants, never supplied by a snapshot.
  for (const [table, fields] of Object.entries(TABLES)) {
    const actual = db.prepare(`PRAGMA table_info(${table})`).all().map(({ name }) => name)
    need(JSON.stringify(actual) === JSON.stringify(fields), `store: unsupported ${table} columns`)
  }
}

// Accepts { database: new DatabaseSync(path, { readOnly: true }) } for offline
// migration. It never opens the source with the writable openCStore helper.
export function exportSnapshot(store, options = {}) {
  const db = store?.database
  need(db && typeof db.prepare === 'function', 'store: SQLite database is required')
  const ownTransaction = !db.isTransaction
  try {
    if (ownTransaction) db.exec('BEGIN')
    checkSchema(db)
    const snapshot = {
      schemaVersion: 1,
      records: db.prepare('SELECT seq, collection, id, data FROM c_records ORDER BY seq').all().map((row) => ({ ...row })),
      receipts: db.prepare('SELECT user_id, method, operation_key, fingerprint, response FROM c_receipts ORDER BY user_id, method, operation_key')
        .all().map((row) => ({ ...row })),
      settings: db.prepare('SELECT name, value FROM c_settings ORDER BY name').all().map((row) => ({ ...row })),
      sequence: db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'c_records'").get()?.seq ?? 0
    }
    validateSnapshot(snapshot, options)
    if (ownTransaction) db.exec('COMMIT')
    return snapshot
  } catch (cause) {
    if (ownTransaction && db.isTransaction) db.exec('ROLLBACK')
    if (cause.code === 'CLOUD_SNAPSHOT_INVALID') throw cause
    throw fail('store: cannot export SQLite snapshot', cause)
  }
}

export function hydrateStore(snapshot, options = {}) {
  validateSnapshot(snapshot, options)
  const store = openCStore(':memory:')
  try {
    store.transaction(() => {
      const db = store.database
      db.exec('DELETE FROM c_settings')
      const record = db.prepare('INSERT INTO c_records(seq, collection, id, data) VALUES (?, ?, ?, ?)')
      for (const row of snapshot.records) record.run(row.seq, row.collection, row.id, row.data)
      const receipt = db.prepare('INSERT INTO c_receipts(user_id, method, operation_key, fingerprint, response) VALUES (?, ?, ?, ?, ?)')
      for (const row of snapshot.receipts) receipt.run(row.user_id, row.method, row.operation_key, row.fingerprint, row.response)
      const setting = db.prepare('INSERT INTO c_settings(name, value) VALUES (?, ?)')
      for (const row of snapshot.settings) setting.run(row.name, row.value)
      db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run('c_records')
      db.prepare('INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)').run('c_records', snapshot.sequence)
    })
    // openCStore captured a temporary random secret before the rows were restored.
    // Every adapter must receive the persisted secret, including after cold starts.
    return { ...store, cursorSecret: snapshot.settings.find(({ name }) => name === 'cursor_secret').value }
  } catch (cause) {
    store.close()
    throw fail('snapshot: SQLite constraints rejected restored state', cause)
  }
}
