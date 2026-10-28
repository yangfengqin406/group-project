import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { appBuildOptions } from './app-build-options.mjs'
import { prepareAppAudio } from './prepare-app-audio.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('App 构建请使用 Node22')
const options = appBuildOptions()
if (options.release && !options.bound) throw new Error('正式打包须先配置用户自己的 CAMPUS_DCLOUD_APP_ID')
prepareAppAudio()
const buildRoot = path.join(root, 'dist/app', String(Date.now()))
const input = path.join(buildRoot, 'hbuilder-project')
function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name)
    if (entry.isDirectory()) copyDirectory(from, to)
    else if (entry.isFile()) fs.copyFileSync(from, to)
  }
}
copyDirectory(path.join(root, 'src'), input)
const manifestPath = path.join(input, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
manifest.appid = options.appId
if (manifest['mp-weixin']) manifest['mp-weixin'].appid = ''
manifest.description = '校园生活信息、互助与虚拟伙伴'
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
// HBuilderX recompiles this project without the invoking shell's environment.
// Bake only public transport settings into the ignored staging copy so its
// cloud build cannot accidentally use the source default mock adapter.
const configPath = path.join(input, 'config/index.js')
const injected = fs.readFileSync(configPath, 'utf8')
  .replace(/import\.meta\.env\.VITE_PHONE_PREVIEW_DEBUG/g, JSON.stringify('false'))
  .replace(/import\.meta\.env\.VITE_API_MODE/g, JSON.stringify('http'))
  .replace(/import\.meta\.env\.VITE_API_BASE_URL/g, JSON.stringify(options.apiBaseUrl))
  .replace(/import\.meta\.env\.VITE_GAME_BASE_URL/g, JSON.stringify(options.gameBaseUrl))
  .replace(/import\.meta\.env\.VITE_APP_CONTACT_EMAIL/g, JSON.stringify(options.contactEmail))
  .replace(/import\.meta\.env\.VITE_APP_PRIVACY_URL/g, JSON.stringify(options.privacyUrl))
fs.writeFileSync(configPath, injected)
const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const policyPath = path.join(input, 'static/app/privacy.html')
fs.writeFileSync(policyPath, fs.readFileSync(policyPath, 'utf8')
  .replaceAll('{{CONTACT}}', escapeHtml(options.contactEmail || '请通过发放测试包的项目成员联系维护者'))
  .replaceAll('{{POLICY}}', escapeHtml(options.privacyUrl || '当前为开发测试包，正式运营信息以正式发布版本为准')))
// HBuilderX visual projects put the source at the project root. Its own
// compiler supplies uni-app/Vue; no private configuration or node_modules copy.
fs.writeFileSync(path.join(input, 'package.json'), JSON.stringify({ name: 'campus-plaza-app', version: manifest.versionName, private: true }, null, 2) + '\n')
for (const target of ['app-android', 'app-ios']) {
  const output = path.join(buildRoot, target)
  const child = spawn(process.execPath, [path.join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'), 'build', '-p', target], {
    cwd: root, stdio: 'inherit', env: {
      ...process.env, UNI_INPUT_DIR: input, UNI_OUTPUT_DIR: output,
      VITE_PHONE_PREVIEW_DEBUG: 'false', VITE_API_MODE: 'http',
      VITE_API_BASE_URL: options.apiBaseUrl, VITE_GAME_BASE_URL: options.gameBaseUrl
    }
  })
  const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done) })
  if (code !== 0) throw new Error(`${target} 编译失败：${code}`)
  for (const resource of ['manifest.json', 'app-service.js', 'static/app/audio/carefree.mp3', 'static/app/audio/water.wav', 'static/app/privacy.html'])
    if (!fs.existsSync(path.join(output, resource))) throw new Error(`${target} 缺少必要资源：${resource}`)
}
const receipt = {
  ...options, versionName: manifest.versionName, versionCode: manifest.versionCode, builtAt: new Date().toISOString(), buildRoot,
  nativePackages: { apk: false, ipa: false },
  note: 'CLI编译预检资源不是已签名安装包；官方云打包/本地打包由HBuilderX完成，真实AppID与账号登录仍需用户配置。'
}
fs.writeFileSync(path.join(buildRoot, 'app-build.json'), JSON.stringify(receipt, null, 2) + '\n')
fs.writeFileSync(path.join(root, 'dist/app/latest.json'), JSON.stringify(receipt, null, 2) + '\n')
console.log(`双端 App 编译预检完成：${buildRoot}`)
console.log(options.bound ? '已配置用户AppID，后续在HBuilderX完成签名打包。' : '尚未绑定DCloud AppID；编译预检不代表可以直接安装。')
