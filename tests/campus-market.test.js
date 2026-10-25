import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openCStore } from '../backend/c/store.js'
import { createAccounts } from '../backend/campus/accounts.js'
import { createMarketService } from '../backend/campus/market.js'

const photo = readFileSync(new URL('../src/static/tabs/plaza.png', import.meta.url))
const failCode = (run, code) => assert.throws(run, (error) => error.code === code)
const sale = { title: '九成新的高数教材', body: '教学楼门口交接', category: '教材', marketType: 'sell', priceCents: 3000, condition: '九成新', imageIds: [] }
const buy = { title: '求购高数教材', body: '七成新以上', category: '教材', marketType: 'buy', budgetCents: 5000, keywords: '高数', imageIds: [] }

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'campus-market-'))
  const filename = join(directory, 'campus.sqlite')
  let store
  const create = () => {
    store = openCStore(filename)
    const accounts = createAccounts({ store, uploadsDir: join(directory, 'uploads'), uploadOrigin: 'http://127.0.0.1:8788' })
    const collections = { market: 'campus.market', plan: 'campus.plan', help: 'campus.help', lost_found: 'lost' }
    const content = {
      get: (type, id) => collections[type] ? store.get(collections[type], id) : null,
      list: (type) => (type ? [collections[type]].filter(Boolean) : Object.values(collections))
        .flatMap((collection) => store.query(collection, '1', [], 'seq DESC', 100000).map((row) => row.value)),
      summarize: (item) => ({ ...item, owner: accounts.publicUser(item.ownerId),
        images: item.imageIds?.map((id) => accounts.getUpload(id)?.url).filter(Boolean) || item.images || [] })
    }
    const notifications = (event) => store.insert('test.notifications', { ...event, id: event.eventId + ':' + event.recipientId })
    const service = createMarketService({ store, accounts, content, notify: notifications })
    return { store, accounts, content, call: (method, params, userId) => service.invoke(method, params, { userId }) }
  }
  let env = create()
  const users = [1, 2, 3].map((n) => env.accounts.invoke('auth.register', {
    studentId: `student${n}`, password: 'campus-password-123', nickname: `同学${n}`
  }).user)
  const upload = (userId, usage = 'content', confirmed = true) => {
    const image = env.accounts.receiveUpload({ userId, usage, buffer: photo, mime: 'image/png' })
    if (confirmed) env.accounts.invoke('upload.confirm', { imageId: image.imageId }, { userId })
    return image
  }
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }) })
  return {
    get env() { return env }, users, upload,
    reopen() { store.close(); env = create(); return env }
  }
}

test('真实二手发布由服务端决定作者与校区，图片必须已确认且属于当前账号', (t) => {
  const f = fixture(t), [seller, buyer] = f.users
  const image = f.upload(seller.id)
  const item = f.env.call('market.create', { ...sale, imageIds: [image.imageId], ownerId: buyer.id, status: 'completed', campusId: 'forged', roles: ['admin'] }, seller.id)
  assert.equal(item.ownerId, seller.id)
  assert.equal(item.campusId, 'local-campus')
  assert.equal(item.status, 'active')
  assert.deepEqual(item.images, [image.url])
  assert.equal(item.owner.passwordHash, undefined)
  failCode(() => f.env.call('market.create', { ...sale, imageIds: [image.imageId] }, buyer.id), 'FORBIDDEN')
  const pending = f.upload(seller.id, 'content', false)
  failCode(() => f.env.call('market.create', { ...sale, imageIds: [pending.imageId] }, seller.id), 'FORBIDDEN')
  const avatar = f.upload(seller.id, 'avatar')
  failCode(() => f.env.call('market.create', { ...sale, imageIds: [avatar.imageId] }, seller.id), 'FORBIDDEN')
  failCode(() => f.env.call('market.create', { ...sale, priceCents: Number.MAX_SAFE_INTEGER + 1 }, seller.id), 'INVALID_ARGUMENT')
})

test('私有发布不能通过读取、收藏、匹配或他人主页绕过权限', (t) => {
  const f = fixture(t), [seller, buyer] = f.users
  const item = f.env.call('market.create', { ...sale, visibility: 'private' }, seller.id)
  failCode(() => f.env.call('market.get', { id: item.id }, buyer.id), 'FORBIDDEN')
  failCode(() => f.env.call('favorite.set', { contentType: 'market', contentId: item.id, selected: true }, buyer.id), 'FORBIDDEN')
  failCode(() => f.env.call('market.reserve', { id: item.id }, buyer.id), 'FORBIDDEN')
  assert.equal(f.env.call('user.listPublicContent', { userId: seller.id }, buyer.id).items.length, 0)
  assert.equal(f.env.call('market.list', { ownerId: seller.id }, buyer.id).items.length, 0)
  assert.equal(f.env.call('myContent.list', {}, seller.id).items.length, 1)
})

