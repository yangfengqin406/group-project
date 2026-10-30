import { config } from '../config/index.js'
import { ServiceError } from '../utils/errors.js'
import { prepareConnectionSession } from '../utils/session.js'
import { messageAlerts } from './message-alerts.js'
import { soundscape } from './soundscape.js'
import { createAppConnectionPreferences, normalizeAppOrigin } from '../platform/app-connection.js'

let appSupported = false
// #ifdef APP-PLUS
appSupported = true
// #endif

function anonymousHealth(origin) {
  return new Promise((resolve, reject) => {
    try {
      uni.request({
        url: `${origin}/api/health`, method: 'GET', timeout: 10000,
        header: { Accept: 'application/json', Cookie: '' }, withCredentials: false,
        success: (response) => resolve(response),
        fail: () => reject(new ServiceError('SERVICE_UNAVAILABLE', '测试服务连接失败，请检查地址和网络后重试。'))
      })
    } catch { reject(new ServiceError('SERVICE_UNAVAILABLE', '当前设备无法检查测试服务。')) }
  })
}

export function createConnectionService(options = {}) {
  const enabled = options.supported ?? appSupported
  const settings = options.config || config
  const preferences = options.preferences || createAppConnectionPreferences()
  const request = options.request || anonymousHealth
  const native = options.native || (() => typeof plus === 'undefined' ? undefined : plus)
  const prepareSession = options.prepareSession || prepareConnectionSession
  const stopServices = options.stopServices || (() => { messageAlerts.stop(); messageAlerts.reset(); return soundscape.setVisible(false) })
  const resumeServices = options.resumeServices || (() => messageAlerts.start())
  let busy = false
  const currentOrigin = (settings.apiBaseUrl || '').replace(/\/api$/, '')
  const defaultOrigin = settings.defaultAppOrigin || currentOrigin
  function getState() {
    const state = { supported: enabled, currentOrigin, defaultOrigin, usesOverride: currentOrigin !== defaultOrigin }
    if (!enabled) return state
    try {
      preferences.read()
      if (settings.appConnectionError) state.error = settings.appConnectionError
    } catch (error) { state.error = error.message || '测试服务地址读取失败，请恢复默认或重试。' }
    return state
  }
  const isCurrent = (options) => {
    if (!options.current) return true
    try { return typeof options.current === 'function' && Boolean(options.current()) } catch { return false }
  }
  const ensureCurrent = (options) => {
    if (!isCurrent(options))
      throw new ServiceError('CONFLICT', '当前页面已离开，服务地址未切换。')
  }
  async function change(origin, restoring, lifecycle = {}) {
    if (!enabled) throw new ServiceError('NOT_SUPPORTED', '仅App支持切换测试服务地址。')
    if (busy) throw new ServiceError('CONFLICT', '正在切换测试服务地址，请稍候。')
    const target = normalizeAppOrigin(origin)
    const runtime = native()?.runtime
    if (typeof runtime?.restart !== 'function') throw new ServiceError('NOT_SUPPORTED', '当前App无法重新启动，服务地址未切换。')
    ensureCurrent(lifecycle)
    busy = true
    let sessionChange, previous, preferenceTouched = false, restarting = false
    try {
      if (!restoring) {
        const response = await request(target)
        if (response?.statusCode !== 200 || response.data?.code !== 'OK' ||
            response.data.data?.mode !== 'local-persistent' || response.data.data?.database !== 'sqlite')
          throw new ServiceError('SERVICE_UNAVAILABLE', '该地址没有返回可验证的校园服务，原连接未切换。')
      }
      ensureCurrent(lifecycle)
      previous = preferences.raw()
      sessionChange = prepareSession(`${target}/api`)
      await stopServices()
      ensureCurrent(lifecycle)
      preferenceTouched = true
      if (restoring || target === defaultOrigin) preferences.clear()
      else preferences.save(target)
      const result = await runtime.restart()
      if (result === false) throw new Error('restart refused')
      restarting = true
      return { restarting: true }
    } catch (error) {
      let rollbackFailed = false
      if (preferenceTouched) { try { preferences.restore(previous) } catch { rollbackFailed = true } }
      if (sessionChange) { try { sessionChange.rollback() } catch { rollbackFailed = true } }
      if (sessionChange && isCurrent(lifecycle)) { try { Promise.resolve(resumeServices()).catch(() => {}) } catch { /* The original failure remains visible. */ } }
      if (rollbackFailed) throw new ServiceError('SERVICE_UNAVAILABLE', '切换失败且本机状态恢复不完整，请重启App后检查连接并重新登录。')
      if (error instanceof ServiceError) throw error
      throw new ServiceError('SERVICE_UNAVAILABLE', 'App重新启动失败，已恢复原服务地址和本机登录状态。')
    } finally { if (!restarting) busy = false }
  }
  return {
    getState,
    switchTo: (origin, lifecycle) => change(origin, false, lifecycle),
    restoreDefault: (lifecycle) => change(defaultOrigin, true, lifecycle)
  }
}

const service = createConnectionService()
export const getState = service.getState
export const switchTo = service.switchTo
export const restoreDefault = service.restoreDefault
