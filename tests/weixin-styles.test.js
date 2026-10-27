import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { findWxssSelectorIssues, inspectWeixinStyles } from '../scripts/check-weixin-styles.mjs'

const cli = fileURLToPath(new URL('../scripts/check-weixin-styles.mjs', import.meta.url))
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wxss-compat-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.writeFileSync(path.join(directory, 'app.json'), '{}')
  return directory
}

test('WXSS兼容检查重现微信截图中的压缩后 scoped 通配选择器', () => {
  const issues = findWxssSelectorIssues('@media (prefers-reduced-motion: reduce){.dive-water *.data-v-45e977f8{animation:none!important}}')
  assert.equal(issues.length, 1)
  assert.equal(issues[0].selector, '.dive-water *.data-v-45e977f8')
  assert.equal(issues[0].line, 1)
})

test('WXSS兼容检查不把内容字符串、属性操作符、转义类名或注释误判为通配', () => {
  const css = `/* .old * {} */ .label::after{content:"*;{}";background:url("data:image/svg+xml,{*}")}
    [data-value*="*"] .literal\\*name { color: red } @keyframes bob { 50% { opacity: .5 } }`
  assert.deepEqual(findWxssSelectorIssues(css), [])
})

test('WXSS兼容检查覆盖逗号、子选择器和伪类内的通配并保留位置', () => {
  const issues = findWxssSelectorIssues('.a,*::before{color:red}\n.b > *{color:blue}\n.c:is(*){color:green}')
  assert.equal(issues.length, 3)
  assert.deepEqual(issues.map((entry) => entry.line), [1, 2, 3])
})

test('WXSS构建目录检查包含组件及分包，坏产物使CLI失败', (t) => {
  const directory = fixture(t)
  fs.mkdirSync(path.join(directory, 'components'), { recursive: true })
  fs.mkdirSync(path.join(directory, 'rooms'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'components/dive.wxss'), '.water *{animation:none}')
  fs.writeFileSync(path.join(directory, 'rooms/table.wxss'), '.table{display:flex}')
  const report = inspectWeixinStyles(directory)
  assert.equal(report.files, 2); assert.equal(report.ok, false)
  assert.equal(report.issues[0].file, 'components/dive.wxss')
  const result = spawnSync(process.execPath, [cli, directory], { encoding: 'utf8' })
  assert.equal(result.status, 1); assert.match(result.stderr, /components\/dive\.wxss/)
  fs.writeFileSync(path.join(directory, 'components/dive.wxss'), '@media(prefers-reduced-motion:reduce){.player,.bubble{animation:none!important}}')
  assert.equal(inspectWeixinStyles(directory).ok, true)
  assert.equal(spawnSync(process.execPath, [cli, directory]).status, 0)
})

test('WXSS检查在缺失构建或没有样式时明确失败', (t) => {
  const directory = fixture(t)
  assert.throws(() => inspectWeixinStyles(directory), /未找到 WXSS/)
  fs.unlinkSync(path.join(directory, 'app.json'))
  assert.throws(() => inspectWeixinStyles(directory), /缺少微信构建 app.json/)
})

test('组件样式检查拒绝标签、ID、属性选择器，但不误报类名、nth公式或关键帧',()=>{
  const issues=findWxssSelectorIssues('.slot-row button{color:red}\n#old{color:red}\n.wx-b[disabled]{opacity:.5}',{component:true})
  assert.deepEqual(issues.map(x=>x.kind),['tag','id','attribute'])
  assert.deepEqual(findWxssSelectorIssues('.wx-b.wx-disabled::after{border:0}.wx-v:nth-child(2n+1){opacity:1}@keyframes bob{from{opacity:0}to{opacity:1}}',{component:true}),[])
  assert.deepEqual(findWxssSelectorIssues('.literal\\#name{color:red} .literal\\[name{color:red}',{component:true}),[])
})
test('按编译JSON的component标记检查，页面允许的标签样式不作为组件告警',t=>{
  const directory=fixture(t)
  fs.writeFileSync(path.join(directory,'page.wxss'),'button{color:red}')
  fs.writeFileSync(path.join(directory,'panel.wxss'),'button{color:red}')
  fs.writeFileSync(path.join(directory,'panel.json'),'{"component":true}')
  const report=inspectWeixinStyles(directory)
  assert.equal(report.issues.length,1);assert.equal(report.issues[0].file,'panel.wxss')
})
