import { spawn } from 'node:child_process'
import { isIP } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startCampusServer } from '../backend/campus/server.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function weixinDebugConfig(env = process.env) {
  const port = Number(env.CAMPUS_PORT || 8788)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CAMPUS_PORT 必须为1～65535')
  const host = env.CAMPUS_WEIXIN_HOST || '127.0.0.1'
  if ((host !== 'localhost' && isIP(host) !== 4) || host === '0.0.0.0' || host.startsWith('169.254.'))
    throw new Error('CAMPUS_WEIXIN_HOST 请填写127.0.0.1或当前电脑的有效IPv4地址')
  const origin = `http://${host}:${port}`
  return { port, host, origin, env: {
    ...env, VITE_API_MODE: 'http', VITE_API_BASE_URL: `${origin}/api`,
    VITE_GAME_BASE_URL: `${origin}/game`, UNI_OUTPUT_DIR: resolve(ROOT, 'dist/build/mp-weixin')
  } }
}

export async function verifyCampusEndpoint(origin) {
  const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2500) })
  if (!response.ok) throw new Error(`校园后端健康检查失败（${response.status}）：${origin}`)
  let body
  try { body = await response.json() } catch { throw new Error(`该地址未返回校园后端JSON：${origin}`) }
  if (body?.code !== 'OK' || body.data?.mode !== 'local-persistent' || body.data?.database !== 'sqlite')
    throw new Error(`该端口不是本机持久化校园服务：${origin}`)
  return body.data
}

export async function startCampusWeixin(env = process.env) {
  const config = weixinDebugConfig(env)
  const loopback = `http://127.0.0.1:${config.port}`
  let ownedServer
  try {
    try {
      await verifyCampusEndpoint(loopback)
      process.stdout.write('校园后端已在运行，将复用；请保持原服务进程运行。\n')
    } catch (error) {
      if (error?.cause?.code !== 'ECONNREFUSED') throw error
      ownedServer = await startCampusServer({ port: config.port,
        publicHost: env.CAMPUS_PUBLIC_HOST, dataDir: env.CAMPUS_DATA_DIR })
      await verifyCampusEndpoint(loopback)
    }
    await verifyCampusEndpoint(config.origin)
    process.stdout.write(`微信调试接口：${config.origin}/api\n`)
    const child = spawn(process.execPath, [resolve(ROOT, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'), 'build', '-p', 'mp-weixin'], {
      cwd: ROOT, stdio: 'inherit', env: config.env
    })
    const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done) })
    if (code !== 0) throw new Error(`微信构建失败（${code ?? '进程中断'}），请检查上方编译日志`)
    process.stdout.write('微信构建已更新：dist/build/mp-weixin。回开发者工具点击编译，并用已有独立账号登录。\n')
    if (config.host === '127.0.0.1' || config.host === 'localhost')
      process.stdout.write('当前为电脑模拟器地址；手机调试需设置CAMPUS_WEIXIN_HOST为当前WLAN地址后重新运行。\n')
    if (ownedServer) {
      process.stdout.write('本终端正在提供真实后端，请保持运行；Ctrl+C停止服务，数据库与文件保留。\n')
      const stop = () => { ownedServer.closeAllConnections(); ownedServer.close(() => { process.exitCode = 0 }) }
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
    }
    return ownedServer
  } catch (error) {
    if (ownedServer) { ownedServer.closeAllConnections(); await new Promise((done) => ownedServer.close(done)) }
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startCampusWeixin().catch((error) => { process.stderr.write(`微信本机调试启动失败：${error.message}\n`); process.exitCode = 1 })
}
