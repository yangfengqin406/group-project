import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { inspectImage } from '../backend/campus/image.js'
import { exportSnapshot, validateSnapshot } from '../backend/cloudbase/state.js'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const UPLOAD_FIELDS = new Set(['id', 'imageId', 'ownerId', 'usage', 'url', 'status', 'mime', 'size',
  'filename', 'filePath', 'createdAt', 'confirmedAt', 'contentType', 'contentId', 'sha256'])
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value) &&
  !['__proto__', 'constructor', 'prototype'].includes(value)
const filename = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}\.(png|jpg|webp)$/.test(value)
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
const failure = (code, message) => Object.assign(new Error(message), { code })
const invalid = (message) => { throw failure('CLOUD_MIGRATION_SOURCE_INVALID', message) }
const need = (ok, message) => { if (!ok) invalid(message) }
const inside = (root, path) => {
  const location = relative(root, path)
  return location !== '..' && !location.startsWith(`..${sep}`) && !isAbsolute(location)
}

function origin(value) {
  let parsed
  try { parsed = new URL(value) } catch { /* Return a fixed, non-sensitive error. */ }
  need(parsed && ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password &&
    parsed.pathname === '/' && !parsed.search && !parsed.hash, 'Migration requires a valid public origin')
  return parsed.origin
}

async function exists(path) {
  try { return await lstat(path) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

async function standalone(source) {
  return !((await exists(`${source}-wal`))?.size) && !((await exists(`${source}-journal`))?.size)
}

async function sourceSnapshot(databaseFile) {
  need(typeof databaseFile === 'string' && databaseFile.length > 0, 'A standalone SQLite backup is required')
  const source = resolve(databaseFile), info = await lstat(source)
  need(info.isFile() && !info.isSymbolicLink(), 'SQLite backup must be a regular file')
  // Input must be a frozen exported backup, not a live database dependent on a
  // WAL. A separate final snapshot is required after freezing source writes.
  need(await standalone(source), 'SQLite backup still depends on a WAL or rollback journal')
  const bytes = await readFile(source), before = digest(bytes)
  const temporaryRoot = await realpath(tmpdir())
  let database, temporaryDirectory
  try {
    // SQLite may create -wal/-shm even when a WAL-mode file is opened readOnly.
    // Open only a private byte-for-byte temporary copy so the selected source
    // and its directory receive no SQLite writes or sidecar creation at all.
    temporaryDirectory = await mkdtemp(join(temporaryRoot, 'campus-cloud-migration-'))
    need(inside(temporaryRoot, temporaryDirectory) && temporaryDirectory !== temporaryRoot,
      'Private verification directory is outside its temporary root')
    const privateCopy = join(temporaryDirectory, 'source.sqlite')
    await writeFile(privateCopy, bytes, { flag: 'wx', mode: 0o600 })
    database = new DatabaseSync(privateCopy, { readOnly: true })
    const checks = database.prepare('PRAGMA quick_check').all()
    need(checks.length === 1 && Object.values(checks[0])[0] === 'ok', 'SQLite backup integrity check failed')
    const snapshot = exportSnapshot({ database })
    return { snapshot, sha256: before, source }
  } finally {
    try { database?.close() }
    finally {
      if (temporaryDirectory && inside(temporaryRoot, temporaryDirectory) && temporaryDirectory !== temporaryRoot)
        await rm(temporaryDirectory, { recursive: true, force: true })
    }
  }
}

function expectedHashes(value) {
  if (value === undefined) return null
  need(value instanceof Map || object(value), 'Expected file hashes must be a filename-to-hash map')
  const entries = value instanceof Map ? [...value] : Object.entries(value)
  need(entries.length <= 2000 && entries.every(([name, value]) => filename(name) && hash(value)),
    'Expected file hash manifest is invalid')
  return new Map(entries.map(([name, value]) => [name, value.toLowerCase()]))
}

async function imageBytes(root, metadata) {
  // Original filePath may refer to another Windows computer. It is never used
  // as an input path; only this validated direct child of uploadsRoot is read.
  const target = join(root, metadata.filename), info = await lstat(target)
  need(info.isFile() && !info.isSymbolicLink() && info.size === metadata.size,
    'An upload is missing, linked, or has a different size')
  need(inside(root, await realpath(target)), 'An upload resolves outside the selected upload directory')
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const opened = await handle.stat()
    need(opened.isFile() && opened.dev === info.dev && opened.ino === info.ino && opened.size === metadata.size,
      'An upload changed during verification')
    // Bounded reads also reject a file which grows after the size check.
    const bytes = Buffer.alloc(metadata.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!result.bytesRead) break
      offset += result.bytesRead
    }
    need(offset === metadata.size && (await handle.stat()).size === metadata.size,
      'An upload changed during verification')
    const content = bytes.subarray(0, offset), image = inspectImage(content)
    need(image && image.mime === metadata.mime && metadata.filename === `${metadata.imageId}.${image.extension}`,
      'Upload filename or MIME does not match verified image bytes')
    return content
  } finally { await handle.close() }
}

