import test from 'node:test'
import assert from 'node:assert/strict'
import { rollup } from 'rollup'
import { weixinRoomChunks } from '../scripts/weixin-room-chunks.mjs'

test('微信牌桌私有chunk重定位保留uni页面和组件的原文件名函数', () => {
  const original = (chunk) => `uni-components/${chunk.name}.js`
  const options = weixinRoomChunks('mp-weixin').outputOptions({ chunkFileNames: original, format: 'cjs' })
  assert.equal(options.format, 'cjs')
  assert.equal(options.chunkFileNames({ name: 'services/landlord' }), 'rooms/services/landlord.js')
  assert.equal(options.chunkFileNames({ name: 'services/game-transport' }), 'rooms/services/game-transport.js')
  assert.equal(options.chunkFileNames({ name: 'utils/game-session' }), 'rooms/utils/game-session.js')
  assert.equal(options.chunkFileNames({ name: 'components/pet/PetAvatar' }), 'uni-components/components/pet/PetAvatar.js')
})

test('非微信构建不修改输出配置，微信保留已有字符串输出规则', () => {
  const input = { chunkFileNames: 'chunks/[name]-[hash].js' }
  assert.equal(weixinRoomChunks('h5').outputOptions(input), undefined)
  assert.equal(weixinRoomChunks('mp-alipay').outputOptions(input), undefined)
  assert.equal(weixinRoomChunks('mp-weixin').outputOptions(input).chunkFileNames({ name: 'shared' }), input.chunkFileNames)
})

async function generateFixture(mainImportsRoom = false) {
  const modules = {
    plaza: `import { origin } from 'config/index'; ${mainImportsRoom ? "import { lobby } from 'services/landlord';" : ''} console.log(origin${mainImportsRoom ? ', lobby()' : ''});`,
    table: "import { lobby } from 'services/landlord'; console.log(lobby());",
    'services/landlord': "import { request } from 'services/game-transport'; import { session } from 'utils/game-session'; export function lobby() { return request(session); }",
    'services/game-transport': "import { origin } from 'config/index'; export function request(session) { return origin + session; }",
    'utils/game-session': "export const session = 'visitor';",
    'config/index': "export const origin = 'http://127.0.0.1/game/';"
  }
  const build = await rollup({
    input: { 'pages/plaza/index': 'plaza', 'rooms/landlord/index': 'table' },
    plugins: [{
      name: 'fixture-modules',
      resolveId: (name) => name in modules ? name : null,
      load: (name) => modules[name]
    }, weixinRoomChunks('mp-weixin')]
  })
  try {
    return await build.generate({
      format: 'cjs', entryFileNames: '[name].js', chunkFileNames: (chunk) => `${chunk.name}.js`,
      manualChunks: (id) => id in modules && !['plaza', 'table'].includes(id) ? id : undefined
    })
  } finally { await build.close() }
}

test('实际Rollup图把牌桌私有JS放入rooms并重写require，共享配置保留主包', async () => {
  const { output } = await generateFixture()
  const chunks = new Map(output.map((chunk) => [chunk.fileName, chunk]))
  for (const name of ['services/landlord', 'services/game-transport', 'utils/game-session']) {
    assert.equal(chunks.has(`${name}.js`), false)
    assert.equal(chunks.has(`rooms/${name}.js`), true)
  }
  assert.equal(chunks.has('config/index.js'), true)
  assert.match(chunks.get('rooms/landlord/index.js').code, /require\(['"]\.\.\/services\/landlord\.js['"]\)/)
  assert.match(chunks.get('rooms/services/game-transport.js').code, /require\(['"]\.\.\/\.\.\/config\/index\.js['"]\)/)
  assert.equal(chunks.get('pages/plaza/index.js').imports.some((name) => name.startsWith('rooms/')), false)
  for (const chunk of chunks.values())
    for (const imported of chunk.imports) assert.ok(chunks.has(imported), `${chunk.fileName} 引用缺失 ${imported}`)
})

test('未来主包误用牌桌私有服务时构建明确失败，避免生成非法跨分包require', async () => {
  await assert.rejects(generateFixture(true), /牌桌专用代码.*跨分包引用/)
})
