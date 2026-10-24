import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { speciesOptions, featuresFor } from '../src/utils/pet-appearance.js'
import { petIllustration } from '../src/utils/pet-illustrations.js'
import { tailoredOutfit } from '../src/utils/tailored-outfits.js'
import { fittedWearable } from '../src/utils/fitted-wearables.js'
import { wearableArt } from '../src/utils/wearable-art.js'
import { WARDROBE_ITEMS } from '../src/utils/wardrobe-catalog.js'

const src = fileURLToPath(new URL('../src', import.meta.url))
const staticRoot = fs.realpathSync(path.join(src, 'static'))
const views = ['front', 'back']
const images = new Map()
let references = 0

// Read standard WebP canvas headers without adding an image-library dependency.
function webpDimensions(data, label) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF', label)
  assert.equal(data.toString('ascii', 8, 12), 'WEBP', label)
  assert.equal(data.readUInt32LE(4) + 8, data.length, `${label}: RIFF 文件长度`)
  let dimensions
  for (let offset = 12; offset < data.length;) {
    assert(offset + 8 <= data.length, `${label}: 完整的块头`)
    const kind = data.toString('ascii', offset, offset + 4)
    const length = data.readUInt32LE(offset + 4)
    const body = offset + 8
    assert(body + length <= data.length, `${label}: 完整的 ${kind} 数据块`)
    if (kind === 'VP8X') {
      assert(length >= 10, label)
      dimensions = { width: data.readUIntLE(body + 4, 3) + 1, height: data.readUIntLE(body + 7, 3) + 1 }
    } else if (kind === 'VP8 ' && !dimensions) {
      assert(length >= 10, label)
      assert.equal(data.toString('hex', body + 3, body + 6), '9d012a', label)
      dimensions = { width: data.readUInt16LE(body + 6) & 0x3fff, height: data.readUInt16LE(body + 8) & 0x3fff }
    } else if (kind === 'VP8L' && !dimensions) {
      assert(length >= 5, label)
      assert.equal(data[body], 0x2f, label)
      const bits = data.readUInt32LE(body + 1)
      dimensions = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    offset = body + length + (length % 2)
    assert(offset <= data.length, `${label}: 数据块填充完整`)
  }
  assert(dimensions?.width > 0 && dimensions?.height > 0, `${label}: 可读取有效宽高`)
  return dimensions
}

function image(source, { tabPng = false } = {}) {
  references++
  assert.equal(typeof source, 'string')
  assert(source.startsWith('/static/'), `必须引用静态目录：${source}`)
  const filename = path.resolve(src, source.slice(1))
  assert(filename.startsWith(`${staticRoot}${path.sep}`), `不能越过静态目录：${source}`)
  assert(fs.existsSync(filename), `素材路径失效：${source}`)
  assert(fs.realpathSync(filename).startsWith(`${staticRoot}${path.sep}`), `不能链接到静态目录外：${source}`)
  assert(fs.statSync(filename).isFile(), `应引用文件：${source}`)
  const expected = tabPng ? '.png' : '.webp'
  assert.equal(path.extname(filename), expected, `编码与动态引用后缀一致：${source}`)
  if (!images.has(source)) {
    const data = fs.readFileSync(filename)
    assert(data.length >= 12, `素材不能为空：${source}`)
    if (tabPng) {
      assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', source)
      assert(data.length >= 24, source)
      images.set(source, { width: data.readUInt32BE(16), height: data.readUInt32BE(20) })
    } else images.set(source, webpDimensions(data, source))
  }
  const dimensions = images.get(source)
  assert(dimensions.width > 0 && dimensions.height > 0, source)
  return dimensions
}

function frame(art, label) {
  assert(art, `应有图集帧：${label}`)
  const dimensions = image(art.source)
  assert(Number.isInteger(art.columns) && art.columns > 0, label)
  assert(Number.isInteger(art.rows) && art.rows > 0, label)
  assert.equal(dimensions.width % art.columns, 0, `${label}: 图集宽度可按列分帧`)
  assert.equal(dimensions.height % art.rows, 0, `${label}: 图集高度可按行分帧`)
  assert(art.column >= 0 && art.column < art.columns, label)
  assert(art.row >= 0 && art.row < art.rows, label)
}

function eachPet(visit) {
  for (const { id: species } of speciesOptions)
    for (const { id: feature } of featuresFor(species))
      for (const view of views) visit(species, feature, view)
}

test('静态素材：四种宠物每种耳型与正背图集均能读取并正确分帧', () => {
  eachPet((species, feature, view) => frame(petIllustration(species, feature, view), `${species}/${feature}/${view}`))
})

test('静态素材：三种衣服的躯干、头部、尾巴和毛层动态引用全部存在', () => {
  const outfits = WARDROBE_ITEMS.filter((item) => item.slot === 'outfit')
  eachPet((species, feature, view) => {
    for (const item of outfits) {
      const label = `${species}/${feature}/${item.id}/${view}`
      const art = tailoredOutfit(species, feature, item.id, view)
      assert(art, label)
      image(art.source)
      frame(art.headArt, label)
      if (art.tailArt) frame(art.tailArt, label)
      if (art.furSource) image(art.furSource)
    }
  })
})

test('静态素材：三种发型和三种鞋子的所有物种、耳型及正背裁片可读取', () => {
  const items = WARDROBE_ITEMS.filter((item) => ['hair', 'feet'].includes(item.slot))
  eachPet((species, feature, view) => {
    for (const item of items) {
      const label = `${species}/${feature}/${item.id}/${view}`
      const art = fittedWearable(species, feature, item.id, view)
      assert(art?.parts?.length, label)
      for (const part of art.parts) image(part.source)
    }
  })
})

test('静态素材：完整衣柜及旧配饰、原创宠物使用的通用素材尺寸与登记一致', () => {
  const ids = [...WARDROBE_ITEMS.map((item) => item.id), 'legacy-scarf', 'legacy-flower', 'legacy-satchel']
  for (const id of ids) for (const view of views) {
    const art = wearableArt(id, view)
    assert(art, `${id}/${view}`)
    const dimensions = image(art.source)
    assert.equal(dimensions.width, art.width, `${id}/${view}: 宽度登记`)
    assert.equal(dimensions.height, art.height, `${id}/${view}: 高度登记`)
  }
})

test('静态素材：Vue 中字面量引用存在，保留底栏 PNG 的原格式', () => {
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'static') walk(filename); continue }
      if (!entry.isFile() || !filename.endsWith('.vue')) continue
      const code = fs.readFileSync(filename, 'utf8')
      for (const match of code.matchAll(/(['"])(\/static\/[^'"\r\n<>]+)\1/g)) {
        if (match[2].includes('${')) continue
        image(match[2], { tabPng: match[2].startsWith('/static/tabs/') })
      }
    }
  }
  walk(src)
})

after(() => console.log(`静态素材完整性：解析 ${references} 个引用，检查 ${images.size} 个独立文件；不涉及用户导入 PNG。`))
