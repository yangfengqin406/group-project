import { ServiceError } from '../utils/errors.js'

export const APP_CONNECTION_KEY = 'campus-plaza-app-connection-v1'
const fail = (message) => new ServiceError('SERVICE_UNAVAILABLE', message)

// Do not depend on the browser URL constructor: native App JS may omit it.
export function normalizeAppOrigin(value) {
  const invalid = () => { throw new ServiceError('INVALID_ARGUMENT', '请输入完整HTTPS服务地址，不带路径、账号、查询或片段。') }
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f-\u009f\\]/.test(value)) return invalid()
  // A single root slash is common when pasting a browser address.
  if (value.endsWith('/')) value = value.slice(0, -1)
  const match = /^https:\/\/(\[[a-f0-9:]+\]|[a-z0-9.-]+)(?::([0-9]+))?$/i.exec(value)
  if (!match) return invalid()
  let host = match[1].toLowerCase()
  if (host[0] === '[') {
    const address = host.slice(1, -1), halves = address.split('::')
    const groups = halves.flatMap(part => part ? part.split(':') : [])
    if (halves.length > 2 || groups.some(part => !/^[a-f0-9]{1,4}$/.test(part)) ||
        (halves.length === 1 ? groups.length !== 8 : groups.length >= 8)) return invalid()
  } else {
    if (host.length > 253 || host.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return invalid()
    if (/^[0-9.]+$/.test(host) && (host.split('.').length !== 4 || host.split('.').some(part => !/^(?:0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255))) return invalid()
  }
  const port = match[2]
  if (port && (!/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65535)) return invalid()
  return `https://${host}${port && port !== '443' ? ':' + port : ''}`
}

const absent = (value) => value === undefined || value === null || value === ''
export function createAppConnectionPreferences(getApi = () => typeof uni === 'undefined' ? undefined : uni) {
  function api() {
    const value = getApi()
    if (!value?.getStorageSync || !value?.setStorageSync || !value?.removeStorageSync) throw fail('当前设备无法读写测试服务地址。')
    return value
  }
  function raw() {
    try { return api().getStorageSync(APP_CONNECTION_KEY) } catch { throw fail('测试服务地址读取失败，请重试或恢复默认。') }
  }
  function read() {
    const value = raw()
    if (absent(value)) return null
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.prototype.hasOwnProperty.call(value, 'origin'))
      throw fail('已保存的测试服务地址损坏，请恢复默认或重新设置。')
    try { return { origin: normalizeAppOrigin(value.origin) } } catch { throw fail('已保存的测试服务地址无效，请恢复默认或重新设置。') }
  }
  function restore(previous) {
    try {
      if (absent(previous)) api().removeStorageSync(APP_CONNECTION_KEY)
      else api().setStorageSync(APP_CONNECTION_KEY, previous)
      if (JSON.stringify(raw()) !== JSON.stringify(previous) && !(absent(raw()) && absent(previous))) throw new Error('storage mismatch')
    } catch { throw fail('服务地址恢复失败，请重新启动App后检查。') }
  }
  function save(origin) {
    try {
      api().setStorageSync(APP_CONNECTION_KEY, { origin: normalizeAppOrigin(origin) })
      if (read()?.origin !== origin) throw new Error('storage mismatch')
    } catch { throw fail('测试服务地址保存失败，原连接未切换。') }
  }
  function clear() {
    try { api().removeStorageSync(APP_CONNECTION_KEY); if (!absent(raw())) throw new Error('storage mismatch') }
    catch { throw fail('默认服务地址恢复失败，原连接未切换。') }
  }
  return { raw, read, save, clear, restore }
}

export function loadAppConnection(defaultApiBaseUrl, preferences = createAppConnectionPreferences()) {
  let defaultOrigin = '', origin = '', error = ''
  try { defaultOrigin = normalizeAppOrigin(defaultApiBaseUrl.replace(/\/api$/, '')); origin = defaultOrigin }
  catch { error = '安装包默认服务地址无效，请联系项目维护者。' }
  if (defaultOrigin) {
    try { origin = preferences.read()?.origin || defaultOrigin }
    catch (failure) { error = failure.message }
  }
  return { defaultOrigin, origin, error, apiBaseUrl: origin ? `${origin}/api` : '', gameBaseUrl: origin ? `${origin}/game` : '' }
}
