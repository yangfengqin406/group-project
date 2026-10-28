import test from 'node:test'
import assert from 'node:assert/strict'
import { decideContribution, contributionDayKey, contributionPairKey, getContributionSummary } from '../src/domain/rewards/contribution.js'

const DAY = 86400000
const start = Date.parse('2026-10-27T15:59:59.000Z')
const publication = (sourceId, changes = {}) => ({ userId: 'alice', kind: 'publish', sourceType: 'help', sourceId,
  title: `校园求助${sourceId}`, body: '一起解决校园生活中的问题', ...changes })
const completion = (sourceId, other, kind = 'help_helper') => ({ userId: 'alice', kind, sourceType: 'help', sourceId,
  pairKey: contributionPairKey('alice', other) })

test('公开发布跨模块共享前三篇额度，北京时间跨日刷新而旧事件不补领', () => {
  const history = []
  for (const [index, sourceType] of ['help', 'market', 'plan', 'lostFound'].entries())
    history.push(decideContribution(publication(String(index), { sourceType }), history, start))
  assert.deepEqual(history.map(event => event.delta), [5, 5, 5, 0])
  assert.equal(history[3].reason, 'daily_limit')
  assert.equal(contributionDayKey(start), '2026-10-27')
  assert.equal(contributionDayKey(start + 1000), '2026-10-28')
  assert.equal(decideContribution(publication('3', { sourceType: 'lostFound' }), history, start + DAY).delta, 0)
  assert.equal(decideContribution(publication('next'), history, start + DAY).delta, 5)
})

test('同账号跨模块七天规范化同文不奖，私有发布不影响另一账号', () => {
  const original = decideContribution(publication('one', { title: ' ＡＢＣ  教材 ', body: '约在\n图书馆' }), [], start)
  const same = publication('two', { sourceType: 'market', title: 'abc 教材', body: '约在 图书馆' })
  assert.equal(decideContribution(same, [original], start + DAY).reason, 'duplicate_text')
  assert.equal(decideContribution(same, [original], start + 7 * DAY).delta, 5)
  assert.equal(decideContribution({ ...same, userId: 'bob' }, [original], start + DAY).delta, 5)
  const hidden = decideContribution(publication('private', { visibility: 'private' }), [], start)
  assert.equal(hidden.reason, 'not_public')
  assert.equal(decideContribution(publication('private'), [hidden], start + DAY).delta, 0)
})

test('互助作者与帮助者共享两次额度，同一双方每日一次，发布额度独立', () => {
  const first = decideContribution(completion('a', 'bob'), [], start)
  const second = decideContribution(completion('b', 'carol', 'help_author'), [first], start)
  const capped = decideContribution(completion('c', 'dora'), [first, second], start)
  assert.deepEqual([first.delta, second.delta, capped.delta], [15, 5, 0])
  assert.equal(capped.reason, 'daily_limit')
  const repeatedPair = decideContribution(completion('new', 'bob', 'help_author'), [first], start)
  assert.equal(repeatedPair.reason, 'pair_limit')
  assert.equal(contributionPairKey('bob', 'alice'), contributionPairKey('alice', 'bob'))
  assert.equal(decideContribution(publication('independent'), [first, second], start).delta, 5)
  assert.equal(decideContribution(completion('next-day', 'bob'), [first], start + DAY).delta, 15)
  assert.equal(decideContribution(completion('new', 'bob', 'help_author'), [first, repeatedPair], start + DAY).delta, 0)
})

test('重放返回独立旧决定，摘要只给最近20条且不暴露正文指纹', () => {
  const original = decideContribution(publication('one'), [], start)
  const snapshot = structuredClone(original)
  const replay = decideContribution(publication('one', { title: '改变输入也不能重新发奖' }), [original], start + DAY)
  assert.deepEqual(replay, original)
  replay.delta = 999
  assert.deepEqual(original, snapshot)
  const history = Array.from({ length: 25 }, (_, index) => decideContribution(publication(String(index)), [], start + index * DAY))
  const summary = getContributionSummary(history, start + 24 * DAY)
  assert.equal(summary.recent.length, 20)
  assert.equal(summary.recent[0].sourceId, '24')
  assert.equal(summary.recent[0].textKey, undefined)
  assert.deepEqual(summary.daily.publish, { awarded: 1, limit: 3 })
  summary.recent[0].delta = 900
  assert.equal(history[24].delta, 5)
})

test('拒绝无效日期、事件与伪造互助组合，不接受单人奖励', () => {
  assert.throws(() => contributionDayKey(NaN), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => contributionPairKey('alice', 'alice'), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => decideContribution(publication('one', { kind: 'chat' }), [], start), { code: 'INVALID_ARGUMENT' })
  assert.throws(() => decideContribution({ ...completion('a', 'bob'), pairKey: '["bob","carol"]' }, [], start), { code: 'INVALID_ARGUMENT' })
})
