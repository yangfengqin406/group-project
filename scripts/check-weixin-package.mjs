// Read-only raw-directory budget, not WeChat's actual upload/package analysis.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const WEIXIN_RAW_BUDGET_BYTES = 2 * 1024 * 1024
const scriptFile = fileURLToPath(import.meta.url)
const defaultBuild = path.resolve(path.dirname(scriptFile), '../dist/build/mp-weixin')
const limitation = '仅检查目录原始字节；团队保守预算为每包 2 MiB，不代表微信开发者工具分析、实际上传或真机验收通过。'

export function inspectWeixinPackage(buildDirectory = defaultBuild) {
  const directory = path.resolve(buildDirectory)
  const appFile = path.join(directory, 'app.json')
  if (!fs.existsSync(appFile) || !fs.lstatSync(appFile).isFile())
    throw new Error(`缺少微信构建 app.json，请先完成构建：${directory}`)
  const app = JSON.parse(fs.readFileSync(appFile, 'utf8'))
  if (!app || typeof app !== 'object' || Array.isArray(app))
    throw new Error('app.json 必须是对象')

  const roots = []
  for (const key of ['subPackages', 'subpackages']) {
    if (app[key] === undefined) continue
    if (!Array.isArray(app[key])) throw new Error(`app.json ${key} 必须是数组`)
    for (const entry of app[key]) {
      if (typeof entry?.root !== 'string') throw new Error('分包必须提供 root 目录')
      const root = entry.root.replace(/\\/g, '/').replace(/\/+$/, '')
      if (!root || root.includes(':') || root.split('/').some((part) => !part || part === '.' || part === '..'))
        throw new Error(`分包 root 必须是构建目录内的相对路径：${entry.root}`)
      if (roots.some((other) => root === other || root.startsWith(`${other}/`) || other.startsWith(`${root}/`)))
        throw new Error(`分包 root 重复或重叠：${root}`)
      roots.push(root)
    }
  }
  const main = { root: '', bytes: 0, fileCount: 0 }
  const subpackages = roots.map((root) => ({ root, bytes: 0, fileCount: 0 }))
  function walk(current, relative = '') {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      const filename = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) { walk(absolute, filename); continue }
      if (!entry.isFile()) throw new Error(`不能可靠统计非普通文件：${filename}`)
      const owner = subpackages.find((item) => filename.startsWith(`${item.root}/`)) || main
      owner.bytes += fs.statSync(absolute).size
      owner.fileCount++
    }
  }
  walk(directory)
  for (const item of subpackages) {
    if (!item.fileCount) throw new Error(`分包目录不存在或没有构建文件：${item.root}`)
  }
  for (const item of [main, ...subpackages]) item.withinBudget = item.bytes <= WEIXIN_RAW_BUDGET_BYTES
  return {
    directory, budgetBytes: WEIXIN_RAW_BUDGET_BYTES, main, subpackages,
    totalBytes: [main, ...subpackages].reduce((sum, item) => sum + item.bytes, 0),
    ok: [main, ...subpackages].every((item) => item.withinBudget), limitation
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  console.log(limitation)
  try {
    const report = inspectWeixinPackage(process.argv[2] || defaultBuild)
    for (const item of [report.main, ...report.subpackages]) {
      const name = item.root ? `分包 ${item.root}` : '主包'
      console.log(`${name}：${item.bytes} 原始字节 / ${report.budgetBytes} 字节预算；${item.withinBudget ? '通过' : '超出预算'}`)
    }
    console.log(`合计：${report.totalBytes} 原始字节`)
    process.exitCode = report.ok ? 0 : 1
  } catch (error) {
    console.error(`微信包体检查失败：${error.message}`)
    process.exitCode = 1
  }
}
