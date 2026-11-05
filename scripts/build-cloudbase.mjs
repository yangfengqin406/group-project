import { spawnSync } from 'node:child_process'
import { copyFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'dist/cloudbase', `campus-${Date.now()}`)
const web = join(output, 'public')
function copyTree(source, target) {
  mkdirSync(target, { recursive: true })
  for (const item of readdirSync(source, {withFileTypes:true})) {
    if (item.isSymbolicLink()) throw new Error('Deployment source cannot contain links')
    if (item.isDirectory()) copyTree(join(source,item.name),join(target,item.name))
    else if (item.isFile()) copyFileSync(join(source,item.name),join(target,item.name))
    else throw new Error('Unexpected deployment source file')
  }
}
// Only public connection prefixes enter the H5 bundle. Server credentials are
// supplied separately to the function and never copied into this artifact.
const built = spawnSync(process.execPath, [join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'), 'build'], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, VITE_API_MODE: 'http', VITE_API_BASE_URL: '/api', VITE_GAME_BASE_URL: '/game', UNI_H5_BASE: '/', UNI_OUTPUT_DIR: web }
})
if (built.status !== 0) process.exit(built.status || 1)
if (process.env.CAMPUS_DOWNLOAD_URL) {
  const url=new URL(process.env.CAMPUS_DOWNLOAD_URL)
  if(url.protocol!=='https:'||url.username||url.password) throw new Error('APK download requires a public HTTPS URL')
  const safe=url.href.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  const size=process.env.CAMPUS_DOWNLOAD_BYTES
  if(!/^\d{1,9}$/.test(size||'')||Number(size)<1)throw new Error('CAMPUS_DOWNLOAD_BYTES must contain the verified APK length')
  const version = process.env.CAMPUS_DOWNLOAD_VERSION
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('CAMPUS_DOWNLOAD_VERSION must contain the verified APK version')
  const page = readFileSync(join(root, 'deploy/cloudbase/app-download.html'), 'utf8')
    .replace('%%APK_URL%%', safe)
    .replace('%%APK_SIZE%%', (Number(size) / 1048576).toFixed(1))
    .replaceAll('%%APK_VERSION%%', version)
  writeFileSync(join(web, 'app-download.html'), page)
}
for (const relative of ['backend', 'server/landlord', 'src/domain', 'src/utils']) {
  mkdirSync(dirname(join(output, relative)), { recursive: true })
  copyTree(join(root, relative), join(output, relative))
}
writeFileSync(join(output, 'package.json'), JSON.stringify({ name:'campus-cloudbase-runtime', private:true, type:'module', engines:{node:'>=22 <23'} }, null, 2)+'\n')
writeFileSync(join(output, 'scf_bootstrap'), '#!/bin/sh\ncd /var/user\nexec /var/lang/node22/bin/node backend/cloudbase/entry.mjs\n', {mode:0o755})
if (!existsSync(join(web, 'index.html'))) throw new Error('Missing H5 build')
console.log(JSON.stringify({ output, dependencyInstall:false, credentialsIncluded:false }))
