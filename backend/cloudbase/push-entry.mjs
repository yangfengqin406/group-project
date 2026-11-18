import { createPgRepository } from './pg-repository.js'
import { createCloudPushWorker } from './push-worker.js'
import { createCloudPushHandler } from './push-handler.js'
import { createPushWakeup } from './push-wakeup.js'
import { createPushBridge } from '../campus/push.js'

// Event-only entry. Client requests cannot supply a provider, principal, or
// message body, and unsigned wakeups are rejected before reading private data.
export async function main(event) {
  const repository = createPgRepository({ envId: process.env.CAMPUS_CLOUDBASE_ENV,
    accessKey: process.env.CAMPUS_CLOUDBASE_KEY, table: process.env.CAMPUS_CLOUDBASE_TABLE || 'campus_runtime' })
  const provider = createPushBridge(), wakeup = createPushWakeup()
  const worker = createCloudPushWorker({ repository, provider })
  const handler = createCloudPushHandler({ worker, wakeup, secret: process.env.CAMPUS_PUSH_BRIDGE_SECRET,
    timerName: process.env.CAMPUS_PUSH_TIMER_NAME || 'campus-push-recovery' })
  return handler(event)
}
