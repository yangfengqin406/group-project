import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCampusService } from '../campus/service.js'
import { hydrateStore } from './state.js'

const JOBS = 'campus.pushJobs'
const LEASE_MS = 90_000, LIFETIME_MS = 3_600_000, MAX_ATTEMPTS = 8, CAS_ATTEMPTS = 4
const fail = (code) => Object.assign(new Error('云端推送队列暂时不可用，请重试'), { code })
const jobs = (state, ids) => state.snapshot.records.filter(row => row.collection === JOBS && (!ids || ids.has(row.id)))
  .map(row => JSON.parse(row.data))
const find = (state, id) => jobs(state, new Set([id]))[0]
const activeLease = (job, time) => typeof job.leaseOwner === 'string' && job.leaseUntil > time
const expired = (job, time) => time - job.createdAt >= LIFETIME_MS
const clearLease = (job) => {
  const value = { ...job }
  delete value.leaseOwner
  delete value.leaseUntil
  return value
}

// Claims and outcomes change one existing job. Other business state, including
// a concurrent message/read/identity update, always comes from the latest read.
function withJob(state, job) {
  return { ...state, snapshot: { ...state.snapshot, records: state.snapshot.records.map(row =>
    row.collection === JOBS && row.id === job.id ? { ...row, data: JSON.stringify(job) } : row) } }
}

export function createCloudPushWorker({ repository, provider, now = Date.now, ownerId = randomUUID(), limit = 5 }) {
  if (typeof repository?.read !== 'function' || typeof repository?.compareAndSwap !== 'function' ||
      typeof provider?.send !== 'function' || typeof now !== 'function' ||
      typeof ownerId !== 'string' || !ownerId || ownerId.length > 128 || !Number.isInteger(limit) || limit < 1 || limit > 5)
    throw fail('PUSH_WORKER_NOT_CONFIGURED')

  async function read() {
    const state = await repository.read()
    if (!state) throw fail('PUSH_STATE_UNAVAILABLE')
    return state
  }
  async function save(state, value) {
    try {
      await repository.compareAndSwap(state.version, withJob(state, value))
      return true
    } catch (error) {
      if (error.code === 'CLOUD_STATE_CONFLICT') return false
      if (error.code !== 'CLOUD_STATE_COMMIT_UNCERTAIN') throw error
      const observed = find(await read(), value.id)
      // An uncertain write is safe to use only when its exact task mutation is
      // visible in committed state. In particular, never send on a guessed lease.
      if (JSON.stringify(observed) === JSON.stringify(value)) return true
      throw fail('PUSH_STATE_COMMIT_UNCERTAIN')
    }
  }
  async function claim(ids, token) {
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const state = await read(), time = now()
      const job = jobs(state, ids).find(value => value.status === 'pending' && !activeLease(value, time) &&
        (value.nextAt <= time || expired(value, time) || value.attempts >= MAX_ATTEMPTS))
      if (!job) return null
      const terminal = expired(job, time) ? 'discarded' : job.attempts >= MAX_ATTEMPTS ? 'failed' : null
      const next = terminal ? { ...clearLease(job), status: terminal } :
        { ...job, attempts: job.attempts + 1, leaseOwner: token, leaseUntil: time + LEASE_MS }
      if (await save(state, next)) return { id: job.id, terminal: Boolean(terminal) }
    }
    throw fail('PUSH_STATE_CONFLICT')
  }
  async function settle(id, token, status) {
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const state = await read(), job = find(state, id)
      // Account deletion can remove a job while the provider is responding.
      // A lease taken over by another event also belongs to that event alone.
      if (!job || job.status !== 'pending' || job.leaseOwner !== token) return
      const next = { ...clearLease(job), status }
      if (status === 'pending') {
        next.status = expired(job, now()) ? 'discarded' : job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
        next.nextAt = now() + Math.min(300_000, 5000 * 2 ** (job.attempts - 1))
      }
      if (await save(state, next)) return
    }
    throw fail('PUSH_STATE_CONFLICT')
  }
  async function prepare(id, token, directory) {
    const state = await read(), job = find(state, id)
    if (!job || job.status !== 'pending' || job.leaseOwner !== token || !activeLease(job, now())) return undefined
    const store = hydrateStore(state.snapshot)
    let service
    try {
      // Reuse the business permission checks without exporting this temporary
      // store. Constructor cleanup cannot change committed uploads or records.
      service = createCampusService({ store, uploadsDir: join(directory, 'uploads'), now })
      return service.push.prepareDelivery(job)
    } finally { service?.push.stop(); store.close() }
  }
  async function remaining(ids) {
    const pending = jobs(await read(), ids).filter(job => job.status === 'pending'), time = now()
    const wait = pending.map(job => activeLease(job, time) ? job.leaseUntil - time :
      expired(job, time) || job.attempts >= MAX_ATTEMPTS ? 0 : Math.max(0, job.nextAt - time))
    return { retryNeeded: pending.length > 0, retryAfterMs: wait.length ? Math.min(...wait) : 0,
      remainingJobIds: pending.map(job => job.id),
      readyJobIds: pending.filter(job => !activeLease(job, time) &&
        (expired(job, time) || job.attempts >= MAX_ATTEMPTS || job.nextAt <= time)).slice(0, 5).map(job => job.id) }
  }
  return {
    async run(jobIds) {
      if (jobIds !== undefined && (!Array.isArray(jobIds) || jobIds.length > 100 ||
          jobIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)))) throw fail('INVALID_PUSH_JOB_IDS')
      const ids = jobIds === undefined ? null : new Set(jobIds)
      const token = `${ownerId}:${randomUUID()}`
      const directory = await mkdtemp(join(tmpdir(), 'campus-cloud-push-'))
      let processed = 0
      try {
        while (processed < limit) {
          const claimed = await claim(ids, token)
          if (!claimed) break
          processed++
          if (claimed.terminal) continue
          const message = await prepare(claimed.id, token, directory)
          if (message === undefined) continue
          if (!message) { await settle(claimed.id, token, 'discarded'); continue }
          let status = 'accepted'
          try { await provider.send(message) } catch { status = 'pending' }
          await settle(claimed.id, token, status)
        }
        return { processed, ...await remaining(ids) }
      } finally { await rm(directory, { recursive: true, force: true }) }
    }
  }
}
