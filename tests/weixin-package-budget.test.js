import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { inspectWeixinPackage, WEIXIN_RAW_BUDGET_BYTES as budget } from '../scripts/check-weixin-package.mjs'

const cliFile = fileURLToPath(new URL('../scripts/check-weixin-package.mjs', import.meta.url))
function fixture(t, manifest = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-budget-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.writeFileSync(path.join(directory, 'app.json'), JSON.stringify(manifest))
  return directory
}
function write(directory, filename, bytes) {
  const target = path.join(directory, filename)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, Buffer.alloc(bytes))
}
const cli = (directory) => spawnSync(process.execPath, [cliFile, directory], { encoding: 'utf8' })

test('微信原始包体门禁：缺少构建或 app.json 时 CLI 失败', (t) => {
  const directory = fixture(t)
  fs.unlinkSync(path.join(directory, 'app.json'))
  assert.throws(() => inspectWeixinPackage(directory), /缺少微信构建 app.json/)
  const result = cli(directory)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /请先完成构建/)
  assert.match(result.stdout, /不代表微信开发者工具/)
  assert.throws(() => inspectWeixinPackage(path.join(directory, 'missing')), /缺少微信构建 app.json/)
})

test('微信原始包体门禁：主包超过 2 MiB 返回实际字节且 CLI 失败', (t) => {
  const directory = fixture(t)
  write(directory, 'static/large.webp', budget)
  const report = inspectWeixinPackage(directory)
  assert.equal(report.main.bytes, budget + 2)
  assert.equal(report.ok, false)
  assert.equal(report.main.withinBudget, false)
  const result = cli(directory)
  assert.equal(result.status, 1)
  assert.match(result.stdout, new RegExp(`${budget + 2} 原始字节`))
  assert.match(result.stdout, /超出预算/)
})

test('微信原始包体门禁：声明分包素材独立统计，不能与相似前缀目录混淆', (t) => {
  const directory = fixture(t, { subPackages: [{ root: 'pets' }] })
  write(directory, 'pets/static/avatar.webp', budget - 100)
  write(directory, 'pets-more/extra.js', 120)
  write(directory, 'app.js', 30)
  const report = inspectWeixinPackage(directory)
  const manifestBytes = fs.statSync(path.join(directory, 'app.json')).size
  assert.equal(report.main.bytes, manifestBytes + 150)
  assert.equal(report.subpackages[0].bytes, budget - 100)
  assert.equal(report.totalBytes, manifestBytes + 150 + budget - 100)
  assert.equal(report.ok, true)
})

test('微信原始包体门禁：小写 subpackages 也生效且分包超预算失败', (t) => {
  const directory = fixture(t, { subpackages: [{ root: 'extra/' }] })
  write(directory, 'extra/game.js', budget + 1)
  const report = inspectWeixinPackage(directory)
  assert.equal(report.main.withinBudget, true)
  assert.equal(report.subpackages[0].root, 'extra')
  assert.equal(report.subpackages[0].bytes, budget + 1)
  assert.equal(report.subpackages[0].withinBudget, false)
  assert.equal(report.ok, false)
  assert.equal(cli(directory).status, 1)
})

test('微信原始包体门禁：主包与分包恰好等于预算可通过，多 1 字节即失败', (t) => {
  const directory = fixture(t, { subPackages: [{ root: 'extra' }] })
  const manifestBytes = fs.statSync(path.join(directory, 'app.json')).size
  write(directory, 'app.js', budget - manifestBytes)
  write(directory, 'extra/game.js', budget)
  const exact = inspectWeixinPackage(directory)
  assert.equal(exact.main.bytes, budget)
  assert.equal(exact.subpackages[0].bytes, budget)
  assert.equal(exact.ok, true)
  assert.equal(cli(directory).status, 0)
  fs.appendFileSync(path.join(directory, 'app.js'), 'x')
  assert.equal(inspectWeixinPackage(directory).ok, false)
})

test('微信原始包体门禁：重复、嵌套、逃逸和缺失分包目录不静默漏算', (t) => {
  for (const roots of [['same', 'same/'], ['game', 'game/sub'], ['../escape'], ['/absolute'], ['C:/escape'], ['missing']]) {
    const directory = fixture(t, { subPackages: roots.map((root) => ({ root })) })
    assert.throws(() => inspectWeixinPackage(directory), /root|分包目录不存在/)
  }
})

test('微信原始包体门禁：损坏清单或错误的分包声明明确失败', (t) => {
  const directory = fixture(t, { subPackages: {} })
  assert.throws(() => inspectWeixinPackage(directory), /必须是数组/)
  fs.writeFileSync(path.join(directory, 'app.json'), '{')
  assert.throws(() => inspectWeixinPackage(directory), SyntaxError)
  assert.equal(cli(directory).status, 1)
})
