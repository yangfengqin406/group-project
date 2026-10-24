// Run after both builds: node scripts/report-build-size.mjs [--json]
// Raw directory sizes help locate assets; they are not WeChat's upload/package analysis.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const relative = (file) => path.relative(root, file).split(path.sep).join('/')
const sum = (files) => files.reduce((total, file) => total + file.bytes, 0)
const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`

function filesWithin(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return filesWithin(file)
    if (!entry.isFile()) return []
    const stat = fs.statSync(file)
    return [{ path: relative(file), bytes: stat.size, modifiedAt: stat.mtime.toISOString() }]
  })
}

function totals(files) {
  return { fileCount: files.length, bytes: sum(files) }
}

function assetGroups(files, prefix) {
  const groups = new Map()
  for (const file of files) {
    const parts = file.path.slice(prefix.length).split('/')
    const group = parts[0] === 'pets' && parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0]
    const contents = groups.get(group) || []
    contents.push(file)
    groups.set(group, contents)
  }
  return [...groups.entries()]
    .map(([directory, contents]) => ({ directory, ...totals(contents) }))
    .sort((left, right) => right.bytes - left.bytes)
}

const staticFiles = filesWithin(path.join(root, 'src/static'))
const h5Files = filesWithin(path.join(root, 'dist/build/h5'))
const weixinFiles = filesWithin(path.join(root, 'dist/build/mp-weixin'))
const appFile = path.join(root, 'dist/build/mp-weixin/app.json')
const app = fs.existsSync(appFile) ? JSON.parse(fs.readFileSync(appFile, 'utf8')) : null
const packages = app?.subPackages || app?.subpackages || []
const packageRoots = packages.map((entry) => entry.root.replace(/^\/+|\/+$/g, ''))
const weixinPrefix = 'dist/build/mp-weixin/'
const inSubpackage = (file) => packageRoots.some((packageRoot) => file.path.startsWith(`${weixinPrefix}${packageRoot}/`))

const report = {
  measuredAt: new Date().toISOString(),
  note: '目录原始字节统计，不代表压缩后的上传包或微信开发者工具验收结果。修改源码后应重新构建再测量。',
  sourceStatic: {
    ...totals(staticFiles),
    groups: assetGroups(staticFiles, 'src/static/'),
    largestFiles: [...staticFiles].sort((left, right) => right.bytes - left.bytes).slice(0, 8)
  },
  h5: {
    built: fs.existsSync(path.join(root, 'dist/build/h5/index.html')),
    ...totals(h5Files)
  },
  weixin: {
    built: Boolean(app),
    ...totals(weixinFiles),
    mainPackageRaw: totals(weixinFiles.filter((file) => !inSubpackage(file))),
    subpackages: packageRoots.map((packageRoot) => ({
      root: packageRoot,
      ...totals(weixinFiles.filter((file) => file.path.startsWith(`${weixinPrefix}${packageRoot}/`)))
    })),
    mainOver2MiBReference: Boolean(app) && sum(weixinFiles.filter((file) => !inSubpackage(file))) > 2 * 1024 * 1024,
    limitation: '2 MiB 仅作主包原始体积排查参考；实际限制及大小须以当前微信官方规则与开发者工具代码依赖分析、上传结果为准。'
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(report.note)
  console.log(`源码静态素材：${staticFiles.length} 文件，${sum(staticFiles)} 字节（${mib(sum(staticFiles))}）`)
  for (const group of report.sourceStatic.groups) {
    console.log(`  ${group.directory}: ${group.bytes} 字节（${mib(group.bytes)}）`)
  }
  console.log('最大素材：')
  for (const file of report.sourceStatic.largestFiles) console.log(`  ${file.path}: ${file.bytes} 字节`)
  console.log(report.h5.built ? `H5 构建目录：${h5Files.length} 文件，${sum(h5Files)} 字节（${mib(sum(h5Files))}）` : 'H5：尚无构建目录')
  if (app) {
    const main = report.weixin.mainPackageRaw
    console.log(`微信构建目录：${weixinFiles.length} 文件，${sum(weixinFiles)} 字节（${mib(sum(weixinFiles))}）`)
    console.log(`微信主包目录原始大小：${main.bytes} 字节（${mib(main.bytes)}）；${packages.length} 个分包`)
    for (const subpackage of report.weixin.subpackages) console.log(`  ${subpackage.root}: ${subpackage.bytes} 字节（${mib(subpackage.bytes)}）`)
    if (report.weixin.mainOver2MiBReference) console.log('主包原始大小超过 2 MiB 参考线，仍需处理素材或分包并用微信工具验证。')
    console.log(report.weixin.limitation)
  } else {
    console.log('微信：尚无 app.json，请先完成微信构建')
  }
}
