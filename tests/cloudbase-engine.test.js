import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { openCStore } from '../backend/c/store.js'
import { exportSnapshot } from '../backend/cloudbase/state.js'
import { createCloudEngine, createCloudCoordinator } from '../backend/cloudbase/engine.js'
import { createCloudHttpServer } from '../backend/cloudbase/http.js'

const origin = 'https://campus-test.example'
const bytes = readFileSync(new URL('../src/static/tabs/plaza.png', import.meta.url))
function fixture({now,pushProvider,pushWakeup}={}) {
  const initial = openCStore(':memory:')
  let state = { version:1, snapshot:exportSnapshot(initial), game:null, files:{}, cleanup:[] }
  initial.close()
  const objects = new Map(), counters = { uploads:0, downloads:0, deletes:0, commits:0 }
  const files = {
    async upload(path, content) { const id = `cloud://test/${path}`; counters.uploads++; objects.set(id,Buffer.from(content)); return id },
    async download(id) { counters.downloads++; assert.ok(objects.has(id)); return Buffer.from(objects.get(id)) },
    async remove(id) { counters.deletes++; objects.delete(id) }
  }
  const repository = {
    async read() { return structuredClone(state) },
    async compareAndSwap(version, next) {
      if (version !== state.version) throw Object.assign(new Error('version conflict'),{code:'CLOUD_STATE_CONFLICT'})
      state = structuredClone({...next,version:version+1}); counters.commits++
    }
  }
  const call = input => createCloudCoordinator({repository,files,pushWakeup,
    engine:createCloudEngine({files,publicOrigin:origin,staticRoot:process.cwd(),now,pushProvider})}).dispatch(input)
  async function rpc(method,params={},token='') {
    const response = await call({method:'POST',url:'/api/rpc',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:Buffer.from(JSON.stringify({method,params}))})
    return JSON.parse(response.body)
  }
  async function register(name) {
    const result = await rpc('auth.register',{studentId:name,nickname:name,password:'Test-password-2026'})
    assert.equal(result.code,'OK',result.message); return result.data
  }
  return { repository,files,objects,counters,call,rpc,register,state:()=>structuredClone(state) }
}

test('CloudBase bridge: RPC query parameters cannot bypass distributed login limits',async()=>{
  let time=1_800_000_000_000
  const f=fixture({now:()=>time})
  const call=()=>f.call({method:'POST',url:'/api/rpc?probe=1',headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify({method:'auth.login',params:{type:'h5',studentId:'limit-test',password:'Wrong-pass-2026'}}))})
  for(let i=0;i<25;i++) assert.equal(JSON.parse((await call()).body).code,'UNAUTHENTICATED')
  assert.equal(JSON.parse((await call()).body).code,'RATE_LIMITED')
  time+=60_000
  assert.equal(JSON.parse((await call()).body).code,'UNAUTHENTICATED')
})

test('CloudBase bridge: each request starts a fresh engine, real accounts/messages/pearls survive',async()=>{
  const f = fixture(), alice=await f.register('alice'), bob=await f.register('bob'), stranger=await f.register('stranger')
  assert.equal((await f.rpc('auth.login',{type:'h5',studentId:'alice',password:'Wrong-password-99'})).code,'UNAUTHENTICATED')
  const item=await f.rpc('market.create',{title:'互助教材',body:'校门口交接',category:'教材',marketType:'sell',priceCents:1000,condition:'九成新',handoverCampus:'校门口',visibility:'public'},alice.token)
  assert.equal(item.code,'OK',item.message)
  const chat=await f.rpc('conversation.open',{contentType:'market',contentId:item.data.id,peerUserId:alice.user.id},bob.token)
  assert.equal(chat.code,'OK',chat.message)
  const sent=await f.rpc('message.send',{conversationId:chat.data.id,body:'你好，想预约教材',idempotencyKey:'cloud-message-1'},bob.token)
  assert.equal(sent.code,'OK',sent.message)
  assert.equal((await f.rpc('message.list',{conversationId:chat.data.id},stranger.token)).code,'FORBIDDEN')
  const read=await f.rpc('message.list',{conversationId:chat.data.id},alice.token)
  assert.equal(read.code,'OK'); assert.equal(read.data.items.length,1)
  const replay=await f.rpc('message.send',{conversationId:chat.data.id,body:'你好，想预约教材',idempotencyKey:'cloud-message-1'},bob.token)
  assert.deepEqual(replay.data,sent.data)
  const reward=await f.rpc('rewards.getState',{},alice.token)
  assert.equal(reward.code,'OK'); assert.ok(JSON.stringify(reward.data).includes('5'))
  assert.ok(f.state().snapshot.receipts.length>0)
})

