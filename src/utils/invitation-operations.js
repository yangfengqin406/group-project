import { idempotencyKey } from './routes.js'
import { ServiceError } from './errors.js'

// Only unresolved requests live here. Nothing is persisted or shared across accounts.
const businessErrors = new Set([
  'INVALID_ARGUMENT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'NOT_IMPLEMENTED'
])

export function createInvitationOperations(createKey = idempotencyKey) {
  const operations = new Map()
  return function execute({ userId, method, params }, request) {
    if (!userId)
      return Promise.reject(new ServiceError('UNAUTHENTICATED', '请先登录'))
    const fingerprint = JSON.stringify([userId, method, params])
    let operation = operations.get(fingerprint)
    if (!operation) {
      operation = { key: createKey(), promise: null }
      operations.set(fingerprint, operation)
    }
    if (operation.promise) return operation.promise
    operation.promise = Promise.resolve()
      .then(() => request({ ...params, idempotencyKey: operation.key }))
      .then(
        (result) => {
          operations.delete(fingerprint)
          return result
        },
        (error) => {
          if (businessErrors.has(error?.code)) operations.delete(fingerprint)
          throw error
        }
      )
      .finally(() => {
        operation.promise = null
      })
    return operation.promise
  }
}

export const runInvitationOperation = createInvitationOperations()
