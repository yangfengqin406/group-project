import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'dist/local/campus-h5')
const child = spawn(process.execPath, [path.join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'), 'build'], {
  cwd: root, stdio: 'inherit', env: {
    ...process.env, VITE_API_MODE: 'http', VITE_API_BASE_URL: '/api', VITE_GAME_BASE_URL: '/game', UNI_H5_BASE: '/', UNI_OUTPUT_DIR: output
  }
})
const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done) })
if (code !== 0) process.exit(typeof code === 'number' ? code : 1)
const { startCampusServer } = await import('../backend/campus/server.js')
await startCampusServer({ staticRoot: output })