test('CloudBase bridge: concurrent independent requests never lose one successful registration',async()=>{
  const f=fixture()
  const users=await Promise.all(['one','two','three','four'].map(name=>f.register(name)))
  assert.equal(new Set(users.map(user=>user.user.id)).size,4)
  assert.equal(f.state().snapshot.records.filter(row=>row.collection==='campus.users').length,4)
})

test('CloudBase request engine does not initialize the long-lived push bridge',async t=>{
  const previous=process.env.CAMPUS_PUSH_BRIDGE_URL
  t.after(()=>{
    if(previous===undefined) delete process.env.CAMPUS_PUSH_BRIDGE_URL
    else process.env.CAMPUS_PUSH_BRIDGE_URL=previous
  })
  process.env.CAMPUS_PUSH_BRIDGE_URL='http://push.invalid'
  const f=fixture(), user=await f.register('push-check')
  const status=await f.rpc('push.status',{},user.token)
  assert.equal(status.code,'OK',status.message)
  assert.equal(status.data.configured,false)
})

async function pushFixture(wake) {
  const outgoing = []
  let f
  const pushProvider = { async send(value) { outgoing.push(value) } }
  f = fixture({ pushProvider, pushWakeup: { wake(ids) { return wake(ids, f) } } })
  const alice = await f.register('push-alice'), bob = await f.register('push-bob')
  const item = await f.rpc('market.create', { title:'教材', body:'校内交接', category:'教材', marketType:'sell',
    priceCents:1000, condition:'九成新', handoverCampus:'校门口', visibility:'public' }, alice.token)
  const chat = await f.rpc('conversation.open', { contentType:'market', contentId:item.data.id, peerUserId:alice.user.id }, bob.token)
  const bound = await f.rpc('push.bind', { clientId:'cloud-push-device-001', platform:'android' }, alice.token)
  assert.equal(bound.code, 'OK', bound.message)
  const send = () => f.rpc('message.send', { conversationId:chat.data.id, body:'请问还在吗', idempotencyKey:'push-commit-1' }, bob.token)
  return { ...f, send, outgoing }
}

test('CloudBase only wakes committed new push jobs and never runs the request-private sender', async () => {
  const calls = []
  const f = await pushFixture((ids, current) => {
    assert.ok(ids.every(id => current.state().snapshot.records.some(row => row.collection === 'campus.pushJobs' && row.id === id)))
    calls.push(ids)
    return Promise.resolve({ accepted:true })
  })
  assert.equal((await f.send()).code, 'OK')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].length, 1)
  assert.equal(f.outgoing.length, 0)
  assert.equal((await f.send()).code, 'OK')
  assert.equal(calls.length, 1)
})

test('CloudBase a failed asynchronous wakeup cannot undo a committed private message', async () => {
  const f = await pushFixture(() => { throw new Error('simulated queue unavailable') })
  assert.equal((await f.send()).code, 'OK')
  assert.equal(f.state().snapshot.records.filter(row => row.collection === 'messages').length, 1)
  const jobs = f.state().snapshot.records.filter(row => row.collection === 'campus.pushJobs').map(row => JSON.parse(row.data))
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].status, 'pending')
})

