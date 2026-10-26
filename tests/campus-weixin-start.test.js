import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { weixinDebugConfig, verifyCampusEndpoint } from '../scripts/start-campus-weixin.mjs'

async function endpoint(t, status, body, type = 'application/json') {
  const server = createServer((req, res) => {
    assert.equal(req.url, '/api/health')
    res.writeHead(status, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body))
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)) })
  return `http://127.0.0.1:${server.address().port}`
}

test('微信模拟器启动配置覆盖旧IP和mock模式，固定同机回环接口', () => {
  const config = weixinDebugConfig({ VITE_API_MODE: 'mock', VITE_API_BASE_URL: 'http://old-ip/api', UNI_OUTPUT_DIR: 'old-output' })
  assert.equal(config.origin, 'http://127.0.0.1:8788')
  assert.equal(config.env.VITE_API_MODE, 'http')
  assert.equal(config.env.VITE_API_BASE_URL, 'http://127.0.0.1:8788/api')
  assert.equal(config.env.VITE_GAME_BASE_URL, 'http://127.0.0.1:8788/game')
  assert.match(config.env.UNI_OUTPUT_DIR.replaceAll('\\', '/'), /dist\/build\/mp-weixin$/)
})

test('手机调试可显式指定当前LAN与端口，公共文件源配置保留', () => {
  const config = weixinDebugConfig({ CAMPUS_WEIXIN_HOST: '192.168.1.23', CAMPUS_PORT: '8791', CAMPUS_PUBLIC_HOST: '192.168.1.23' })
  assert.equal(config.env.VITE_API_BASE_URL, 'http://192.168.1.23:8791/api')
  assert.equal(config.env.CAMPUS_PUBLIC_HOST, '192.168.1.23')
})

test('微信调试配置拒绝不可请求地址和非法端口', () => {
  for (const host of ['0.0.0.0', '169.254.1.2', 'http://old-ip', 'user@host', '999.1.1.1'])
    assert.throws(() => weixinDebugConfig({ CAMPUS_WEIXIN_HOST: host }), /IPv4/)
  for (const port of ['0', '-1', '65536', 'invalid']) assert.throws(() => weixinDebugConfig({ CAMPUS_PORT: port }), /CAMPUS_PORT/)
})

test('微信启动前通过真实HTTP验证持久化后端健康信息', async (t) => {
  const origin = await endpoint(t, 200, { code: 'OK', data: { mode: 'local-persistent', database: 'sqlite' } })
  assert.deepEqual(await verifyCampusEndpoint(origin), { mode: 'local-persistent', database: 'sqlite' })
})

test('502、陌生服务及坏JSON不能被当成后端已就绪', async (t) => {
  const badGateway = await endpoint(t, 502, 'Bad Gateway', 'text/plain')
  await assert.rejects(verifyCampusEndpoint(badGateway), /502/)
  const foreign = await endpoint(t, 200, { code: 'OK', data: { mode: 'mock' } })
  await assert.rejects(verifyCampusEndpoint(foreign), /不是本机持久化校园服务/)
  const malformed = await endpoint(t, 200, 'not JSON')
  await assert.rejects(verifyCampusEndpoint(malformed), /JSON/)
})
