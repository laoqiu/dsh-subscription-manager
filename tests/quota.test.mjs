import test from 'node:test'
import assert from 'node:assert/strict'
import { remainingPercent } from '../lib/protocol.js'

test('quota presentation shows 93 percent available when Codex reports 7 percent used', () => {
  assert.equal(remainingPercent({label:'weekly',usedPercent:7}),93)
  assert.equal(remainingPercent({label:'weekly',usedPercent:93}),7)
  assert.equal(remainingPercent({label:'weekly',usedPercent:0}),100)
  assert.equal(remainingPercent({label:'weekly',usedPercent:100}),0)
  assert.equal(remainingPercent({label:'weekly',usedPercent:105}),-5)
})

test('remaining quota uses valid count totals without inventing percentages for unknown or unlimited windows', () => {
  assert.equal(remainingPercent({label:'requests',used:7,limit:100}),93)
  assert.equal(remainingPercent({label:'requests',used:1,limit:0}),undefined)
  assert.equal(remainingPercent({label:'requests',used:7}),undefined)
  assert.equal(remainingPercent({label:'requests',unlimited:true,usedPercent:0}),undefined)
})
