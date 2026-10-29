import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { UNUSED_WEIXIN_FRAMES, weixinStaticAssets } from '../scripts/weixin-static-assets.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-unused-'))
  t.after(() => {
    const resolved = fs.realpathSync(root)
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('weixin-unused-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  })
  for (const file of [...UNUSED_WEIXIN_FRAMES, 'static/pets/wearables/pearl-badge-front.webp', 'static/pets/wearables/leaf-backpack-back.webp']) {
    const target = path.join(root, file)
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, file)
  }
  return root
}
test('微信复制结束后仅去掉不渲染的挂饰背面，正面和旧背包回退保留，重复执行安全', t => {
  const root = fixture(t), plugin = weixinStaticAssets('mp-weixin')
  plugin.configResolved({ root, build: { outDir: '.' } })
  plugin.closeBundle(); plugin.closeBundle()
  for (const file of UNUSED_WEIXIN_FRAMES) assert.equal(fs.existsSync(path.join(root, file)), false)
  for (const file of ['pearl-badge-front.webp', 'leaf-backpack-back.webp']) assert.ok(fs.existsSync(path.join(root, 'static/pets/wearables', file)))
})
test('H5和App编译保留完整素材，不因微信预算裁剪其他端', t => {
  for (const platform of ['h5', 'app-plus']) {
    const root = fixture(t), plugin = weixinStaticAssets(platform)
    plugin.configResolved({ root, build: { outDir: '.' } }); plugin.closeBundle()
    for (const file of UNUSED_WEIXIN_FRAMES) assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), file)
  }
})
