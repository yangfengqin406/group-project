import { createHmac, timingSafeEqual } from 'node:crypto'

const fail = code => Object.assign(new Error('Cloud push event could not be processed'), { code })
const matches = (value, expected) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) &&
  timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(expected, 'hex'))

export function createCloudPushHandler({ worker, wakeup, secret, timerName = 'campus-push-recovery', now = Date.now }) {
  if (typeof worker?.run !== 'function' || typeof wakeup?.wake !== 'function' || typeof secret !== 'string' || secret.length < 32)
    throw fail('PUSH_WORKER_NOT_CONFIGURED')
  return async event => {
    let jobIds
    if (event?.Type === 'Timer' && event.TriggerName === timerName) {
      const expected = createHmac('sha256', secret).update('campus-push-recovery').digest('hex')
      if (!matches(event.Message, expected)) throw fail('PUSH_EVENT_FORBIDDEN')
    } else {
      jobIds = event?.jobIds
      if (event?.type !== 'campus-push-wakeup' || !Array.isArray(jobIds) || jobIds.length < 1 || jobIds.length > 5 ||
          new Set(jobIds).size !== jobIds.length || jobIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) ||
          !Number.isSafeInteger(event.timestamp) || now() - event.timestamp > 3_600_000 || event.timestamp - now() > 120_000)
        throw fail('PUSH_EVENT_FORBIDDEN')
      const body = JSON.stringify({ type: event.type, jobIds, timestamp: event.timestamp })
      const expected = createHmac('sha256', secret).update(body).digest('hex')
      if (!matches(event.signature, expected)) throw fail('PUSH_EVENT_FORBIDDEN')
    }
    const result = await worker.run(jobIds)
    if (!result.retryNeeded) return { processed: result.processed }
    if (result.processed >= 5 && result.readyJobIds?.length) {
      // At most one bounded follow-up; occupied or delayed jobs never fan out.
      // Larger missed-wakeup backlogs remain durable for the recovery trigger.
      await wakeup.wake(result.readyJobIds.slice(0, 5))
      return { processed: result.processed }
    }
    throw fail('PUSH_RETRY_PENDING')
  }
}
