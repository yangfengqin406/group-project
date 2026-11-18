import fs from 'node:fs'
import path from 'node:path'

const TEXT_EXTENSIONS = new Set(['.js', '.wxml', '.wxss', '.json'])
const MARKER = /data-v-[A-Za-z0-9_-]*/g
const SCOPE = /^data-v-([a-f0-9]{8}|[a-f0-9]{6})(-s)?$/

function assertUnlinked(directory) {
  const resolved = path.resolve(directory)
  let current = path.parse(resolved).root
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('微信scope目录不能经过符号链接')
  }
  return resolved
}

// Preflight the entire package before writing. Only generated scope tokens
// change; source assets, selector rules and all other bytes remain intact.
export function compactWeixinScopeIds(directory) {
  const root = assertUnlinked(directory)
  if (!fs.lstatSync(root).isDirectory()) throw new Error('微信scope输出必须是目录')
  const realRoot = fs.realpathSync(root), plans = [], owners = new Map()
  const inside = target => {
    const relative = path.relative(realRoot, fs.realpathSync(target))
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error('微信scope路径超出编译目录')
  }
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name), stat = fs.lstatSync(file)
      if (stat.isSymbolicLink()) throw new Error('微信scope产物不能包含符号链接')
      inside(file)
      if (stat.isDirectory()) { scan(file); continue }
      if (!stat.isFile()) throw new Error('微信scope产物必须是普通文件')
      const original = fs.readFileSync(file)
      if (!original.includes('data-v-')) continue
      if (!TEXT_EXTENSIONS.has(path.extname(file))) throw new Error('微信scope标记位于未支持文件中')
      const text = original.toString('utf8')
      if (!Buffer.from(text, 'utf8').equals(original)) throw new Error('微信scope文本不是有效UTF-8')
      const next = text.replace(MARKER, token => {
        const match = SCOPE.exec(token)
        if (!match) throw new Error('微信scope存在未覆盖的标记')
        const [, hash, suffix = ''] = match, short = hash.slice(0, 6)
        if (owners.has(short) && owners.get(short) !== hash) throw new Error('微信scope六位前缀碰撞')
        owners.set(short, hash)
        return `data-v-${short}${suffix}`
      })
      if (next !== text) plans.push({ file, original, next })
    }
  }
  scan(root)
  for (const { file, original } of plans) {
    // Recheck every planned destination before the first write.
    assertUnlinked(file); inside(file)
    if (!fs.lstatSync(file).isFile() || !fs.readFileSync(file).equals(original))
      throw new Error('微信scope产物在校验期间发生变化')
  }
  let bytes = 0
  for (const { file, original, next } of plans) {
    fs.writeFileSync(file, next, 'utf8')
    bytes += original.length - Buffer.byteLength(next, 'utf8')
  }
  return { files: plans.length, ids: owners.size, bytes }
}

export function weixinScopeIds(platform = process.env.UNI_PLATFORM) {
  let output
  return {
    name: 'campus-weixin-scope-ids', apply: 'build', enforce: 'post',
    configResolved(config) {
      if (platform === 'mp-weixin') output = path.resolve(config.root, config.build.outDir)
    },
    closeBundle: {
      order: 'post', sequential: true,
      handler() { if (output) return compactWeixinScopeIds(output) }
    }
  }
}
