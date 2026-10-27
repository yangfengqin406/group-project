import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
if(Number(process.versions.node.split('.')[0])!==22)throw new Error('发布构建请使用 Node22')
const wechatOrigin=process.env.CAMPUS_RELEASE_WECHAT_ORIGIN||'http://127.0.0.1:8791'
const parsed=new URL(wechatOrigin)
if(!['http:','https:'].includes(parsed.protocol)||parsed.origin!==wechatOrigin||parsed.username||parsed.password)
  throw new Error('CAMPUS_RELEASE_WECHAT_ORIGIN 只能是HTTP/HTTPS源，不带路径或凭据')
for(const [platform,api,game] of [['h5','/api','/game'],['mp-weixin',wechatOrigin+'/api',wechatOrigin+'/game']]){
  const output=path.join(root,'dist/release',platform)
  const child=spawn(process.execPath,[path.join(root,'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),'build',...(platform==='h5'?[]:['-p',platform])],{
    cwd:root,stdio:'inherit',env:{...process.env,VITE_PHONE_PREVIEW_DEBUG:'false',VITE_API_MODE:'http',VITE_API_BASE_URL:api,VITE_GAME_BASE_URL:game,UNI_H5_BASE:'/',UNI_OUTPUT_DIR:output}
  })
  const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',done)})
  if(code!==0)throw new Error(platform+'构建失败：'+code)
  fs.writeFileSync(path.join(output,'release-build.json'),JSON.stringify({platform,apiMode:'http',apiBaseUrl:api,gameBaseUrl:game,builtAt:new Date().toISOString()},null,2)+'\n')
}
