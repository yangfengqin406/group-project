import fs from 'node:fs'
import path from 'node:path'

// Charms are rendered only in front view (WardrobeLayers). Keep the source
// artwork and all H5/App assets; exclude only these unused WeChat copies.
export const UNUSED_WEIXIN_FRAMES = Object.freeze(['bubble-star', 'pearl-badge', 'clover-pin', 'glow-jelly']
  .map(id => `static/pets/wearables/${id}-back.webp`))

export function pruneWeixinStaticAssets(directory) {
  const root = path.resolve(directory)
  let bytes = 0, files = 0
  for (const relative of UNUSED_WEIXIN_FRAMES) {
    const target = path.resolve(root, relative)
    if (!target.startsWith(root + path.sep)) throw new Error('微信素材路径超出编译目录')
    // A linked directory could resolve outside the output tree. Never unlink
    // through it, even though the relative paths here are internal constants.
    if (!fs.existsSync(target)) continue
    const realRoot = fs.realpathSync(root), realTarget = fs.realpathSync(target)
    if (!realTarget.startsWith(realRoot + path.sep) || fs.lstatSync(target).isSymbolicLink())
      throw new Error('微信编译素材不能是外部链接')
    const stat = fs.lstatSync(target)
    if (!stat.isFile()) throw new Error('微信编译素材必须是普通文件')
    fs.unlinkSync(target); bytes += stat.size; files++
  }
  return { files, bytes }
}

export function weixinStaticAssets(platform = process.env.UNI_PLATFORM) {
  let output
  return {
    name: 'campus-weixin-unused-static', apply: 'build', enforce: 'post',
    configResolved(config) { output = path.resolve(config.root, config.build.outDir) },
    closeBundle() {
      if (platform === 'mp-weixin' && output) pruneWeixinStaticAssets(output)
    }
  }
}
