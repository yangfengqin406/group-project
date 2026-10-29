import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const target=path.join(root,'dist/deliverables',process.argv[2]||'campus-release-20261027')
if(path.dirname(target)!==path.join(root,'dist/deliverables'))throw new Error('交付目录必须位于dist/deliverables内')
if(fs.existsSync(target))throw new Error('目标已经存在；请先核对旧交付物并另行归档，不会覆盖')
for(const file of ['dist/release/h5/index.html','dist/release/mp-weixin/app.json'])
  if(!fs.existsSync(path.join(root,file)))throw new Error('缺少两端发布构建：'+file)
for(const platform of ['h5','mp-weixin']){
  const receipt=JSON.parse(fs.readFileSync(path.join(root,'dist/release',platform,'release-build.json'),'utf8'))
  if(receipt.apiMode!=='http'||receipt.platform!==platform)throw new Error('禁止把演示构建作为真实发布包')
}
const copy=(from,to=from)=>{
  const source=path.join(root,from),destination=path.join(target,to)
  fs.mkdirSync(path.dirname(destination),{recursive:true})
  if(fs.statSync(source).isDirectory()){
    fs.mkdirSync(destination,{recursive:true})
    for(const entry of fs.readdirSync(source))copy(path.join(from,entry),path.join(to,entry))
  }else fs.copyFileSync(source,destination)
}
fs.mkdirSync(target,{recursive:true})
for(const directory of ['backend','server/landlord','src/domain','src/utils','deploy'])copy(directory)
for(const file of ['scripts/prepare-showcase.mjs','scripts/start-showcase.mjs','scripts/campus-admin.mjs'])copy(file)
copy('dist/release/h5','dist/local/campus-h5')
copy('dist/release/mp-weixin','wechat-mp-local')
const privateAppId=JSON.parse(fs.readFileSync(path.join(root,'src/manifest.json'),'utf8'))['mp-weixin']?.appid
function redactAppId(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name)
  if(entry.isDirectory())redactAppId(file)
  else if(/\.(json|js)$/.test(entry.name)&&privateAppId){const original=fs.readFileSync(file,'utf8');if(original.includes(privateAppId))fs.writeFileSync(file,original.replaceAll(privateAppId,''))}
}}
redactAppId(path.join(target,'wechat-mp-local'))
copy('docs/assets/app-avatar-2026-10-25/app-avatar-v1.png','showcase-assets/sample-item.png')
for(const file of ['docs/showcase-2026-10-27.md','docs/release-2026-10-27.md','docs/music-credits.md','docs/plaza-assets.md'])copy(file)
copy('docs/assets/release-2026-10-27')
for(const name of ['vue','@vue/shared','@vue/runtime-core','@vue/runtime-dom','@vue/reactivity','@dcloudio/uni-app','@dcloudio/uni-h5','@dcloudio/uni-h5-vue','@dcloudio/uni-components','@dcloudio/uni-shared','@dcloudio/uni-i18n','@dcloudio/uni-mp-weixin','@dcloudio/uni-mp-vue'])
  for(const license of ['LICENSE','license.md']){
    const source=`node_modules/${name}/${license}`
    if(fs.existsSync(path.join(root,source)))copy(source,`licenses/${name.replaceAll('/','_')}/${license}`)
  }
fs.writeFileSync(path.join(target,'package.json'),JSON.stringify({name:'campus-plaza-release',version:'2026.10.27',private:true,type:'module',engines:{node:'>=22 <23'}},null,2)+'\n')
fs.writeFileSync(path.join(target,'启动展示.cmd'),'@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\n"runtime\\node.exe" scripts\\start-showcase.mjs\r\nif errorlevel 1 pause\r\n')
fs.writeFileSync(path.join(target,'请先阅读.txt'),'校园生活广场 2026-10-27 发布候选\r\n\r\nWindows：完整解压后双击“启动展示.cmd”，保留终端，访问 http://127.0.0.1:8791/#/\r\n账号与随机密码首次生成在 .showcase-campus/展示账号.txt，勿公开该文件。\r\n展示人物、内容和预置进度均为虚构测试数据；业务请求连接真实 SQLite 服务。\r\n重启保留展示进度，正式部署使用全新数据目录。\r\n公网部署步骤与上线限制见 docs/release-2026-10-27.md。\r\n流程、逐字稿与答辩见 docs/showcase-2026-10-27.md。\r\n微信产物 wechat-mp-local 为本机模拟器版本，接口127.0.0.1:8791，不是可上传审核的公网配置。\r\n')
const hashFiles=[]
function inspect(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name),relative=path.relative(target,file).replaceAll('\\','/')
  if(entry.name==='node_modules'||entry.name==='.env'||entry.name.endsWith('.sqlite')||entry.name==='credentials.json')throw new Error('包中存在禁止交付文件：'+relative)
  if(entry.isDirectory())inspect(file)
  else hashFiles.push({path:relative,bytes:fs.statSync(file).size,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')})
}}
inspect(target)
fs.writeFileSync(path.join(target,'release.json'),JSON.stringify({version:'2026.10.27-rc1',builtAt:new Date().toISOString(),h5Mode:'http same-origin /api /game',wechatMode:'local simulator 127.0.0.1:8791',dataIncluded:false,publicDeployed:false,files:hashFiles},null,2)+'\n')
console.log(JSON.stringify({target,files:hashFiles.length,dataIncluded:false}))
