import { createHash, createHmac } from 'node:crypto'

const HOST = 'scf.tencentcloudapi.com'
const ENDPOINT = `https://${HOST}/`
const CONTENT_TYPE = 'application/json; charset=utf-8'
const RESPONSE_LIMIT = 16 * 1024
const TIMEOUT_MS = 2000
const invalid = () => Object.assign(new Error('Cloud push wakeup configuration or input is invalid'), { code: 'CLOUD_PUSH_WAKEUP_INVALID' })
const unavailable = () => Object.assign(new Error('Cloud push wakeup was not confirmed'), { code: 'CLOUD_PUSH_WAKEUP_UNAVAILABLE' })
const hash = value => createHash('sha256').update(value).digest('hex')
const hmac = (key, value) => createHmac('sha256', key).update(value).digest()
const secretValue = value => typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/[\u0000-\u0020\u007f]/u.test(value)

function credentials(env) {
  const secretId = env.TENCENTCLOUD_SECRETID
  const secretKey = env.TENCENTCLOUD_SECRETKEY
  const sessionToken = env.TENCENTCLOUD_SESSIONTOKEN
  const bridgeSecret = env.CAMPUS_PUSH_BRIDGE_SECRET
  if (!secretValue(secretId) || !/^[A-Za-z0-9_-]{1,256}$/u.test(secretId) ||
    !secretValue(secretKey) || !secretValue(sessionToken) || !secretValue(bridgeSecret) || bridgeSecret.length < 32) throw invalid()
  return { secretId, secretKey, sessionToken, bridgeSecret }
}

function authorization({ secretId, secretKey }, body, timestamp) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const scope = `${date}/scf/tc3_request`
  const canonical = ['POST', '/', '', `content-type:${CONTENT_TYPE}\nhost:${HOST}\n`, 'content-type;host', hash(body)].join('\n')
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), scope, hash(canonical)].join('\n')
  const dateKey = hmac(`TC3${secretKey}`, date)
  const serviceKey = hmac(dateKey, 'scf')
  const signingKey = hmac(serviceKey, 'tc3_request')
  const signature = hmac(signingKey, stringToSign).toString('hex')
  return `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`
}

async function readResult(response) {
  if (!response || response.status !== 200 || response.redirected || response.type === 'opaqueredirect' ||
    (response.url && response.url !== ENDPOINT) || typeof response.headers?.get !== 'function') throw unavailable()
  const length = response.headers.get('content-length')
  if (length !== null && (!/^\d+$/u.test(length) || BigInt(length) > BigInt(RESPONSE_LIMIT))) throw unavailable()
  if (typeof response.body?.getReader !== 'function') throw unavailable()
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) throw unavailable()
      size += value.byteLength
      if (size > RESPONSE_LIMIT) throw unavailable()
      chunks.push(Buffer.from(value))
    }
    const result = JSON.parse(Buffer.concat(chunks, size).toString('utf8'))?.Response
    // Async acceptance confirms scheduling only. The worker owns delivery and
    // persists each outcome after checking the current recipient permissions.
    if (!result || result.Error || result.Result?.InvokeResult !== 0 ||
      typeof result.RequestId !== 'string' || !result.RequestId || result.RequestId.length > 200) throw unavailable()
  } finally {
    try { await reader.cancel() } catch { /* Discard upstream failures. */ }
    reader.releaseLock()
  }
}

export function createPushWakeup({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
  const functionName = env?.CAMPUS_PUSH_WORKER_FUNCTION
  if (functionName === undefined || functionName === '') return null
  const namespace = env.CAMPUS_CLOUDBASE_ENV
  const region = env.CAMPUS_CLOUDBASE_REGION || env.TENCENTCLOUD_REGION
  if (typeof functionName !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,59}$/u.test(functionName) ||
    typeof namespace !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u.test(namespace) ||
    typeof region !== 'string' || !/^[a-z]{2}-[a-z]+(?:-[a-z]+)?$/u.test(region) ||
    typeof fetcher !== 'function' || typeof now !== 'function') throw invalid()
  credentials(env)
  return {
    async wake(jobIds) {
      if (!Array.isArray(jobIds) || jobIds.length < 1 || jobIds.length > 5 ||
        !jobIds.every(id => typeof id === 'string' && /^[a-f0-9]{64}$/u.test(id)) || new Set(jobIds).size !== jobIds.length) throw invalid()
      const timestamp = now()
      if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8_640_000_000_000_000) throw invalid()
      // SCF rotates its role credentials. Read them for every invocation and
      // keep both signing secrets in the server runtime only.
      const current = credentials(env)
      const event = { type: 'campus-push-wakeup', jobIds: [...jobIds], timestamp }
      const signature = hmac(current.bridgeSecret, JSON.stringify(event)).toString('hex')
      const body = JSON.stringify({ FunctionName: functionName, Namespace: namespace, InvocationType: 'Event',
        ClientContext: JSON.stringify({ ...event, signature }) })
      const seconds = Math.floor(timestamp / 1000)
      const controller = new AbortController()
      let timer
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(unavailable()) }, TIMEOUT_MS)
      })
      try {
        await Promise.race([timeout, (async () => {
          const response = await fetcher(ENDPOINT, { method: 'POST', redirect: 'error', credentials: 'omit',
            headers: { 'Content-Type': CONTENT_TYPE, Host: HOST, 'X-TC-Action': 'Invoke', 'X-TC-Version': '2018-04-16',
              'X-TC-Region': region, 'X-TC-Timestamp': String(seconds), 'X-TC-Token': current.sessionToken,
              Authorization: authorization(current, body, seconds) }, body, signal: controller.signal })
          await readResult(response)
        })()])
        return { accepted: true }
      } catch {
        controller.abort()
        throw unavailable()
      } finally { clearTimeout(timer) }
    }
  }
}
