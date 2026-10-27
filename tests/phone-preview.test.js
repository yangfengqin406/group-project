import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {phonePreviewConfig,preparePhonePreview} from '../scripts/build-phone-preview.mjs'

test('手机跨网络预览必须显式HTTPS源，拒绝回环HTTP/凭据/路径',()=>{
  for(const value of [undefined,'http://127.0.0.1:8791','https://user:secret@example.com','https://example.com/api','https://example.com?x=1'])
    assert.throws(()=>phonePreviewConfig({CAMPUS_PHONE_PREVIEW_ORIGIN:value}),/HTTPS源/)
  assert.deepEqual(phonePreviewConfig({CAMPUS_PHONE_PREVIEW_ORIGIN:'https://campus.example'}),{origin:'https://campus.example',assetOrigin:'https://campus.example'})
})
test('手机图片使用HTTPS静态源且WebP可解析，底栏和AppID保留，重复处理不重复改写',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'campus-phone-'))
  t.after(()=>{const target=fs.realpathSync(root);assert.equal(path.dirname(target),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(target).startsWith('campus-phone-'));fs.rmSync(target,{recursive:true,force:true})})
  const app=JSON.stringify({tabBar:{list:[{iconPath:'static/tabs/home.png'}]}})
  fs.writeFileSync(path.join(root,'app.json'),app)
  fs.writeFileSync(path.join(root,'project.config.json'),JSON.stringify({appid:'test-preserve',packOptions:{ignore:[{type:'file',value:'keep'}]}}))
  fs.writeFileSync(path.join(root,'asset.js'),'const sprite="/static/pets/rabbit.webp",external="https://other.example/a",custom="data:image/png;base64,ABC";')
  fs.writeFileSync(path.join(root,'image.wxml'),'<image src="/static/plaza/world.webp"/><image webp="{{true}}" src="/static/a.webp"/>')
  const config={origin:'https://campus.example',assetOrigin:'https://images.example'}
  const report=preparePhonePreview(root,config)
  assert.equal(report.rewritten,3);assert.equal(report.webpImageElements,1)
  assert.equal(fs.readFileSync(path.join(root,'app.json'),'utf8'),app)
  const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'))
  assert.equal(project.appid,'test-preserve');assert.equal(project.packOptions.ignore[0].value,'keep')
  const code=fs.readFileSync(path.join(root,'asset.js'),'utf8');assert.ok(code.includes('"https://images.example/static/pets/rabbit.webp"'));assert.ok(code.includes('https://other.example/a'));assert.ok(code.includes('data:image/png;base64,ABC'))
  assert.equal(preparePhonePreview(root,config).rewritten,0)
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8')).packOptions.include.length,1)
  assert.equal((fs.readFileSync(path.join(root,'image.wxml'),'utf8').match(/webp=/g)||[]).length,2)
})
