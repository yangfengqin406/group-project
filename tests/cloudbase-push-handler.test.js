import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createCloudPushHandler } from '../backend/cloudbase/push-handler.js'

const secret = 'test-only-cloud-push-secret-0123456789'
const time = 1_800_000_000_000, job = 'a'.repeat(64)
function fixture(result = { processed:1, retryNeeded:false, retryAfterMs:0, remainingJobIds:[] }) {
  const calls = [], wakes = []
  const handler = createCloudPushHandler({ secret, now:() => time,
    worker:{ async run(ids) { calls.push(ids); return result } },
    wakeup:{ async wake(ids) { wakes.push(ids); return { accepted:true } } } })
  return { handler, calls, wakes }
}
function event(jobIds = [job], timestamp = time) {
  const value = { type:'campus-push-wakeup', jobIds, timestamp }
  return { ...value, signature:createHmac('sha256',secret).update(JSON.stringify(value)).digest('hex') }
}

test('CloudBase worker rejects unsigned, changed, stale, future and oversized events before reading jobs', async () => {
  const f = fixture()
  for (const invalid of [{}, { ...event(), signature:'0'.repeat(64) }, { ...event(), jobIds:['b'.repeat(64)] },
    event([job],time-3_600_001), event([job],time+120_001), event([]), event(Array(6).fill(job)),
    { Type:'Timer', TriggerName:'campus-push-recovery', Message:'0'.repeat(64) }])
    await assert.rejects(f.handler(invalid), { code:'PUSH_EVENT_FORBIDDEN' })
  assert.equal(f.calls.length,0)
})

test('CloudBase signed wakeup processes only its committed job IDs', async () => {
  const f = fixture()
  assert.deepEqual(await f.handler(event()), { processed:1 })
  assert.deepEqual(f.calls,[[job]])
})

test('CloudBase authenticated recovery timer scans durable jobs after a missed wakeup', async () => {
  const f = fixture({ processed:0,retryNeeded:false,retryAfterMs:0,remainingJobIds:[] })
  const Message = createHmac('sha256',secret).update('campus-push-recovery').digest('hex')
  assert.deepEqual(await f.handler({ Type:'Timer',TriggerName:'campus-push-recovery',Message }), { processed:0 })
  assert.deepEqual(f.calls,[undefined])
})

test('CloudBase pending retry rejects for platform retries and a finite backlog gets follow-up events', async () => {
  const waiting = fixture({ processed:1,retryNeeded:true,retryAfterMs:5000,remainingJobIds:[job] })
  await assert.rejects(waiting.handler(event()), { code:'PUSH_RETRY_PENDING' })
  assert.equal(waiting.wakes.length,0)
  const ids = Array.from({length:6},(_,i)=>String(i).repeat(64))
  const ready = fixture({ processed:5,retryNeeded:true,retryAfterMs:0,remainingJobIds:ids,readyJobIds:ids.slice(0,5) })
  await ready.handler(event())
  assert.deepEqual(ready.wakes,[ids.slice(0,5)])
  const occupied = fixture({ processed:5,retryNeeded:true,retryAfterMs:90000,remainingJobIds:ids,readyJobIds:[] })
  await assert.rejects(occupied.handler(event()), { code:'PUSH_RETRY_PENDING' })
  assert.equal(occupied.wakes.length,0)
})
