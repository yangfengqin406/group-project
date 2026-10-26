// Guard a known WXSS incompatibility after uni-app emits scoped selectors.
// This is deliberately narrower than the official WeChat style compiler.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptFile = fileURLToPath(import.meta.url)
const defaultBuild = path.resolve(path.dirname(scriptFile), '../dist/build/mp-weixin')

function universalOffset(selector) {
  let quote = '', attributes = 0
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]
    if (c === '\\') { i++; continue }
    if (quote) { if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '[') attributes++
    else if (c === ']') attributes--
    else if (c === '*' && attributes === 0) return i
  }
  return -1
}

export function findWxssSelectorIssues(css) {
  const issues = []
  let start = 0, quote = '', comment = false, parentheses = 0, attributes = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i], next = css[i + 1]
    if (comment) { if (c === '*' && next === '/') { comment = false; i++ } continue }
    if (c === '\\') { i++; continue }
    if (quote) { if (c === quote) quote = ''; continue }
    if (c === '/' && next === '*') { comment = true; i++; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '(') parentheses++
    else if (c === ')') parentheses--
    else if (c === '[') attributes++
    else if (c === ']') attributes--
    if (parentheses || attributes) continue
    if (c === '{') {
      // Preserve offsets while excluding comments from selector checks.
      const header = css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, (value) => ' '.repeat(value.length))
      if (!header.trimStart().startsWith('@')) {
        const star = universalOffset(header)
        if (star >= 0) {
          const offset = start + star, before = css.slice(0, offset)
          issues.push({ selector: header.trim(), line: before.split('\n').length,
            column: offset - before.lastIndexOf('\n') })
        }
      }
      start = i + 1
    } else if (c === ';' || c === '}') start = i + 1
  }
  return issues
}

export function inspectWeixinStyles(buildDirectory = defaultBuild) {
  const directory = path.resolve(buildDirectory)
  if (!fs.existsSync(path.join(directory, 'app.json'))) throw new Error('缺少微信构建 app.json，请先构建')
  const files = []
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const filename = path.join(folder, entry.name)
      if (entry.isDirectory()) walk(filename)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.wxss')) files.push(filename)
    }
  }
  walk(directory)
  if (!files.length) throw new Error('未找到 WXSS 构建产物')
  const issues = files.flatMap((filename) => findWxssSelectorIssues(fs.readFileSync(filename, 'utf8'))
    .map((issue) => ({ file: path.relative(directory, filename).replaceAll('\\', '/'), ...issue })))
  return { files: files.length, issues, ok: issues.length === 0 }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  try {
    const report = inspectWeixinStyles(process.argv[2])
    for (const issue of report.issues)
      process.stderr.write(`${issue.file}:${issue.line}:${issue.column} 微信不兼容通配选择器：${issue.selector}\n`)
    process.stdout.write(`微信样式通配检查：${report.files} 份WXSS，${report.issues.length} 处问题。仅覆盖此类兼容问题，不代替微信编译或真机验收。\n`)
    process.exitCode = report.ok ? 0 : 1
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
}