function uploadMetadata(snapshot) {
  const owners = new Set(snapshot.records.filter((row) => row.collection === 'campus.users').map((row) => row.id))
  const images = [], urls = new Set(), names = new Set()
  for (const row of snapshot.records.filter((row) => row.collection === 'campus.uploads')) {
    const value = JSON.parse(row.data)
    need(object(value) && Object.keys(value).every((key) => UPLOAD_FIELDS.has(key)) &&
      identifier(value.id) && value.id === row.id && value.imageId === value.id && owners.has(value.ownerId) &&
      ['avatar', 'content'].includes(value.usage) && ['pending', 'confirmed'].includes(value.status) &&
      filename(value.filename) && !names.has(value.filename) &&
      ['image/png', 'image/jpeg', 'image/webp'].includes(value.mime) &&
      Number.isSafeInteger(value.size) && value.size > 0 && value.size <= MAX_IMAGE_BYTES &&
      typeof value.filePath === 'string' && value.filePath.length > 0 && !value.filePath.includes('\0') &&
      typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) &&
      (!Object.hasOwn(value, 'sha256') || hash(value.sha256)), 'Upload metadata is unknown, inconsistent, or invalid')
    let url
    try { url = new URL(value.url) } catch { /* Fixed validation message below. */ }
    need(url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      value.url === `${url.origin}/api/files/${value.imageId}` && !urls.has(value.url),
      'Upload URL is not an exact owned image URL')
    names.add(value.filename)
    urls.add(value.url)
    images.push(value)
  }
  need(images.length <= 2000, 'Upload count exceeds the supported migration size')
  return images
}

function remapSnapshot(snapshot, images, publicOrigin) {
  const urls = new Map(images.map((image) => [image.url, `${publicOrigin}/api/files/${image.imageId}`]))
  function jsonValues(serialized) {
    let changed = false
    const value = JSON.parse(serialized, (_key, value) => {
      if (typeof value === 'string' && urls.has(value) && urls.get(value) !== value) {
        changed = true
        return urls.get(value)
      }
      return value
    })
    return { value, changed }
  }
  return {
    ...snapshot,
    records: snapshot.records.map((row) => {
      const next = jsonValues(row.data)
      if (row.collection === 'campus.uploads') {
        next.value.filePath = `/cloudbase/uploads/${next.value.filename}`
        next.changed = true
      }
      return next.changed ? { ...row, data: JSON.stringify(next.value) } : row
    }),
    // Receipt identities and request fingerprints remain exact; only response
    // JSON values pointing at verified uploads receive the new file endpoint.
    receipts: snapshot.receipts.map((row) => {
      const next = jsonValues(row.response)
      return next.changed ? { ...row, response: JSON.stringify(next.value) } : row
    })
  }
}

async function discard(files, staged) {
  let failures = 0
  for (const fileID of staged) {
    try { await files.remove(fileID) } catch { failures++ }
  }
  return failures
}

