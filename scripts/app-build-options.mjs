export function appBuildOptions(env = process.env) {
  const raw = env.CAMPUS_APP_ORIGIN
  let origin
  try { origin = new URL(raw) } catch { /* Validated below. */ }
  const local = env.CAMPUS_APP_ALLOW_LOCAL === 'true'
  if (!origin || origin.origin !== raw || origin.username || origin.password ||
      (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')))
    throw new Error('CAMPUS_APP_ORIGIN 必须是完整HTTPS源，不带路径、凭据或查询；局域网HTTP调试需显式开启 CAMPUS_APP_ALLOW_LOCAL=true')
  const appId = env.CAMPUS_DCLOUD_APP_ID || ''
  if (appId && !/^__UNI__[A-Za-z0-9]+$/.test(appId))
    throw new Error('CAMPUS_DCLOUD_APP_ID 须为 DCloud 后台签发的 __UNI__ AppID')
  const contactEmail = env.VITE_APP_CONTACT_EMAIL || ''
  const privacyUrl = env.VITE_APP_PRIVACY_URL || ''
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('请填写可联系维护者的邮箱')
  if (privacyUrl) {
    let policy
    try { policy = new URL(privacyUrl) } catch { /* Validated below. */ }
    if (!policy || policy.protocol !== 'https:' || policy.username || policy.password) throw new Error('隐私政策必须是有效HTTPS地址')
  }
  const release = env.CAMPUS_APP_RELEASE === 'true'
  if (release && (origin.protocol !== 'https:' || !appId || !contactEmail || !privacyUrl))
    throw new Error('正式发布构建须配置HTTPS后端、真实DCloud AppID、联系邮箱及隐私政策地址')
  return {
    origin: origin.origin, appId, bound: Boolean(appId), contactEmail, privacyUrl,
    apiBaseUrl: `${origin.origin}/api`, gameBaseUrl: `${origin.origin}/game`,
    release
  }
}
