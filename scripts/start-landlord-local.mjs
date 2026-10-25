import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js')
const build = spawn(process.execPath, [cli, 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_MODE: 'mock', VITE_API_BASE_URL: '', VITE_GAME_BASE_URL: '/game', UNI_H5_BASE: '/' }
})
const code = await new Promise((resolve, reject) => { build.once('error', reject); build.once('exit', resolve) })
if (code !== 0) process.exit(typeof code === 'number' ? code : 1)
const { startServer } = await import('../server/landlord/index.mjs')
await startServer()
