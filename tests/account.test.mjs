import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Account } from '../lib/account.js'
import { SubscriptionError } from '../lib/http.js'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as codex from '../lib/providers/codex.js'

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const grant = () => ({ generation: randomUUID(), account: 'user', expiresAt: Date.now() + 3600000, accessToken: 'secret' })
async function fixture(t, overrides = {}, authorization = { cancel() {} }) {
  let record = { kind: 'grant', payload: grant() }, lock = Promise.resolve()
  const routeSets = []
  const credentials = {
    readRecord: async () => record,
    modifyRecord: (_key, mutate) => {
      const job = lock.then(async () => { const next = await mutate(record); record = next ?? record; return record })
      lock = job.catch(() => {}); return job
    },
    deleteRecord: async () => { await lock; record = undefined },
  }
  const driver = { platform: 'codex', key: 'subscription-manager/codex', label: 'Codex', parse: value => value,
    login: async () => grant(), refresh: async previous => ({ ...previous, expiresAt: Date.now() + 3600000 }),
    models: async () => ({ listModels: async () => [{ provider: 'subscription-codex', id: 'model', name: 'Model' }],
      prepareCall: async () => ({ model: { provider: 'subscription-codex', id: 'model', name: 'Model', context: { contextWindow: 1000 } }, stream: async function* () { yield { type: 'finish', reason: { kind: 'stop' } } } }),
    }), usage: async () => ({ supported: true, windows: [{ label: 'weekly', usedPercent: 42 }], fetchedAt: 1 }), ...overrides }
  const account = new Account(driver, credentials, authorization, { registerAdapter: routes => {
    routeSets.push(routes); const dispose = () => routeSets.push([]); dispose.replace = routes => routeSets.push(routes); return dispose
  } }, 300000)
  t.after(() => account.close())
  return { account, routeSets, credentials, set: value => { record = value }, get: () => record, driver }
}

test('restoring a stored login publishes native models and keeps credentials out of the view', async t => {
  const { account, routeSets } = await fixture(t)
  await account.sync()
  assert.deepEqual(routeSets.at(-1), ['subscription-codex'])
  assert.equal((await account.resolveModel('subscription-codex', 'model')).context.contextWindow, 1000)
  assert.equal(JSON.stringify(account.snapshot()).includes('secret'), false)
  assert.equal(account.providerRetryPolicy().maxRetries, 0)
})