// Core only: callers supply server-side adapters for a private CloudBase bucket
// and repository. Importing this module does not load credentials or run a CLI.
export async function prepareCloudMigration({ databaseFile, uploadsRoot, publicOrigin, repository, files,
  confirmEmpty = false, expectedFileHashes } = {}) {
  need(typeof repository?.read === 'function' && typeof confirmEmpty === 'boolean', 'A repository and explicit boolean confirmation are required')
  let current
  try { current = await repository.read() }
  catch { throw failure('CLOUD_MIGRATION_TARGET_UNAVAILABLE', 'Cannot verify that the cloud target is empty') }
  if (current !== null) throw failure('CLOUD_MIGRATION_TARGET_NOT_EMPTY', 'Cloud target is not empty; migration refused')
  const nextOrigin = origin(publicOrigin), expected = expectedHashes(expectedFileHashes)
  if (confirmEmpty) need(typeof repository.initialize === 'function' && typeof files?.upload === 'function' &&
    typeof files?.remove === 'function', 'Confirmed migration requires private file upload/removal and atomic initialization')
  let source, root, images, plans, summary, snapshot
  try {
    source = await sourceSnapshot(databaseFile)
    need(typeof uploadsRoot === 'string' && uploadsRoot.length > 0, 'An upload directory is required')
    root = await realpath(resolve(uploadsRoot))
    need((await lstat(root)).isDirectory(), 'Upload root must be a directory')
    images = uploadMetadata(source.snapshot)
    plans = []
    for (const image of images) {
      const sha256 = digest(await imageBytes(root, image))
      need(!Object.hasOwn(image, 'sha256') || image.sha256.toLowerCase() === sha256, 'Stored upload hash does not match the source file')
      need(!expected || expected.get(image.filename) === sha256, 'Expected upload hash is missing or does not match the source file')
      plans.push({ image, sha256 })
    }
    need(digest(await readFile(source.source)) === source.sha256 && await standalone(source.source),
      'Source backup changed during migration verification')
    snapshot = remapSnapshot(source.snapshot, images, nextOrigin)
    validateSnapshot(snapshot)
    summary = {
      records: source.snapshot.records.length,
      accounts: source.snapshot.records.filter((row) => row.collection === 'campus.users').length,
      images: images.length,
      sha256: source.sha256,
      imageSetSha256: digest(JSON.stringify(plans.map(({ image, sha256 }) => [image.filename, image.size, sha256]))),
      computedHashes: images.length,
      sourceHashesVerified: images.filter((image) => Object.hasOwn(image, 'sha256')).length,
      expectedHashesVerified: expected ? images.length : 0
    }
  } catch { throw failure('CLOUD_MIGRATION_SOURCE_INVALID', 'Source snapshot or private upload verification failed; no cloud import was committed') }
  if (!confirmEmpty) return { status: 'dry_run', dryRun: true, summary }

  const staged = [], uploaded = Object.create(null), batch = randomUUID()
  try {
    for (const { image, sha256 } of plans) {
      const bytes = await imageBytes(root, image)
      need(digest(bytes) === sha256, 'An upload changed after preflight verification')
      const fileID = await files.upload(`campus/migrations/${batch}/${image.filename}`, bytes)
      need(typeof fileID === 'string' && fileID.length <= 4096 &&
        /^(?:cloud|pg):\/\/[A-Za-z0-9._-]+\/[A-Za-z0-9_./-]+$/u.test(fileID) &&
        !fileID.split('/').some(part => part === '.' || part === '..') &&
        !staged.includes(fileID), 'Private upload returned an invalid file identity')
      staged.push(fileID)
      uploaded[image.id] = { fileID, filename: image.filename, size: image.size, sha256 }
    }
  } catch {
    const error = failure('CLOUD_MIGRATION_UPLOAD_FAILED', 'Private upload staging failed; cloud state was not initialized')
    error.cleanupFailures = await discard(files, staged)
    throw error
  }
  try {
    const result = await repository.initialize({ schemaVersion: 1, snapshot, files: uploaded, game: null, cleanup: [] })
    if (!result || result.version !== 1) throw failure('CLOUD_STATE_COMMIT_UNCERTAIN', 'Initialization acknowledgement is incomplete')
    return { status: 'imported', dryRun: false, version: result.version, summary }
  } catch (cause) {
    // Unknown network failures may occur after commit. Keep all uploaded bytes
    // until an operator reads durable state; never undo a possible live import.
    const definite = ['CLOUD_STATE_CONFLICT', 'CLOUD_STATE_INVALID', 'CLOUD_SNAPSHOT_INVALID', 'PERMISSION_DENIED'].includes(cause?.code)
    const error = failure(definite ? 'CLOUD_MIGRATION_INITIALIZE_FAILED' : 'CLOUD_MIGRATION_COMMIT_UNCERTAIN',
      definite ? 'Cloud initialization was rejected; staged file cleanup was attempted' :
        'Cloud initialization outcome is unknown; staged files were preserved and durable state must be checked')
    if (definite) error.cleanupFailures = await discard(files, staged)
    else error.stagedPreserved = staged.length
    throw error
  }
}
