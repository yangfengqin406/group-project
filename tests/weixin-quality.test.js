import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { inspectWeixinQuality } from '../scripts/check-weixin-quality.mjs'

const cli = fileURLToPath(new URL('../scripts/check-weixin-quality.mjs', import.meta.url))
const privateFiles = ['services/landlord.js', 'services/game-transport.js', 'utils/game-session.js']
function fixture(t) {
  const tempRoot = fs.realpathSync(os.tmpdir())
  const directory = fs.mkdtempSync(path.join(tempRoot, 'weixin-quality-'))
  t.after(() => {
    const target = fs.realpathSync(directory)
    assert.equal(path.dirname(target), tempRoot)
    assert.ok(path.basename(target).startsWith('weixin-quality-'))
    fs.rmSync(target, { recursive: true, force: true })
  })
  write(directory, 'app.json', JSON.stringify({ lazyCodeLoading: 'requiredComponents' }))
  for (const file of [...privateFiles.map((name) => `rooms/${name}`), 'rooms/landlord/index.js'])
    write(directory, file, '"use strict";')
  return directory
}
function write(directory, file, content) {
  const target = path.join(directory, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

test('微信定向质量检查接受按需注入与分包内私有JS，并说明扫描范围', (t) => {
  const directory = fixture(t)
  const report = inspectWeixinQuality(directory)
  assert.equal(report.ok, true)
  assert.deepEqual(report.issues, [])
  const result = spawnSync(process.execPath, [cli, directory], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /不等同微信完整代码质量扫描/)
})

test('微信截图中的未按需注入及遗留主包JS使检查和CLI失败', (t) => {
  const directory = fixture(t)
  write(directory, 'app.json', '{}')
  for (const file of privateFiles) write(directory, file, '// old main-package output')
  const report = inspectWeixinQuality(directory)
  assert.equal(report.ok, false)
  assert.equal(report.issues.length, 4)
  assert.match(report.issues.join('\n'), /requiredComponents/)
  const result = spawnSync(process.execPath, [cli, directory], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  for (const file of privateFiles) assert.ok(result.stderr.includes(file))
})

test('仅删除主包JS但漏打包服务或牌桌页面不能通过', (t) => {
  const directory = fixture(t)
  for (const file of [...privateFiles.map((name) => `rooms/${name}`), 'rooms/landlord/index.js'])
    fs.unlinkSync(path.join(directory, file))
  const report = inspectWeixinQuality(directory)
  assert.equal(report.ok, false)
  assert.equal(report.issues.length, 4)
  assert.match(report.issues.join('\n'), /斗地主页面/)
})

test('微信检查拒绝无app.json或损坏JSON的目录', (t) => {
  const directory = fixture(t)
  fs.unlinkSync(path.join(directory, 'app.json'))
  assert.equal(inspectWeixinQuality(directory).ok, false)
  write(directory, 'app.json', '{broken')
  assert.match(inspectWeixinQuality(directory).issues[0], /有效 app.json/)
  write(directory, 'app.json', 'null')
  assert.match(inspectWeixinQuality(directory).issues[0], /配置对象/)
})
