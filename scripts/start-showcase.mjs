import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startCampusServer } from '../backend/campus/server.js'
import { prepareShowcase } from './prepare-showcase.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
if(Number(process.versions.node.split('.')[0])!==22)throw new Error('请使用Node22；Windows展示包已带独立运行时')
const port=Number(process.env.CAMPUS_SHOWCASE_PORT||8791)
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('展示端口无效')
const dataDir=path.resolve(process.env.CAMPUS_SHOWCASE_DATA_DIR||path.join(root,'.showcase-campus'))
const releaseRoot=path.join(root,'dist/release/h5'),staticRoot=fs.existsSync(path.join(releaseRoot,'index.html'))?releaseRoot:path.join(root,'dist/local/campus-h5')
if(!fs.existsSync(path.join(staticRoot,'index.html')))throw new Error('请先生成真实H5发布构建或使用完整展示包')
const bundledAsset=path.join(root,'showcase-assets/sample-item.png')
prepareShowcase({dataDir,origin:`http://127.0.0.1:${port}`,assetPath:fs.existsSync(bundledAsset)?bundledAsset:path.join(root,'docs/assets/app-avatar-2026-10-25/app-avatar-v1.png')})
const server=await startCampusServer({port,host:'127.0.0.1',publicHost:'127.0.0.1',publicOrigin:'',trustedProxies:[],dataDir,staticRoot})
process.stdout.write(`\n展示入口：http://127.0.0.1:${port}/#/\n账号文件：${path.join(dataDir,'展示账号.txt')}\n所有内容为独立虚构测试数据；认证、上传、消息和玩法使用真实SQLite后端。\n请保留终端，关闭会停止服务。仅本机投影展示；公网演示另用交付链接。\n`)
const stop=()=>{server.closeAllConnections();server.close(()=>{process.exitCode=0})}
process.once('SIGINT',stop);process.once('SIGTERM',stop)
