import test from 'node:test'
import assert from 'node:assert/strict'
import { createNeighborGreetings } from '../src/utils/plaza-neighbors.js'

const player = { x: 0.5, y: 0.5 }
const neighbor = (id, x = 0.51, y = 0.5) => ({ id, position: { x, y } })

test('only nearby fictional neighbors greet; the nearest greets first', () => {
  const greetings = createNeighborGreetings()
  assert.equal(greetings.encounter(player, [neighbor('other-user'), neighbor('capybara', 0.8)], 0), null)
  assert.equal(greetings.encounter(player, [neighbor('capybara', 0.53), neighbor('mushroom', 0.51)], 1), 'mushroom')
})

test('encounters have per-neighbor cooldown and do not create a stream of popups', () => {
  const greetings = createNeighborGreetings()
  assert.equal(greetings.encounter(player, [neighbor('capybara')], 0), 'capybara')
  assert.equal(greetings.encounter(player, [neighbor('squirrel')], 1000), null)
  assert.equal(greetings.encounter(player, [neighbor('squirrel')], 16000), 'squirrel')
  assert.equal(greetings.encounter(player, [neighbor('capybara')], 59000), null)
  assert.equal(greetings.encounter(player, [neighbor('capybara')], 60000), 'capybara')
})

test('manually greeting also suppresses an immediate repeated encounter', () => {
  const greetings = createNeighborGreetings()
  greetings.acknowledge('capybara', 10000)
  assert.equal(greetings.encounter(player, [neighbor('capybara')], 30000), null)
  assert.equal(greetings.encounter(player, [neighbor('capybara')], 70000), 'capybara')
  assert.equal(greetings.encounter(null, [neighbor('capybara')], 90000), null)
})
