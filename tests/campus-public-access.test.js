import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { request as httpRequest } from 'node:http'
import { publicAccess } from '../backend/campus/public-access.js'
import { createCampusServer } from '../backend/campus/server.js'

test('公共源严格为HTTPS，主机校验不接受路径/凭据；本机缺省不信任代理', () => {
  const access=publicAccess({publicOrigin:'https://campus.example:443',trustedProxies:['::1','127.0.0.1']},{})
  assert.equal(access.origin,'https://campus.example')
  assert.equal(access.acceptsHost('campus.example'),true)
  assert.equal(access.acceptsHost('campus.example:443'),true)
  for(const host of ['evil.example','campus.example/evil','user@campus.example'])assert.equal(access.acceptsHost(host),false)
  for(const origin of ['http://campus.example','https://campus.example/path','https://user:pass@campus.example','https://campus.example?x=1'])
    assert.throws(()=>publicAccess({publicOrigin:origin},{}),/CAMPUS_PUBLIC_ORIGIN/)
  assert.throws(()=>publicAccess({trustedProxies:['*']},{}),/CAMPUS_TRUSTED_PROXIES/)
  assert.equal(publicAccess({},{}).secureCookie,false)
})

test('只采用可信代理链右侧的真实客户端，伪造左侧/不可信来源不能绕过限流地址', () => {
  const trusted=publicAccess({trustedProxies:['127.0.0.1','::1']},{})
  const request=(remote,forwarded)=>({socket:{remoteAddress:remote},headers:{'x-forwarded-for':forwarded}})
  assert.equal(trusted.clientAddress(request('::ffff:127.0.0.1','203.0.113.99, 198.51.100.2')),'198.51.100.2')
  assert.equal(trusted.clientAddress(request('198.51.100.3','203.0.113.99')),'198.51.100.3')
  assert.equal(trusted.clientAddress(request('127.0.0.1','bad-value')),'127.0.0.1')
  assert.equal(publicAccess({},{}).clientAddress(request('127.0.0.1','198.51.100.2')),'127.0.0.1')
})

async function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'campus-public-'))
  const staticRoot=path.join(directory,'h5');fs.mkdirSync(staticRoot);fs.writeFileSync(path.join(staticRoot,'index.html'),'<!doctype html><title>campus</title>')
  const server=createCampusServer({dataDir:directory,staticRoot,publicOrigin:'https://campus.example',trustedProxies:['127.0.0.1']})
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done)})
  t.after(async()=>{server.closeAllConnections();await new Promise(done=>server.close(done));const target=fs.realpathSync(directory);assert.equal(path.dirname(target),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(target).startsWith('campus-public-'));fs.rmSync(target,{recursive:true,force:true})})
  const origin=`http://127.0.0.1:${server.address().port}`
  // Node fetch does not reliably forward an overridden Host. Use real HTTP
  // frames here to reproduce the headers sent by a reverse proxy.
  const request=(url,options={})=>new Promise((resolve,reject)=>{
    const req=httpRequest(origin+url,{method:options.method||'GET',headers:{Host:'campus.example',Origin:'https://campus.example',...options.headers}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const body=Buffer.concat(chunks).toString();resolve({status:res.statusCode,headers:{get:name=>{const value=res.headers[name.toLowerCase()];return Array.isArray(value)?value.join(', '):value||null}},json:async()=>JSON.parse(body),text:async()=>body})})
    });req.once('error',reject);if(options.body)req.write(options.body);req.end()
  })
  const rpc=(method,params={},token='',headers={})=>request('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{...headers})},body:JSON.stringify({method,params})})
  return {request,rpc,origin}
}

test('HTTPS代理主机不降级跳转，来源/路径正确，登录Cookie含Secure且本机健康可读',async t=>{
  const f=await fixture(t)
  const index=await f.request('/',{redirect:'manual'});assert.equal(index.status,200)
  assert.equal((await fetch(f.origin+'/api/health')).status,200)
  const redirect=await fetch(f.origin+'/',{redirect:'manual'})
  assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'https://campus.example/')
  assert.equal((await f.request('/api/health',{headers:{Origin:'https://evil.example'}})).status,403)
  const register=await f.rpc('auth.register',{studentId:'public-user',password:'Public-test-password-1',nickname:'测试账号'})
  assert.match(register.headers.get('set-cookie'),/; Secure/)
  const identity=await register.json();assert.equal(identity.code,'OK')
  const pet=await f.rpc('pet.get',{},identity.data.token);assert.equal((await pet.json()).code,'OK')
  const logout=await f.rpc('auth.logout',{},identity.data.token);assert.match(logout.headers.get('set-cookie'),/; Secure/)
})

test('可信代理下两个客户端独立计数，超过登录阈值仍拒绝',async t=>{
  const f=await fixture(t)
  for(let i=0;i<25;i++)assert.equal((await(await f.rpc('auth.login',{type:'h5',studentId:'nobody',password:'not-a-real-password'},'',{'X-Forwarded-For':'198.51.100.11'})).json()).code,'UNAUTHENTICATED')
  assert.equal((await(await f.rpc('auth.login',{type:'h5',studentId:'nobody',password:'not-a-real-password'},'',{'X-Forwarded-For':'198.51.100.11'})).json()).code,'RATE_LIMITED')
  assert.equal((await(await f.rpc('auth.login',{type:'h5',studentId:'nobody',password:'not-a-real-password'},'',{'X-Forwarded-For':'198.51.100.12'})).json()).code,'UNAUTHENTICATED')
})

test('HTTPS上传返回公共地址，原创PNG超过64KiB可保存，其他RPC仍限制64KiB',async t=>{
  const f=await fixture(t)
  const identity=await(await f.rpc('auth.register',{studentId:'public-art',password:'Public-art-password-1',nickname:'画稿测试'})).json()
  const token=identity.data.token, png=fs.readFileSync(new URL('../src/static/tabs/plaza.png',import.meta.url))
  const boundary='campus-upload-test', body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.png"\r\nContent-Type: image/png\r\n\r\n`),png,Buffer.from(`\r\n--${boundary}--\r\n`)])
  const image=await(await f.request('/api/upload?usage=avatar',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/form-data; boundary=${boundary}`},body})).json()
  assert.equal(image.code,'OK');assert.ok(image.data.url.startsWith('https://campus.example/api/files/'))
  // Valid ancillary PNG text chunk exercises a genuine large imported image.
  const text=Buffer.concat([Buffer.from('Note\0'),Buffer.alloc(80*1024,97)]),kind=Buffer.from('tEXt')
  let crc=0xffffffff;for(const byte of Buffer.concat([kind,text])){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
  const length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(text.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0)
  const imported=Buffer.concat([png.subarray(0,-12),length,kind,text,checksum,png.subarray(-12)])
  const art={species:'custom',palette:'cream',feature:'art',accessory:'none',name:'真实PNG',art:{front:{type:'png',data:'data:image/png;base64,'+imported.toString('base64')},back:null}}
  assert.ok(Buffer.byteLength(JSON.stringify(art))>64*1024)
  assert.equal((await(await f.rpc('pet.save',art,token)).json()).code,'OK')
  assert.equal((await(await f.rpc('user.getProfile',{unused:'x'.repeat(70*1024)},token)).json()).code,'INVALID_ARGUMENT')
})