for (const afterLogin of [false, true]) test(`${afterLogin ? 'login' : 'restore'} catalog reads wait for initial usage instead of returning a models-only account`, async t => {
  const started = deferred(), pending = deferred()
  t.after(() => pending.resolve())
  const outcome = deferred()
  const { account, set } = await fixture(t, { usage: async () => { started.resolve(); await pending.promise; return { supported: true, windows: [{ label: 'weekly', usedPercent: 7 }], fetchedAt: 1 } } }, { begin: () => outcome.promise, cancel() {} })
  if (afterLogin) { set(undefined); account.login(); set({kind:'grant',payload:grant()}); outcome.resolve({status:'authorized'}) }
  const initial = afterLogin ? undefined : account.sync()
  await started.promise
  let settled = false
  const catalog = account.sync().then(() => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  try { assert.equal(settled, false) }
  finally { pending.resolve() }
  await Promise.all([initial, catalog])
  assert.equal(account.snapshot().usage.windows[0].usedPercent, 7)
})

test('failed usage refresh retains previous data and does not remove model routes', async t => {
  const { account, driver, routeSets } = await fixture(t)
  await account.sync()
  driver.usage = async () => { throw new SubscriptionError('network') }
  await account.refresh('usage')
  assert.equal(account.snapshot().usage.windows[0].usedPercent, 42)
  assert.equal(account.snapshot().usageError, 'network')
  assert.deepEqual(routeSets.at(-1), ['subscription-codex'])
})

test('a public ChatGPT login stays visible for logout when Codex mode requires reauthorization', async t => {
  const http=async()=>assert.fail('an old grant must not be sent upstream')
  const {account,set,get,routeSets}=await fixture(t,{parse:value=>codex.Grant.parse(value),models:(value,signal)=>codex.models(value,http,signal),usage:value=>codex.usage(value,http,new AbortController().signal)})
  const old={...grant(),version:3,platform:'codex',subject:'user',clientId:'oaiapp_old',hostId:'urn:uuid:old',idToken:'old-id',refreshToken:'old-refresh',scopes:['chatgpt.tokens.use.direct']}
  set({kind:'grant',payload:old})
  await account.sync()
  assert.equal(account.snapshot().authenticated,true)
  assert.equal(account.snapshot().modelsError,'reauth-required')
  assert.equal(account.snapshot().usageError,'reauth-required')
  assert.equal(routeSets.length,0)
  assert.equal(get().payload.version,3)
  assert.equal(get().payload.refreshToken,'old-refresh')
})

test('logout waits for a refresh response and prevents it from recreating the record', async t => {
  const { account, driver, get, set, routeSets } = await fixture(t)
  await account.sync()
  const waiting = deferred(), release = deferred()
  set({ kind: 'grant', payload: { ...get().payload, expiresAt: 1 } })
  driver.refresh = async previous => { waiting.resolve(); await release.promise; return { ...previous, accessToken: 'rotated', expiresAt: Date.now() + 3600000 } }
  const refresh = account.refresh('usage')
  await waiting.promise
  const logout = account.logout()
  release.resolve()
  await Promise.all([refresh, logout])
  assert.equal(get(), undefined); assert.equal(account.snapshot().authenticated, false); assert.deepEqual(routeSets.at(-1), [])
})

test('new account drops old catalog while superseded discovery cannot publish', async t => {
  const { account, driver, set } = await fixture(t)
  await account.sync()
  const waiting = deferred(), release = deferred()
  driver.models = async () => { waiting.resolve(); await release.promise; return { listModels: async () => [{ id: 'old', name: 'Old' }] } }
  const old = account.refresh('models')
  await waiting.promise
  set({ kind: 'grant', payload: grant() })
  driver.models = async () => ({ listModels: async () => [{ id: 'new', name: 'New' }] })
  await account.sync()
  release.resolve(); await old
  assert.deepEqual(account.snapshot().models.map(row => row.id), ['new'])
})

test('same-generation refresh calls coalesce and disposal rejects new operations', async t => {
  const { account, driver } = await fixture(t)
  await account.sync()
  const release = deferred(); let count = 0
  driver.usage = async () => { count++; await release.promise; return { supported: false, windows: [], fetchedAt: 2 } }
  const first = account.refresh('usage'), second = account.refresh('usage')
  release.resolve(); await Promise.all([first, second])
  assert.equal(count, 1)
  await account.close()
  assert.throws(() => account.refresh('usage'), error => error.code === 'unloading')
})

test('a prepared request cannot run after logout even if it has not started streaming', async t => {
  const { account } = await fixture(t)
  await account.sync()
  const prepared = await account.prepareCall('subscription-codex', 'model')
  await account.logout()
  await assert.rejects(async () => { for await (const _chunk of prepared.stream({ provider: 'subscription-codex', model: 'model', messages: [] })) {} })
})

test('failed credential deletion withdraws routes and cannot restore the stored login until deletion is retried', async t => {
  const { account, credentials, routeSets } = await fixture(t)
  await account.sync()
  const remove = credentials.deleteRecord
  credentials.deleteRecord = async () => { throw new Error('disk failure') }
  await assert.rejects(account.logout(), error => error.code === 'storage-failed')
  assert.deepEqual(routeSets.at(-1), [])
  await assert.rejects(account.sync(), error => error.code === 'storage-failed')
  credentials.deleteRecord = remove
  await account.logout()
  await account.sync()
  assert.equal(account.snapshot().authenticated, false)
})

test('secondary credential renewal reaches usage readers in the same refresh', async t => {
  const { account, driver, set, get } = await fixture(t)
  set({ kind:'grant',payload:{...get().payload, secondary:'old'} })
  driver.needsRefresh = value => value.secondary === 'old'
  driver.refresh = async value => ({...value,secondary:'rotated',expiresAt:value.expiresAt+60000})
  driver.usage = async value => { assert.equal(value.secondary,'rotated'); return {supported:false,windows:[],fetchedAt:1} }
  await account.sync()
  assert.equal(account.snapshot().usageError,undefined)
  assert.equal(get().payload.secondary,'rotated')
  assert.equal(account.snapshot().tokenExpiresAt,get().payload.expiresAt)
})

test('native LLM registry publishes account models and signals their removal on logout', async t => {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  t.after(() => ctx.fiber.dispose())
  const { driver, credentials } = await fixture(t)
  const account = new Account(driver, credentials, {cancel(){}}, ctx.llm, 300000)
  t.after(() => account.close())
  const observed = []
  ctx.on('llm/adapters-updated', () => { observed.push(ctx.llm.listProviders().map(row=>row.id)) })
  await account.sync()
  assert.equal((await ctx.llm.listModels('subscription-codex')).some(row=>row.provider==='subscription-codex'&&row.id==='model'),true)
  await account.logout()
  assert.deepEqual(observed,[['subscription-codex'],[]])
  assert.deepEqual(ctx.llm.listProviders(),[])
})
