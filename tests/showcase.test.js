import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { prepareShowcase } from '../scripts/prepare-showcase.mjs'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'

test('展示初始化是真实独立账号、图片及玩法进度，重启不重置用户修改', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'campus-showcase-'))
  t.after(()=>{const target=fs.realpathSync(root);assert.equal(path.dirname(target),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(target).startsWith('campus-showcase-'));fs.rmSync(target,{recursive:true,force:true})})
  const dataDir=path.join(root,'data'),origin='http://127.0.0.1:8791'
  const options={dataDir,origin,assetPath:path.resolve('docs/assets/app-avatar-2026-10-25/app-avatar-v1.png')}
  const seeded=prepareShowcase(options)
  assert.equal(seeded.fictionalData,true);assert.equal(seeded.users.length,3)
  const credentials=JSON.parse(fs.readFileSync(path.join(dataDir,'credentials.json'),'utf8'))
  const store=openCStore(path.join(dataDir,'campus.sqlite'))
  try{
    const service=createCampusService({store,uploadsDir:path.join(dataDir,'uploads'),uploadOrigin:origin,trustedUploadOrigins:[origin]})
    const a=service.invoke('auth.login',{...credentials[0],type:'h5'}),b=service.invoke('auth.login',{...credentials[1],type:'h5'})
    const wardrobe=service.invoke('wardrobe.getState',{}, {userId:a.user.id})
    assert.equal(wardrobe.equipped.outfit,'sailor-shirt');assert.equal(wardrobe.pearls,33)
    assert.deepEqual(service.invoke('wardrobe.getState',{}, {userId:b.user.id}).owned,[])
    service.invoke('wardrobe.equip',{slot:'outfit',itemId:null},{userId:a.user.id})
  }finally{store.close()}
  assert.deepEqual(prepareShowcase(options),seeded)
  const reopened=openCStore(path.join(dataDir,'campus.sqlite'))
  try{
    const service=createCampusService({store:reopened,uploadsDir:path.join(dataDir,'uploads'),uploadOrigin:origin,trustedUploadOrigins:[origin]})
    assert.equal(service.invoke('wardrobe.getState',{}, {userId:seeded.users[0].id}).equipped.outfit,null)
  }finally{reopened.close()}
  assert.throws(()=>prepareShowcase({...options,origin:'http://127.0.0.1:8792'}),/地址已改变/)
  const occupied=path.join(root,'occupied');fs.mkdirSync(occupied);fs.writeFileSync(path.join(occupied,'keep.txt'),'keep')
  assert.throws(()=>prepareShowcase({...options,dataDir:occupied}),/不会覆盖/)
  assert.equal(fs.readFileSync(path.join(occupied,'keep.txt'),'utf8'),'keep')
  assert.throws(()=>prepareShowcase({...options,dataDir:path.join(root,'.local-campus')}),/真实用户目录/)
})
