import test from 'node:test'
import assert from 'node:assert/strict'
import { createPreviewAccess } from '../src/platform/phone-preview.js'

test('开发/体验预览共享一次调试准备，完成前所有请求保持等待',async()=>{
  for(const envVersion of ['develop','trial']){
    let calls=0,callbacks,finished=false
    const ensure=createPreviewAccess(()=>({getAccountInfoSync:()=>({miniProgram:{envVersion}}),setEnableDebug:value=>{calls++;callbacks=value}}))
    const a=ensure(),b=ensure();a.then(()=>{finished=true})
    assert.equal(a,b);assert.equal(calls,1);assert.equal(callbacks.enableDebug,true)
    await Promise.resolve();assert.equal(finished,false)
    callbacks.success();await Promise.all([a,b]);assert.equal(finished,true)
    await ensure();assert.equal(calls,1)
  }
})
test('正式版本、未知环境或非微信平台不会自动开启调试',async()=>{
  let calls=0
  for(const envVersion of ['release',undefined,'unknown']){
    await createPreviewAccess(()=>({getAccountInfoSync:()=>({miniProgram:{envVersion}}),setEnableDebug:()=>{calls++}}))()
  }
  await createPreviewAccess(()=>undefined)()
  await createPreviewAccess(()=>({getAccountInfoSync:()=>{throw Error('unavailable')},setEnableDebug:()=>{calls++}}))()
  assert.equal(calls,0)
})
test('微信复用进程但调试状态已关闭时重新准备，仍共享在途请求',async()=>{
  let enabled=false,calls=0,callbacks
  const platform={getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),getAppBaseInfo:()=>({enableDebug:enabled}),
    setEnableDebug:options=>{calls++;callbacks=options}}
  const ensure=createPreviewAccess(()=>platform)
  let first=ensure();enabled=true;callbacks.success();await first
  await ensure();assert.equal(calls,1)
  enabled=false
  const second=ensure(),shared=ensure();assert.equal(calls,2);assert.equal(second,shared)
  enabled=true;callbacks.success();await second
})
test('调试准备失败或超时明确拒绝，之后可重试，不伪造准备成功',async()=>{
  let calls=0
  const ensure=createPreviewAccess(()=>({getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),setEnableDebug:options=>{calls++;calls===1?options.fail():options.success()}}))
  await assert.rejects(ensure(),{code:'SERVICE_UNAVAILABLE'});await ensure();assert.equal(calls,2)
  const timeout=createPreviewAccess(()=>({getAccountInfoSync:()=>({miniProgram:{envVersion:'trial'}}),setEnableDebug:()=>{}}),{timeoutMs:5})
  await assert.rejects(timeout(),/准备超时/)
})
