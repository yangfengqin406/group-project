import test from 'node:test'
import assert from 'node:assert/strict'
import { createInvitationOperations } from '../src/utils/invitation-operations.js'

const operation = (userId = 'user-a', action = 'accept') => ({
  userId,
  method: 'invitation.respond',
  params: { invitationId: 'invitation-1', action }
})
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test('邀请网络结果不明时，下一次尝试复用编号并取得原业务结果', async () => {
  let sequence = 0
  const run = createInvitationOperations(() => `key-${++sequence}`)
  const keys = []
  const serverResults = new Map()
  let executions = 0
  const request = async ({ idempotencyKey }) => {
    keys.push(idempotencyKey)
    if (!serverResults.has(idempotencyKey)) {
      ++executions
      serverResults.set(idempotencyKey, { status: 'accepted' })
      throw Object.assign(new Error('响应中断'), { code: 'SERVICE_UNAVAILABLE' })
    }
    return serverResults.get(idempotencyKey)
  }
  await assert.rejects(run(operation(), request), { code: 'SERVICE_UNAVAILABLE' })
  assert.deepEqual(await run(operation(), request), { status: 'accepted' })
  assert.deepEqual(keys, ['key-1', 'key-1'])
  assert.equal(executions, 1)
  await run(operation(), async ({ idempotencyKey }) => assert.equal(idempotencyKey, 'key-2'))
})

test('相同邀请的连续点击共用进行中的请求，不重复调用服务', async () => {
  const run = createInvitationOperations(() => 'one-key')
  const waiting = deferred()
  let calls = 0
  const request = () => { ++calls; return waiting.promise }
  const first = run(operation(), request)
  const second = run(operation(), request)
  await Promise.resolve()
  assert.equal(calls, 1)
  waiting.resolve({ status: 'accepted' })
  assert.deepEqual(await Promise.all([first, second]), [{ status: 'accepted' }, { status: 'accepted' }])
})

test('明确业务冲突结束这次操作；不同账号和不同动作不复用编号', async () => {
  let sequence = 0
  const run = createInvitationOperations(() => `key-${++sequence}`)
  const keys = []
  const fail = (code) => async ({ idempotencyKey }) => {
    keys.push(idempotencyKey)
    throw Object.assign(new Error(code), { code })
  }
  await assert.rejects(run(operation(), fail('CONFLICT')))
  await assert.rejects(run(operation(), fail('SERVICE_UNAVAILABLE')))
  await assert.rejects(run(operation('user-b'), fail('SERVICE_UNAVAILABLE')))
  await assert.rejects(run(operation('user-a', 'reject'), fail('SERVICE_UNAVAILABLE')))
  await assert.rejects(run(operation(), fail('SERVICE_UNAVAILABLE')))
  assert.deepEqual(keys, ['key-1', 'key-2', 'key-3', 'key-4', 'key-2'])
})

test('未知异常继续保留编号；未登录不调用服务', async () => {
  let sequence = 0
  const run = createInvitationOperations(() => `key-${++sequence}`)
  const keys = []
  const request = async ({ idempotencyKey }) => {
    keys.push(idempotencyKey)
    throw new Error('未知响应状态')
  }
  await assert.rejects(run(operation(), request))
  await assert.rejects(run(operation(), request))
  await assert.rejects(run(operation(null), request), { code: 'UNAUTHENTICATED' })
  assert.deepEqual(keys, ['key-1', 'key-1'])
})
