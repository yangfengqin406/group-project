import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraFrame, sameWalkerState } from '../src/utils/plaza-render.js'

test('静止玩家快照相同可跳过发布，转身/移动/入屋/目标变化仍会发布',()=>{
  const state={position:{x:.4,y:.5},target:null,moving:false,facing:1,view:'front',entering:null}
  assert.equal(sameWalkerState(state,structuredClone(state)),true)
  for(const patch of [{position:{x:.41,y:.5}},{target:{x:.4,y:.5}},{moving:true},{facing:-1},{view:'back'},{entering:'home'}])
    assert.equal(sameWalkerState(state,{...state,...patch}),false)
})
test('相机平滑到位后有限步内收敛且不再生成新对象，立即跟随和拖动坐标保留',()=>{
  const target={x:-123.4,y:-87.6};let value={x:0,y:0},steps=0
  while(value.x!==target.x||value.y!==target.y){value=cameraFrame(value,target);assert.ok(++steps<100)}
  assert.equal(cameraFrame(value,{...target}),value)
  assert.deepEqual(cameraFrame(value,{x:20,y:30},true),{x:20,y:30})
  assert.deepEqual(cameraFrame({x:0,y:0},{x:-100,y:50}),{x:-20,y:10})
})
