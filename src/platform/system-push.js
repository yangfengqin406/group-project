const fail = (message) => new Error(message)
export const pushPlatform = () => uni.getSystemInfoSync().platform.toLowerCase()
export function pushPermission() {
  try { return uni.getAppAuthorizeSetting().notificationAuthorized === 'authorized' }
  catch { return false }
}
export function pushClientId() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(fail('未取得推送设备标识，请确认安装包已启用 uni-push 2。')), 12000)
    try {
      if (pushPlatform() === 'android' && plus.android.importClass('android.os.Build$VERSION').SDK_INT >= 26 && typeof uni.getChannelManager === 'function') {
        uni.getChannelManager().setPushChannel({ channelId: 'campus_private_messages_v1', channelDesc: '校园私信',
          importance: 4, enableVibration: true, lockscreenVisibility: 0 })
      }
      uni.getPushClientId({ success(result) {
        clearTimeout(timer)
        if (/^[A-Za-z0-9_-]{10,200}$/.test(result.cid || '')) resolve(result.cid)
        else reject(fail('推送设备尚未就绪，请稍后重试。'))
      }, fail() { clearTimeout(timer); reject(fail('推送模块未就绪，请联系维护者确认新版安装包和推送配置。')) } })
    } catch { clearTimeout(timer); reject(fail('此安装包未包含系统推送模块，请更新安装包。')) }
  })
}
export async function requestPushPermission() {
  if (pushPermission()) return
  if (pushPlatform() === 'android') {
    const version = plus.android.importClass('android.os.Build$VERSION')
    if (version.SDK_INT >= 33) await new Promise((resolve, reject) => {
      plus.android.requestPermissions(['android.permission.POST_NOTIFICATIONS'], resolve,
        () => reject(fail('通知权限申请失败，请到系统设置开启。')))
    })
  } else if (pushPlatform() === 'ios') {
    // pushRegisterMode=manual: obtain CID only after the user presses enable.
    await pushClientId()
  }
}
export function openPushSettings() {
  uni.openAppAuthorizeSetting({ fail: () => uni.showToast({ title: '请在手机设置中找到校园生活广场，开启通知。', icon: 'none' }) })
}
