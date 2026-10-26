import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PRIVATE_JS = ['services/landlord.js', 'services/game-transport.js', 'utils/game-session.js']
const SCOPE = '仅检查组件按需注入与牌桌私有JS位置，不等同微信完整代码质量扫描'

export function inspectWeixinQuality(directory = 'dist/build/mp-weixin') {
  const root = path.resolve(directory)
  const issues = []
  const appFile = path.join(root, 'app.json')
  let app
  try { app = JSON.parse(fs.readFileSync(appFile, 'utf8')) } catch {
    issues.push('未找到有效 app.json，请先构建微信小程序并核对检查目录。')
    return { ok: false, issues, scope: SCOPE }
  }
  if (!app || typeof app !== 'object' || Array.isArray(app))
    return { ok: false, issues: ['app.json 必须为小程序配置对象。'], scope: SCOPE }
  if (app.lazyCodeLoading !== 'requiredComponents')
    issues.push('app.json 未启用 lazyCodeLoading: requiredComponents。')
  for (const file of PRIVATE_JS) {
    if (fs.existsSync(path.join(root, file))) issues.push(`主包仍包含牌桌专用JS：${file}`)
    if (!isFile(path.join(root, 'rooms', file))) issues.push(`rooms 分包缺少牌桌专用JS：${file}`)
  }
  if (!isFile(path.join(root, 'rooms/landlord/index.js')))
    issues.push('rooms 分包缺少斗地主页面：landlord/index.js')
  return { ok: issues.length === 0, issues, scope: SCOPE }
}

function isFile(file) {
  try { return fs.statSync(file).isFile() } catch { return false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = inspectWeixinQuality(process.argv[2])
  if (report.ok) process.stdout.write(`微信定向质量检查通过。${report.scope}。\n`)
  else {
    process.stderr.write(`微信定向质量检查失败：\n${report.issues.map((issue) => `- ${issue}`).join('\n')}\n${report.scope}。\n`)
    process.exitCode = 1
  }
}
