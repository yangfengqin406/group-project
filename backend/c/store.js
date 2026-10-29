import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'

// Reference repository. A cloud adapter must preserve these transaction and
// uniqueness guarantees; this file never imports the browser's demo storage.
export function openCStore(filename) {
  const db = new DatabaseSync(filename)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS c_records (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL CHECK(json_valid(data)),
      UNIQUE(collection, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS c_unique_event
      ON c_records(collection, json_extract(data, '$.uniqueKey'))
      WHERE json_extract(data, '$.uniqueKey') IS NOT NULL;
    CREATE INDEX IF NOT EXISTS c_by_conversation
      ON c_records(collection, json_extract(data, '$.conversationId'), seq);
    CREATE INDEX IF NOT EXISTS c_by_recipient
      ON c_records(collection, json_extract(data, '$.recipientId'), seq);
    CREATE INDEX IF NOT EXISTS c_by_owner
      ON c_records(collection, json_extract(data, '$.ownerId'), seq);
    CREATE TABLE IF NOT EXISTS c_receipts (
      user_id TEXT NOT NULL, method TEXT NOT NULL, operation_key TEXT NOT NULL,
      fingerprint TEXT NOT NULL, response TEXT NOT NULL,
      PRIMARY KEY(user_id, method, operation_key)
    );
    CREATE TABLE IF NOT EXISTS c_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  db.prepare('INSERT OR IGNORE INTO c_settings VALUES (?, ?)')
    .run('cursor_secret', randomBytes(32).toString('hex'))
  const decode = (row) => row ? { seq: Number(row.seq), value: JSON.parse(row.data) } : null
  return {
    // Exposed for B's synchronous adapters using the same transaction/connection.
    database: db,
    cursorSecret: db.prepare('SELECT value FROM c_settings WHERE name = ?').get('cursor_secret').value,
    get(collection, id) {
      return decode(db.prepare('SELECT seq, data FROM c_records WHERE collection = ? AND id = ?').get(collection, id))?.value || null
    },
    insert(collection, value) {
      db.prepare('INSERT INTO c_records(collection, id, data) VALUES (?, ?, ?)')
        .run(collection, value.id, JSON.stringify(value))
      return value
    },
    update(collection, value) {
      db.prepare('UPDATE c_records SET data = ? WHERE collection = ? AND id = ?')
        .run(JSON.stringify(value), collection, value.id)
      return value
    },
    // SQL and ordering are internal constants, never client-provided fragments.
    query(collection, where = '1', args = [], order = 'seq DESC', limit = 51) {
      return db.prepare(`SELECT seq, data FROM c_records WHERE collection = ? AND (${where}) ORDER BY ${order} LIMIT ?`)
        .all(collection, ...args, limit).map(decode)
    },
    receipt(userId, method, key) {
      return db.prepare('SELECT fingerprint, response FROM c_receipts WHERE user_id = ? AND method = ? AND operation_key = ?')
        .get(userId, method, key)
    },
    saveReceipt(userId, method, key, fingerprint, response) {
      db.prepare('INSERT INTO c_receipts VALUES (?, ?, ?, ?, ?)')
        .run(userId, method, key, fingerprint, JSON.stringify(response))
    },
    transaction(run) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = run()
        if (result?.then) throw new Error('C store transactions require synchronous adapters')
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close() { db.close() }
  }
}