test('预约重试返回同一记录、阻止另一买家，接受与完成及通知均持久化', (t) => {
  const f = fixture(t), [seller, buyer, stranger] = f.users
  const item = f.env.call('market.create', sale, seller.id)
  const reservation = f.env.call('market.reserve', { id: item.id }, buyer.id)
  assert.equal(f.env.call('market.getCandidates', { id: item.id }, buyer.id).items[0].id, reservation.id)
  assert.equal(f.env.call('market.getCandidates', { id: item.id }, stranger.id).items.length, 0)
  assert.equal(f.env.call('market.reserve', { id: item.id }, buyer.id).id, reservation.id)
  failCode(() => f.env.call('market.reserve', { id: item.id }, stranger.id), 'CONFLICT')
  failCode(() => f.env.call('reservation.respond', { reservationId: reservation.id, accept: true }, buyer.id), 'FORBIDDEN')
  failCode(() => f.env.call('reservation.complete', { reservationId: reservation.id }, stranger.id), 'FORBIDDEN')
  const accepted = f.env.call('reservation.respond', { reservationId: reservation.id, accept: true }, seller.id)
  assert.equal(accepted.status, 'accepted')
  assert.equal(f.env.call('market.get', { id: item.id }, buyer.id).status, 'reserved')
  assert.equal(f.env.call('reservation.respond', { reservationId: reservation.id, accept: true }, seller.id).status, 'accepted')
  failCode(() => f.env.call('market.complete', { id: item.id }, seller.id), 'CONFLICT')
  assert.equal(f.env.call('reservation.complete', { reservationId: reservation.id }, buyer.id).status, 'completed')
  assert.equal(f.env.call('reservation.complete', { reservationId: reservation.id }, buyer.id).status, 'completed')
  f.reopen()
  assert.equal(f.env.call('market.get', { id: item.id }, seller.id).status, 'completed')
  assert.equal(f.env.call('market.getCandidates', { id: item.id }, seller.id).items[0].status, 'completed')
  assert.equal(f.env.call('market.getCandidates', { id: item.id }, buyer.id).items[0].status, 'completed')
  assert.equal(f.env.store.query('test.notifications', '1', [], 'seq DESC', 100).length, 3)
})

test('拒绝预约后商品仍可预约，关闭商品终止待处理预约且终态不可覆盖', (t) => {
  const f = fixture(t), [seller, buyer, stranger] = f.users
  const item = f.env.call('market.create', sale, seller.id)
  const first = f.env.call('market.reserve', { id: item.id }, buyer.id)
  assert.equal(f.env.call('reservation.respond', { reservationId: first.id, accept: false }, seller.id).status, 'rejected')
  assert.equal(f.env.call('market.get', { id: item.id }, seller.id).status, 'active')
  const second = f.env.call('market.reserve', { id: item.id }, stranger.id)
  f.env.call('market.close', { id: item.id }, seller.id)
  assert.equal(f.env.store.get('campus.reservations', second.id).status, 'cancelled')
  failCode(() => f.env.call('reservation.respond', { reservationId: second.id, accept: true }, seller.id), 'CONFLICT')
  failCode(() => f.env.call('market.update', { ...sale, id: item.id }, seller.id), 'CONFLICT')
  failCode(() => f.env.call('market.complete', { id: item.id }, seller.id), 'CONFLICT')
})

test('同一业务事务中通知失败回滚商品、预约和幂等回执', (t) => {
  const f = fixture(t), [seller, buyer] = f.users
  const item = f.env.call('market.create', sale, seller.id)
  const service = createMarketService({ ...f.env, notify: () => { throw new Error('disk failure') } })
  assert.throws(() => service.invoke('market.reserve', { id: item.id, idempotencyKey: 'reserve-fail' }, { userId: buyer.id }), /disk failure/)
  assert.equal(f.env.store.query('campus.reservations', '1', [], 'seq DESC', 100).length, 0)
  assert.equal(f.env.store.receipt(buyer.id, 'market.reserve', 'reserve-fail'), undefined)
  const reservation = f.env.call('market.reserve', { id: item.id }, buyer.id)
  assert.throws(() => service.invoke('reservation.respond', { reservationId: reservation.id, accept: true }, { userId: seller.id }), /disk failure/)
  assert.equal(f.env.store.get('campus.reservations', reservation.id).status, 'pending')
  assert.equal(f.env.store.get('campus.market', item.id).status, 'active')
})

