import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'
import { createDiveGame } from '../src/utils/dive-game.js'

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-leisure-'))
  let store, service, now = Date.now()
  const reopen = () => {
    store?.close(); store = openCStore(path.join(directory, 'data.sqlite'))
    service = createCampusService({ store, uploadsDir: path.join(directory, 'files'), uploadOrigin: 'http://127.0.0.1',
      leisureOptions: { now: () => now, random: () => 0.1 } })
  }
  reopen()
  const a = service.invoke('auth.register', { studentId: 'leisure-a', password: 'A-strong-password-1', nickname: '测试甲' })
  const b = service.invoke('auth.register', { studentId: 'leisure-b', password: 'B-strong-password-2', nickname: '测试乙' })
  t.after(() => {
    store.close()
    const target=fs.realpathSync(directory), root=fs.realpathSync(os.tmpdir())
    assert.equal(path.dirname(target), root); assert.ok(path.basename(target).startsWith('campus-leisure-'))
    fs.rmSync(target, { recursive: true, force: true })
  })
  return { a, b, reopen, advance: value => { now += value },
    setNow: value => { now = value },
    call: (method, params = {}, user = a.user.id) => service.invoke(method, params, { userId: user }),
    get store() { return store } }
}

function clearProof(run) {
  const game=createDiveGame(1,{seed:run.seed}), trace=[]
  let previous=''
  for(const [x,y] of [[22,54],[22,60],[49,60],[49,42],[76,42],[76,21],[91,12]])
    for(let guard=0;guard<500;guard++) {
      const state=game.getState()
      if(state.status!=='playing') return {runId:run.id,ticks:state.tick,trace}
      if(Math.hypot(x-state.player.x,y-state.player.y)<0.8) break
      const input={dx:Math.abs(x-state.player.x)>0.45?Math.sign(x-state.player.x):0,dy:Math.abs(y-state.player.y)>0.45?Math.sign(y-state.player.y):0,fire:true}
      const key=JSON.stringify(input)
      if(key!==previous){trace.push({tick:state.tick,...input});previous=key}
      game.setInput(input);game.step()
    }
  throw new Error('Proof fixture did not reach exit')
}

test('真实钓鱼与衣柜在同一事务持久化，跨账号/重启隔离，重复收线不增奖', t => {
  const f=fixture(t), cast=f.call('fishing.cast')
  f.setNow(cast.biteAt)
  const hook=f.call('fishing.hook',{castId:cast.id})
  f.setNow(hook.cast.meterStartAt+400)
  const caught=f.call('fishing.land',{castId:cast.id})
  assert.equal(caught.status,'caught'); assert.equal(caught.reward.id,'lily-pad')
  assert.throws(()=>f.call('fishing.land',{castId:cast.id}),{code:'CONFLICT'})
  const worn=f.call('wardrobe.equip',{slot:'head',itemId:'lily-pad'})
  assert.equal(worn.equipped.head,'lily-pad');assert.equal(worn.owned.find(x=>x.id==='lily-pad').count,1)
  assert.deepEqual(f.call('wardrobe.getState',{},f.b.user.id).owned,[])
  f.reopen()
  assert.equal(f.call('wardrobe.getState').equipped.head,'lily-pad')
  assert.equal(f.call('fishing.getState').catchCount,1)
  assert.equal(f.call('fishing.getState',{},f.b.user.id).catchCount,0)
})

test('真实潜水服务回放通关，恢复收据且只发一次奖，兑换重试不重复扣款', t => {
  const f=fixture(t), run=f.call('dive.start',{levelId:1}), proof=clearProof(run)
  assert.throws(()=>f.call('dive.finish',proof),{code:'INVALID_ARGUMENT'})
  assert.throws(()=>f.call('dive.finish',proof,f.b.user.id),{code:'CONFLICT'})
  f.advance(proof.ticks*50)
  const completed=f.call('dive.finish',proof)
  assert.equal(completed.status,'cleared');assert.equal(completed.reward.pearls,33)
  assert.throws(()=>f.call('dive.finish',proof),{code:'CONFLICT'})
  const redeemed=f.call('wardrobe.redeem',{itemId:'lily-pad'})
  assert.equal(redeemed.pearls,8)
  assert.equal(f.call('wardrobe.redeem',{itemId:'lily-pad'}).pearls,8)
  f.reopen()
  assert.equal(f.call('dive.getState').lastSettlement.runId,run.id)
  assert.deepEqual(f.call('dive.getState').clearedLevels,[1])
  assert.equal(f.call('wardrobe.getState').pearls,8)
  assert.throws(()=>f.call('wardrobe.equip',{slot:'outfit',itemId:'shell-crown'}),{code:'INVALID_ARGUMENT'})
})

test('真实玩法拒绝伪造身份和奖励，发局失败事务不写入，新局编号不跨用户碰撞', t => {
  const f=fixture(t)
  assert.throws(()=>f.call('wardrobe.getState',{userId:f.b.user.id}),{code:'INVALID_ARGUMENT'})
  assert.throws(()=>f.call('dive.start',{levelId:3}),{code:'FORBIDDEN'})
  assert.equal(f.store.get('campus.leisure',f.a.user.id),null)
  const a=f.call('dive.start',{levelId:1}),b=f.call('dive.start',{levelId:1},f.b.user.id)
  assert.notEqual(a.id,b.id)
  assert.throws(()=>f.call('dive.finish',{runId:a.id,ticks:40,trace:[],reward:999}),{code:'INVALID_ARGUMENT'})
  assert.throws(()=>f.call('fishing.cast',{},'unknown'),{code:'UNAUTHENTICATED'})
})

test('真实原创像素宠物按账号保存，非法图和外链不能保存', t => {
  const f=fixture(t), pixels=Array(1024).fill(null);pixels[0]='#fff9e8'
  const appearance={species:'custom',palette:'cream',feature:'art',accessory:'none',name:'原创伙伴',art:{front:{type:'pixels',pixels},back:null}}
  f.call('pet.save',appearance);f.reopen()
  assert.deepEqual(f.call('pet.get'),appearance)
  assert.equal(f.call('pet.get',{},f.b.user.id).species,'rabbit')
  assert.throws(()=>f.call('pet.save',{...appearance,art:{front:{type:'png',data:'https://evil.example/art.png'},back:null}}),{code:'INVALID_ARGUMENT'})
})