test('CloudBase an uncertain commit leaves recovery work without an unconfirmed wakeup', async () => {
  const calls = []
  const f = await pushFixture(ids => { calls.push(ids); return Promise.resolve({ accepted:true }) })
  const save = f.repository.compareAndSwap
  f.repository.compareAndSwap = async (version, next) => {
    await save(version, next)
    throw Object.assign(new Error('lost commit response'), { code:'CLOUD_STATE_COMMIT_UNCERTAIN' })
  }
  await assert.rejects(f.send(), { code:'CLOUD_STATE_COMMIT_UNCERTAIN' })
  assert.equal(calls.length, 0)
  assert.equal(f.state().snapshot.records.filter(row => row.collection === 'campus.pushJobs').length, 1)
})

test('CloudBase bridge: PostgreSQL JSONB key ordering does not turn unchanged reads into writes',async()=>{
  const f=fixture(), alice=await f.register('alice')
  await f.rpc('pet.get',{},alice.token)
  const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value
  const read=f.repository.read
  f.repository.read=async()=>sorted(await read())
  const before=f.counters.commits
  assert.equal((await f.rpc('pet.get',{},alice.token)).code,'OK')
  assert.equal(f.counters.commits,before)
})

test('CloudBase bridge: private upload auth precedes cloud read; bytes and deletion survive cold starts',async()=>{
  const f=fixture(), alice=await f.register('alice'), bob=await f.register('bob')
  const boundary='campus-test-boundary'
  const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)])
  const upload=await f.call({method:'POST',url:'/api/upload?usage=content',headers:{authorization:`Bearer ${alice.token}`,'content-type':`multipart/form-data; boundary=${boundary}`},body})
  const image=JSON.parse(upload.body)
  assert.equal(image.code,'OK',image.message); assert.equal(f.counters.uploads,1)
  const path=new URL(image.data.url).pathname
  const unauthorized=await f.call({method:'GET',url:path,headers:{authorization:`Bearer ${bob.token}`},body:Buffer.alloc(0)})
  assert.equal(unauthorized.status,404); assert.equal(f.counters.downloads,0)
  const own=await f.call({method:'GET',url:path,headers:{authorization:`Bearer ${alice.token}`},body:Buffer.alloc(0)})
  assert.equal(own.status,200); assert.deepEqual(own.body,bytes)
  assert.equal((await f.rpc('auth.deleteAccount',{password:'Test-password-2026',confirmation:'注销账号'},alice.token)).code,'OK')
  assert.equal(f.state().cleanup.length,1)
  const after=await f.call({method:'GET',url:path,headers:{authorization:`Bearer ${alice.token}`},body:Buffer.alloc(0)})
  assert.equal(after.status,404)
  assert.equal(f.state().cleanup.length,0)
  await createCloudCoordinator({repository:f.repository,files:f.files,engine:null}).cleanup()
  assert.equal(f.objects.size,0); assert.equal(f.state().cleanup.length,0)
})

test('CloudBase bridge: uncertain commit returns failure without re-execution or deleting referenced bytes',async()=>{
  const files={async remove(){throw new Error('must not delete')}}, state={version:1}, response={status:200,headers:{},body:Buffer.from('OK')}
  let runs=0
  const coordinator=createCloudCoordinator({files,repository:{async read(){return state},async compareAndSwap(){throw Object.assign(new Error('lost reply'),{code:'CLOUD_STATE_COMMIT_UNCERTAIN'})}},
    engine:{async execute(){runs++;return{state:{...state,changed:true},response,staged:['cloud://object']}}}})
  await assert.rejects(coordinator.dispatch({}),{code:'CLOUD_STATE_COMMIT_UNCERTAIN'})
  assert.equal(runs,1)
})

test('CloudBase HTTP: foreign browser origin rejected before state; health reflects actual initialization',async t=>{
  let reads=0
  const server=createCloudHttpServer({publicOrigin:origin,staticRoot:process.cwd(),coordinator:null,repository:{async read(){reads++;return null}}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
  const local=`http://127.0.0.1:${server.address().port}`
  const foreign=await fetch(`${local}/api/health`,{headers:{Origin:'https://foreign.example'}})
  assert.equal(foreign.status,403);assert.equal(reads,0)
  const health=await fetch(`${local}/api/health`)
  assert.equal(health.status,503);assert.equal((await health.json()).code,'SERVICE_UNAVAILABLE');assert.equal(reads,1)
})
