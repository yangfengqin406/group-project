import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ref, reactive, watch, nextTick } from 'vue'

const source = readFileSync(new URL('../src/pages/home/index.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\r?\n/gm, '')
const flush = async () => { await nextTick(); await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick() }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const pageResult = (items, nextCursor = null) => ({ items, nextCursor })
const post = (id, createdAt = '2026-10-24T00:00:00Z', status = 'active') =>
  ({ id, title: id, createdAt, status })
const saved = (id) => ({ contentType: 'market', contentId: id, content: post(id) })
const plain = (value) => JSON.parse(JSON.stringify(value))

function home(services = {}) {
  const hooks = {}, routes = []
  const session = reactive({ user: { id: 'a' } })
  const context = vm.createContext({
    ref, watch, session, config: { apiMode: 'mock' },
    onShow: (fn) => { hooks.show = fn }, onHide: (fn) => { hooks.hide = fn },
    onUnload: (fn) => { hooks.unload = fn },
    demoUsers: () => [], switchDemoUser: () => {}, resetDemo: () => {},
    errorText: (error) => error.message,
    contentNames: { market: '二手', plan: '搭子', help: '互助', lost_found: '失物' },
    contentUrl: (type, id) => `/content?type=${type}&id=${id}`,
    user: { getProfile: async () => ({ id: session.user.id }) },
    myContent: { list: async () => pageResult([post(`post-${session.user.id}`)]) },
    favorite: { list: async () => pageResult([saved(`fav-${session.user.id}`)]) },
    uni: { navigateTo: (options) => routes.push(options) },
    ...services
  })
  vm.runInContext(`${script}\nglobalThis.subject = {
    load, setFilter, openFav, profile, items, stats, favorites, activities,
    loading, favLoading, error
  }`, context)
  return { ...context.subject, session, hooks, routes }
}

test('B小屋：换账号时立即清空旧账号统计、收藏和近期发布', async () => {
  const page = home()
  page.hooks.show(); await flush()
  assert.equal(page.stats.value.total, 1)
  assert.equal(page.favorites.value[0].contentId, 'fav-a')
  page.hooks.hide()
  page.session.user = { id: 'b' }
  await flush()
  assert.deepEqual(plain(page.stats.value), { total: 0, active: 0, completed: 0 })
  assert.equal(page.favorites.value.length, 0)
  assert.equal(page.activities.value.length, 0)
})

test('B小屋：旧账号分页统计晚到，不覆盖新账号也不继续发后续请求', async () => {
  const slow = deferred(), favoriteOwners = [], cursors = []
  let page
  page = home({
    myContent: { list: async (params) => {
      cursors.push(params.cursor)
      if (params.pageSize && page.session.user.id === 'a') return slow.promise
      return pageResult([post(`post-${page.session.user.id}`)])
    } },
    favorite: { list: async () => {
      favoriteOwners.push(page.session.user.id)
      return pageResult([saved(`fav-${page.session.user.id}`)])
    } }
  })
  page.hooks.show(); await flush()
  page.session.user = { id: 'b' }; await flush()
  slow.resolve(pageResult([post('old-a'), post('old-a-2')], 'old-next'))
  await flush()
  assert.equal(page.stats.value.total, 1)
  assert.equal(page.activities.value[0].title, 'post-b')
  assert.deepEqual(favoriteOwners, ['a', 'b'])
  assert.ok(!cursors.includes('old-next'))
})

test('B小屋：旧账号收藏响应晚到，不泄露到新账号', async () => {
  const slow = deferred()
  let page
  page = home({ favorite: { list: async () =>
    page.session.user.id === 'a' ? slow.promise : pageResult([saved('fav-b')]) } })
  page.hooks.show(); await flush()
  page.session.user = { id: 'b' }; await flush()
  slow.resolve(pageResult([saved('private-fav-a')]))
  await flush()
  assert.deepEqual(plain(page.favorites.value).map((f) => f.contentId), ['fav-b'])
  assert.equal(page.error.value, '')
})

test('B小屋：离开再进入期间，旧请求结束不会关掉新请求的收藏读取状态', async () => {
  const first = deferred(), second = deferred()
  let calls = 0
  const page = home({ favorite: { list: () => (++calls === 1 ? first : second).promise } })
  page.hooks.show(); await flush()
  assert.equal(page.favLoading.value, true)
  page.hooks.hide()
  assert.equal(page.favLoading.value, false)
  page.hooks.show(); await flush()
  first.resolve(pageResult([saved('old')]))
  await flush()
  assert.equal(page.favLoading.value, true)
  assert.equal(page.favorites.value.length, 0)
  second.resolve(pageResult([saved('current')]))
  await flush()
  assert.equal(page.favLoading.value, false)
  assert.equal(page.favorites.value[0].contentId, 'current')
})

test('B小屋：近期发布从本人全部分页生成，不随当前筛选变化、不伪造收藏时间', async () => {
  const requests = []
  const page = home({
    myContent: { list: async (params) => {
      requests.push({ ...params })
      if (!params.pageSize) return pageResult([post('筛选首屏')])
      if (!params.cursor) return pageResult([
        post('较早发布', '2026-10-20T00:00:00Z', 'completed')
      ], 'page-2')
      return pageResult([post('较新发布', '2026-10-23T00:00:00Z', 'open')])
    } },
    favorite: { list: async () => pageResult([saved('收藏不代表新发布')]) }
  })
  page.setFilter('market'); await flush()
  assert.deepEqual(plain(page.stats.value), { total: 2, active: 1, completed: 1 })
  assert.deepEqual(plain(page.activities.value).map((a) => a.title), ['较新发布', '较早发布'])
  assert.ok(plain(page.activities.value).every((a) => a.label === '发布'))
  assert.ok(requests.filter((r) => r.pageSize).every((r) => !r.contentType))
})

test('B小屋：收藏遍历后续页，出错明确显示失败，不伪造空收藏成功', async () => {
  let fail = false
  const page = home({ favorite: { list: async ({ cursor }) => {
    if (fail) throw new Error('收藏服务暂不可用')
    return cursor ? pageResult([saved('第二页')]) : pageResult([saved('第一页')], 'next')
  } } })
  page.hooks.show(); await flush()
  assert.deepEqual(plain(page.favorites.value).map((f) => f.contentId), ['第一页', '第二页'])
  fail = true
  await page.load()
  assert.equal(page.error.value, '收藏服务暂不可用')
  assert.equal(page.favLoading.value, false)
  assert.equal(page.favorites.value.length, 0)
})

test('B小屋：收藏使用类型和内容编号打开详情，兼容契约没有id的条目', () => {
  const page = home()
  page.openFav({ contentType: 'market', contentId: 'sale-1' })
  page.openFav({ contentType: 'lost_found', contentId: 'lost-2' })
  assert.deepEqual(page.routes.map((r) => r.url), [
    '/content?type=market&id=sale-1', '/content?type=lost_found&id=lost-2'
  ])
})
