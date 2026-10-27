import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

function httpsOrigin(value,name){
  let url
  try{url=new URL(value)}catch{throw new Error(`${name}必须填写可达的HTTPS源`)}
  if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw new Error(`${name}只允许HTTPS源，不能带路径或凭据`)
  return url.origin
}

export function phonePreviewConfig(env=process.env){
  const origin=httpsOrigin(env.CAMPUS_PHONE_PREVIEW_ORIGIN,'CAMPUS_PHONE_PREVIEW_ORIGIN')
  const assetOrigin=httpsOrigin(env.CAMPUS_PHONE_PREVIEW_ASSET_ORIGIN||origin,'CAMPUS_PHONE_PREVIEW_ASSET_ORIGIN')
  return{origin,assetOrigin}
}

export function preparePhonePreview(directory,config){
  const {origin,assetOrigin}=phonePreviewConfig({CAMPUS_PHONE_PREVIEW_ORIGIN:config.origin,CAMPUS_PHONE_PREVIEW_ASSET_ORIGIN:config.assetOrigin})
  if(!fs.existsSync(path.join(directory,'app.json')))throw new Error('缺少微信app.json，不能处理非构建目录')
  let rewritten=0,webpImageElements=0
  const walk=folder=>{for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name)
    if(entry.isDirectory())walk(file)
    else if(/\.(js|wxml|wxss)$/.test(file)){
      let text=fs.readFileSync(file,'utf8')
      text=text.replace(/(["'`])\/static\//g,(_,quote)=>{rewritten++;return quote+assetOrigin+'/static/'})
      if(file.endsWith('.wxml'))text=text.replace(/<image\b(?![^>]*\bwebp=)/g,match=>{webpImageElements++;return match+' webp="{{true}}"'})
      fs.writeFileSync(file,text)
    }
  }}
  walk(directory)
  const projectPath=path.join(directory,'project.config.json')
  if(fs.existsSync(projectPath)){
    const project=JSON.parse(fs.readFileSync(projectPath,'utf8'));project.packOptions||={}
    project.packOptions.include=(project.packOptions.include||[]).filter(item=>!(item.type==='folder'&&item.value==='static'))
    project.packOptions.include.push({type:'folder',value:'static'})
    fs.writeFileSync(projectPath,JSON.stringify(project,null,2))
  }
  const report={origin,assetOrigin,apiMode:'http',rewritten,webpImageElements,developmentPreview:true}
  fs.writeFileSync(path.join(directory,'phone-preview.json'),JSON.stringify(report,null,2))
  return report
}

export async function buildPhonePreview(env=process.env){
  if(Number(process.versions.node.split('.')[0])!==22)throw new Error('手机预览构建请使用Node22')
  const config=phonePreviewConfig(env),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'dist/release/mp-weixin-public')
  const child=spawn(process.execPath,[path.join(root,'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),'build','-p','mp-weixin'],{
    cwd:root,stdio:'inherit',env:{...env,VITE_API_MODE:'http',VITE_API_BASE_URL:config.origin+'/api',VITE_GAME_BASE_URL:config.origin+'/game',UNI_OUTPUT_DIR:output}
  })
  const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',done)})
  if(code!==0)throw new Error('手机预览构建失败：'+code)
  const report=preparePhonePreview(output,config)
  process.stdout.write(JSON.stringify({...report,output})+'\n开发预览需登记合法域名或在有权限的手机开启调试；不是正式审核包。\n')
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)buildPhonePreview().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1})
