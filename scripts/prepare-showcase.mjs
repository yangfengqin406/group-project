import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'
import { createDiveGame } from '../src/utils/dive-game.js'

export function demonstrationProof(run) {
  const game=createDiveGame(1,{seed:run.seed}), trace=[];let previous=''
  for(const [x,y] of [[22,54],[22,60],[49,60],[49,42],[76,42],[76,21],[91,12]])
    for(let guard=0;guard<500;guard++){
      const state=game.getState()
      if(state.status!=='playing')return{runId:run.id,ticks:state.tick,trace}
      if(Math.hypot(x-state.player.x,y-state.player.y)<.8)break
      const input={dx:Math.abs(x-state.player.x)>.45?Math.sign(x-state.player.x):0,dy:Math.abs(y-state.player.y)>.45?Math.sign(y-state.player.y):0,fire:true}
      const key=JSON.stringify(input);if(key!==previous){trace.push({tick:state.tick,...input});previous=key}
      game.setInput(input);game.step()
    }
  throw new Error('展示进度准备失败，未生成通关结果')
}

export function prepareShowcase({dataDir,origin,assetPath,now=Date.now()}) {
  const directory=path.resolve(dataDir), markerFile=path.join(directory,'showcase-owner.json')
  if(path.basename(directory).toLowerCase()==='.local-campus')throw new Error('不能把真实用户目录用作展示数据')
  if(fs.existsSync(markerFile)){
    const marker=JSON.parse(fs.readFileSync(markerFile,'utf8'))
    if(marker.kind!=='campus-showcase-v1'||!fs.existsSync(path.join(directory,'campus.sqlite'))||!fs.existsSync(path.join(directory,'展示账号.txt'))||!fs.existsSync(path.join(directory,'credentials.json')))
      throw new Error('展示目录不完整，请使用新的空目录，不会覆盖已有数据')
    if(marker.origin!==origin)throw new Error('展示地址已改变，请保持原端口或指定新的空展示目录')
    return marker
  }
  if(fs.existsSync(directory)&&fs.readdirSync(directory).length)throw new Error('只能初始化空的独立展示目录，不会覆盖已有数据')
  fs.mkdirSync(directory,{recursive:true})
  const store=openCStore(path.join(directory,'campus.sqlite'))
  try {
    let simulationNow=now
    const service=createCampusService({store,uploadsDir:path.join(directory,'uploads'),uploadOrigin:origin,trustedUploadOrigins:[origin],
      leisureOptions:{now:()=>simulationNow,random:()=>.1}})
    const credentials=[],users=[]
    for(const [studentId,nickname] of [['showcase_lin','演示小林'],['showcase_tao','演示小桃'],['showcase_he','演示小禾']]){
      const password='Demo-'+randomBytes(9).toString('base64url')
      const created=service.invoke('auth.register',{studentId,password,nickname})
      credentials.push({studentId,password,nickname});users.push(created.user)
    }
    const call=(index,method,params={})=>service.invoke(method,params,{userId:users[index].id})
    const photo=service.accounts.receiveUpload({userId:users[0].id,usage:'content',buffer:fs.readFileSync(assetPath),mime:'image/png',origin})
    call(0,'upload.confirm',{imageId:photo.imageId})
    const item=call(0,'market.create',{title:'兔子造型摆件（演示）',body:'虚构教学测试数据，图片为示意图。用于展示发布、预约和私信，不进行实际交易。',category:'生活用品',marketType:'sell',priceCents:3500,condition:'九成新',handoverCampus:'图书馆门口',visibility:'public',imageIds:[photo.imageId]})
    const plan={title:'图书馆自习搭子（演示）',body:'虚构展示计划，一起复习高数。',category:'学习',location:'图书馆一楼',images:[],capacity:2,startAt:new Date(now+86400000).toISOString(),endAt:new Date(now+90000000).toISOString()}
    const target=call(0,'plan.create',plan),source=call(1,'plan.create',{...plan,title:'找同时间自习伙伴（演示）'})
    const lost=call(0,'lostFound.create',{title:'拾到兔子图案卡套（演示）',body:'虚构教学样例，请描述卡套特征后联系；图片为示意图。',location:'图书馆一楼',lostKind:'found',category:'card',images:[photo.url]})
    call(2,'help.create',{title:'帮忙拍一张活动照片（演示）',body:'虚构教学样例，想找会摄影的同学。',skillTags:['摄影'],location:'校园广场',images:[],visibility:'public'})
    // This creates explicitly fictional sample progress through the same replay
    // validator. The production server never accepts this clock from a client.
    const run=call(0,'dive.start',{levelId:1}),proof=demonstrationProof(run)
    simulationNow+=proof.ticks*50
    const cleared=call(0,'dive.finish',proof)
    if(cleared.status!=='cleared')throw new Error('展示进度没有完成')
    call(0,'wardrobe.equip',{slot:'outfit',itemId:'sailor-shirt'})
    const marker={kind:'campus-showcase-v1',createdAt:new Date(now).toISOString(),fictionalData:true,origin,
      users:users.map((user,index)=>({id:user.id,studentId:credentials[index].studentId,nickname:user.nickname})),
      examples:{itemId:item.id,targetPlanId:target.id,sourcePlanId:source.id,lostId:lost.id},sampleProgress:true}
    fs.writeFileSync(path.join(directory,'credentials.json'),JSON.stringify(credentials,null,2),{mode:0o600})
    fs.writeFileSync(path.join(directory,'展示账号.txt'),'仅供独立本机展示。所有角色、内容和预置进度均为虚构测试数据。\n\n'+credentials.map(value=>`${value.nickname}\n账号：${value.studentId}\n密码：${value.password}\n`).join('\n'),{mode:0o600})
    fs.writeFileSync(markerFile,JSON.stringify(marker,null,2),{mode:0o600})
    return marker
  } finally {store.close()}
}
