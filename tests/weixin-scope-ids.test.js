import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compactWeixinScopeIds, weixinScopeIds } from '../scripts/weixin-scope-ids.mjs'

function fixture(t, files = {}) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'weixin-scope-'))
  t.after(() => {
    const resolved = fs.realpathSync(root)
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('weixin-scope-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  })
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, contents)
  }
  return root
}

test('微信scope跨JS/WXML/WXSS/JSON统一缩短，保留后缀和所有非标记字节', t => {
  const files = {
    'components/pet.js': '\uFEFFconst x = ["__scopeId", "data-v-123abcde"]; // 中文\r\n',
    'components/pet.wxml': '<view class="data-v-123abcde data-v-fedcba98-s">伙伴</view>\r\n',
    'components/pet.wxss': '.pet.data-v-123abcde,.slot.data-v-fedcba98-s{color:red}\n',
    'app.json': '{"scope":"data-v-123abcde","other":"保留"}\n',
    'static/art.webp': Buffer.from([0, 255, 123, 64])
  }
  const root = fixture(t, files), result = compactWeixinScopeIds(root)
  assert.deepEqual(result, { files: 4, ids: 2, bytes: 12 })
  for (const [relative, original] of Object.entries(files)) {
    const expected = typeof original === 'string'
      ? Buffer.from(original.replaceAll('data-v-123abcde', 'data-v-123abc').replaceAll('data-v-fedcba98', 'data-v-fedcba'))
      : original
    assert.deepEqual(fs.readFileSync(path.join(root, relative)), expected, relative)
  }
  assert.deepEqual(compactWeixinScopeIds(root), { files: 0, ids: 2, bytes: 0 })
})

test('六位前缀碰撞先失败，所有原文件保持逐字节不变', t => {
  const files = { 'a.js': '"data-v-123abcde"', 'nested/z.wxss': '.data-v-123abcff{}' }
  const root = fixture(t, files)
  assert.throws(() => compactWeixinScopeIds(root), /碰撞/)
  for (const [relative, original] of Object.entries(files))
    assert.equal(fs.readFileSync(path.join(root, relative), 'utf8'), original)
})

test('已缩短标记与八位标记冲突也不能混写', t => {
  const root = fixture(t, { 'a.js': '"data-v-123abcde"', 'b.wxml': 'class="data-v-123abc"' })
  assert.throws(() => compactWeixinScopeIds(root), /碰撞/)
  assert.equal(fs.readFileSync(path.join(root, 'a.js'), 'utf8'), '"data-v-123abcde"')
})

test('未知标记、未覆盖扩展名或损坏UTF-8均在任何写入前失败', t => {
  for (const [file, bad, pattern] of [
    ['z.wxss', '.data-v-123abcd{}', /未覆盖/],
    ['z.js', '"data-v-ABCDEF12"', /未覆盖/],
    ['z.wxs', '"data-v-123abcde"', /未支持/],
    ['z.js', Buffer.concat([Buffer.from('"data-v-123abcde"'), Buffer.from([255])]), /UTF-8/]
  ]) {
    const root = fixture(t, { 'a.js': '"data-v-fedcba98"', [file]: bad })
    assert.throws(() => compactWeixinScopeIds(root), pattern)
    assert.equal(fs.readFileSync(path.join(root, 'a.js'), 'utf8'), '"data-v-fedcba98"')
  }
})

test('仅微信构建末尾顺序执行，H5/App及其他小程序保持完整', t => {
  for (const platform of ['h5', 'app-plus', 'mp-alipay', 'mp-weixin']) {
    const root = fixture(t, { 'a.js': '"data-v-123abcde"' }), plugin = weixinScopeIds(platform)
    assert.equal(plugin.apply, 'build'); assert.equal(plugin.enforce, 'post')
    assert.equal(plugin.closeBundle.order, 'post'); assert.equal(plugin.closeBundle.sequential, true)
    plugin.configResolved({ root, build: { outDir: '.' } }); plugin.closeBundle.handler()
    assert.equal(fs.readFileSync(path.join(root, 'a.js'), 'utf8'),
      platform === 'mp-weixin' ? '"data-v-123abc"' : '"data-v-123abcde"')
  }
})

test('拒绝外部目录链接，不跟随也不改包内外文件', t => {
  const outside = fixture(t, { 'outside.js': '"data-v-123abcde"' })
  const root = fixture(t, { 'a.js': '"data-v-fedcba98"' }), link = path.join(root, 'z-link')
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => compactWeixinScopeIds(root), /符号链接/)
  assert.throws(() => compactWeixinScopeIds(link), /符号链接/)
  assert.equal(fs.readFileSync(path.join(root, 'a.js'), 'utf8'), '"data-v-fedcba98"')
  assert.equal(fs.readFileSync(path.join(outside, 'outside.js'), 'utf8'), '"data-v-123abcde"')
})

test('输出目录经过链接时拒绝，即使目录本身不是链接', t => {
  const outside = fixture(t, { 'child/a.js': '"data-v-123abcde"' }), root = fixture(t)
  const link = path.join(root, 'external')
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => compactWeixinScopeIds(path.join(link, 'child')), /符号链接/)
  assert.equal(fs.readFileSync(path.join(outside, 'child/a.js'), 'utf8'), '"data-v-123abcde"')
})
