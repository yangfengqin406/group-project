import { resolve } from 'node:path'
import { openCStore } from '../backend/c/store.js'
import { createCampusService } from '../backend/campus/service.js'

const [action, accountName, reportId, decision, ...words] = process.argv.slice(2)
if (!['grant', 'reports', 'resolve'].includes(action) || !accountName) {
  process.stderr.write('用法：npm run campus:admin -- grant <账号> | reports <账号> | resolve <账号> <举报编号> <resolve|dismiss> <说明>\n')
  process.exit(1)
}
const dataDir = resolve(process.env.CAMPUS_DATA_DIR || '.local-campus')
const store = openCStore(resolve(dataDir, 'campus.sqlite'))
try {
  const user = store.query('campus.users', "json_extract(data, '$.uniqueKey') = ?", [accountName.toLowerCase()], 'seq DESC', 1)[0]?.value
  if (!user || user.disabled) throw new Error('请先在服务中注册有效的账号')
  if (action === 'grant') {
    store.transaction(() => store.update('campus.users', { ...user, roles: [...new Set([...(user.roles || []), 'admin'])] }))
    process.stdout.write('已由本机数据库管理员授予该账号举报处理权限。普通注册和前端资料更新均不能授予此权限。\n')
  } else {
    if (!user.roles?.includes('admin')) throw new Error('该账号没有管理员权限；仅本机数据库管理员可先执行 grant')
    if (action === 'reports') {
      const rows = store.query('reports', "json_extract(data, '$.status') = ?", ['pending'], 'seq DESC', 1000)
      process.stdout.write(JSON.stringify(rows.map(({ value }) => ({ id: value.id, contentType: value.contentType, contentId: value.contentId, reason: value.reason, createdAt: value.createdAt })), null, 2) + '\n')
    } else {
      const service = createCampusService({ store, uploadsDir: resolve(dataDir, 'uploads') })
      const report = service.invoke('report.adminResolve', { reportId, action: decision, resolution: words.join(' ') }, { userId: user.id })
      process.stdout.write(JSON.stringify({ id: report.id, status: report.status, resolution: report.resolution }) + '\n')
    }
  }
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
finally { store.close() }