test('本地账号个人资料仅接受白名单，不允许抬升权限或使用他人头像', (t) => {
  const f = fixture(t), [seller, buyer] = f.users
  const image = f.upload(seller.id, 'avatar')
  const profile = f.env.call('user.updateProfile', { nickname: '新的昵称', skillTags: ['修电脑', '修电脑'], avatarImageId: image.imageId, roles: ['admin'], passwordHash: 'forged', campusId: 'forged' }, seller.id)
  assert.equal(profile.avatarUrl, image.url)
  assert.deepEqual(profile.skillTags, ['修电脑'])
  assert.equal(profile.roles, undefined)
  assert.equal(profile.passwordHash, undefined)
  assert.deepEqual(f.env.accounts.getUser(seller.id).roles, [])
  assert.equal(f.env.accounts.getUser(seller.id).campusId, 'local-campus')
  failCode(() => f.env.call('user.updateProfile', { avatarImageId: image.imageId }, buyer.id), 'FORBIDDEN')
  failCode(() => f.env.call('user.updateProfile', { skillTags: [{ name: 'x' }] }, seller.id), 'INVALID_ARGUMENT')
  assert.ok(f.env.accounts.invoke('auth.login', { type: 'h5', studentId: 'student1', password: 'campus-password-123' }).token)
})

test('求购规则匹配排除私有/自己/超预算候选，分页游标绑定身份和筛选', (t) => {
  const f = fixture(t), [seller, buyer, stranger] = f.users
  const requirement = f.env.call('market.create', buy, buyer.id)
  f.env.call('market.create', sale, seller.id)
  f.env.call('market.create', sale, stranger.id)
  f.env.call('market.create', { ...sale, visibility: 'private' }, seller.id)
  f.env.call('market.create', { ...sale, priceCents: 5001 }, seller.id)
  f.env.call('market.create', sale, buyer.id)
  const first = f.env.call('market.matchCandidates', { buyId: requirement.id, pageSize: 1 }, buyer.id)
  assert.equal(first.items.length, 1)
  assert.deepEqual(first.items[0].reasons, ['同类别', '同校区', '价格在预算内', '包含求购关键词'])
  const second = f.env.call('market.matchCandidates', { buyId: requirement.id, pageSize: 1, cursor: first.nextCursor }, buyer.id)
  assert.equal(second.items.length, 1)
  assert.notEqual(second.items[0].id, first.items[0].id)
  assert.equal(second.nextCursor, null)
  failCode(() => f.env.call('market.matchCandidates', { buyId: requirement.id }, seller.id), 'FORBIDDEN')
  failCode(() => f.env.call('market.list', { cursor: first.nextCursor }, buyer.id), 'INVALID_ARGUMENT')
  failCode(() => f.env.call('market.matchCandidates', { buyId: requirement.id, cursor: first.nextCursor + 'x' }, buyer.id), 'INVALID_ARGUMENT')
})

test('收藏唯一且持久，公开发布改私有后不向原收藏者泄漏', (t) => {
  const f = fixture(t), [seller, buyer] = f.users
  const item = f.env.call('market.create', sale, seller.id)
  const p = { contentType: 'market', contentId: item.id, selected: true }
  f.env.call('favorite.set', p, buyer.id)
  f.env.call('favorite.set', p, buyer.id)
  assert.equal(f.env.call('favorite.list', {}, buyer.id).items.length, 1)
  assert.equal(f.env.call('favorite.list', {}, seller.id).items.length, 0)
  f.reopen()
  assert.equal(f.env.call('favorite.list', {}, buyer.id).items.length, 1)
  f.env.call('market.update', { ...sale, id: item.id, visibility: 'private' }, seller.id)
  assert.equal(f.env.call('favorite.list', {}, buyer.id).items.length, 0)
})

test('参考估价保留规则声明，不读取照片猜测，发布幂等编号禁止变更参数', (t) => {
  const f = fixture(t), [seller, buyer] = f.users
  const image = f.upload(seller.id)
  const estimate = f.env.call('appraisal.estimate', { imageId: image.imageId, category: '教材', condition: '八成新' }, seller.id)
  assert.equal(estimate.minCents, 1600)
  assert.equal(estimate.maxCents, 6400)
  assert.equal(estimate.basis.rule, '类别+成色示例估价')
  failCode(() => f.env.call('appraisal.estimate', { imageId: image.imageId }, buyer.id), 'FORBIDDEN')
  const params = { ...sale, appraisal: estimate, idempotencyKey: 'post-once' }
  const first = f.env.call('market.create', params, seller.id)
  assert.equal(f.env.call('market.create', params, seller.id).id, first.id)
  failCode(() => f.env.call('market.create', { ...params, priceCents: 5000 }, seller.id), 'CONFLICT')
  failCode(() => f.env.call('market.create', { ...buy, appraisal: estimate }, seller.id), 'INVALID_ARGUMENT')
  failCode(() => f.env.call('market.create', { ...sale, appraisal: { ...estimate, note: 'AI保证成交价' } }, seller.id), 'INVALID_ARGUMENT')
})
