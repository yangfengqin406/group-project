import { parentPort, workerData } from 'node:worker_threads'
import { openCStore } from '../../backend/c/store.js'
import { createCService } from '../../backend/c/service.js'

const barrier = new Int32Array(workerData.barrier)
Atomics.wait(barrier, 0, 0)
let store
try {
  store = openCStore(workerData.filename)
  const service = createCService({ store,
    getUser: (id) => ['alice', 'bob'].includes(id) ? { id, nickname: id } : null,
    getExternalContent: () => ({ id: 'market', type: 'market', title: '二手', ownerId: 'alice', visibility: 'public' })
  })
  const result = service.invoke('message.send', {
    conversationId: workerData.conversationId, body: '并发重试同一条消息', idempotencyKey: 'concurrent-retry'
  }, { userId: 'bob' })
  parentPort.postMessage({ id: result.id })
} catch (error) { parentPort.postMessage({ error: error.message }) }
finally { store?.close() }
