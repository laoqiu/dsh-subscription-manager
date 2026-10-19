import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { Grant, hostId, login, models, refresh, usage, verify } from '../lib/providers/chatgpt.js'

export const grant = () => ({ version: 3, platform: 'codex', generation: randomUUID(), subject: 'user', account: 'user@example.test', clientId: 'oaiapp_test', hostId: `urn:uuid:${randomUUID()}`, scopes: ['chatgpt.tokens.use.direct'], accessToken: 'opaque-access-token', refreshToken: 'secret-refresh', idToken: 'signed-id', expiresAt: Date.now() + 3_600_000 })
const response = data => ({ ok: true, status: 200, json: async () => data })
const tokens = () => ({ access_token: 'opaque-access-token', refresh_token: 'secret-refresh', id_token: 'signed-id', expires_in: 3600, scope: 'openid chatgpt.tokens.use.direct offline_access' })
const receive = async () => ({params:new URLSearchParams('code=fixture&client_id=oaiapp_test'),redirect:'http://127.0.0.1:12345/auth/callback'})
const identity = async () => ({subject:'user',account:'user@example.test'})

test('ChatGPT login binds dynamic registration, issued client, PKCE, nonce and exact loopback URI', async t => {
  const controller = new AbortController()
  t.after(() => controller.abort())
  let opened
  const notice = new Promise(resolve => { opened = resolve })
  const host = grant().hostId
  const http = async (url, init) => {
    assert.equal(url, 'https://auth.openai.com/api/accounts/oauth/token')
    const form = new URLSearchParams(init.body)
    assert.equal(form.get('client_id'), 'oaiapp_test')
    assert.equal(form.get('resource'), 'https://api.openai.com/v1')
    assert.equal(form.get('code'), 'code')
    assert.equal(form.get('redirect_uri'), loginUrl.searchParams.get('redirect_uri'))
    assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'), loginUrl.searchParams.get('code_challenge'))
    return response(tokens())
  }
  let verified = false
  const operation = login({ signal: controller.signal, notify: opened }, http, host, async (token, audience, nonce) => {
    assert.equal(token, 'signed-id'); assert.equal(audience, 'oaiapp_test'); assert.equal(nonce, loginUrl.searchParams.get('nonce')); verified = true
    return identity()
  })
  const loginUrl = new URL((await notice).url)
  assert.equal(loginUrl.searchParams.get('client_id'), 'dynamic_agent_client')
  assert.equal(loginUrl.pathname, '/api/accounts/authorize')
  assert.equal(loginUrl.searchParams.get('ext_agent_host_id'),host)
  assert.equal(loginUrl.searchParams.get('agent_name_hint'),'DeepSeek Harness')
  assert.ok(loginUrl.searchParams.get('scope').split(' ').includes('chatgpt.tokens.use.direct'))
  assert.equal(loginUrl.searchParams.has('originator'),false)
  const url = new URL(loginUrl.searchParams.get('redirect_uri'))
  assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/auth/callback')
  url.search = new URLSearchParams({ code: 'code', state: 'wrong', client_id:'oaiapp_test' })
  assert.equal((await fetch(url)).status, 400)
  url.searchParams.set('state', loginUrl.searchParams.get('state'))
  const page = await fetch(url, { headers: { 'accept-language': 'zh-CN' } })
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('cache-control'), 'no-store')
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
  const html = await page.text()
  assert.match(html, /<title>授权成功<\/title>/); assert.match(html, /客户端正在验证/)
  assert.doesNotMatch(html, /DeepSeek Harness|DSH/)
  assert.equal(html.includes('oaiapp_test'), false)
  assert.equal(html.includes(loginUrl.searchParams.get('state')), false)
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1]
  assert.ok(page.headers.get('content-security-policy').includes(`sha256-${createHash('sha256').update(style).digest('base64')}`))
  const value = await operation
  assert.equal(verified, true); assert.equal(value.accessToken,'opaque-access-token'); assert.equal(value.version,3)
  await assert.rejects(fetch(url))
})

test('cancel releases the bound callback without a token exchange', async () => {
  const controller = new AbortController()
  let opened
  const notice = new Promise(resolve => { opened = resolve })
  const operation = login({ signal: controller.signal, notify: opened }, async () => assert.fail('must not exchange'), grant().hostId)
  const url = new URL((await notice).url)
  controller.abort()
  await assert.rejects(operation, error => error.code === 'cancelled')
  await assert.rejects(fetch(url.searchParams.get('redirect_uri')))
})

test('OIDC failures cannot turn a decoded token into a valid grant', async () => {
  await assert.rejects(verify('unverified-token', 'client', 'nonce'))
  await assert.rejects(login({signal:new AbortController().signal,notify(){}},async()=>response(tokens()),grant().hostId,async()=>{throw new Error('bad signature')},receive),error=>error.code==='auth-failed')
})

test('new registration requires an issued client id before token exchange', async () => {
  for (const client of ['', 'dynamic_agent_client', 'app_legacy']) {
    await assert.rejects(login({signal:new AbortController().signal,notify(){}},async()=>assert.fail('no issued client'),grant().hostId,identity,async()=>({...await receive(),params:new URLSearchParams({code:'code',client_id:client})})),error=>error.code==='auth-failed')
  }
})

test('identity without the direct plan scope cannot authorize inference', async () => {
  await assert.rejects(login({signal:new AbortController().signal,notify(){}},async()=>response({...tokens(),scope:'openid profile email'}),grant().hostId,identity,receive),error=>error.code==='denied')
})

test('host identity is stable across logins and malformed stored state is not overwritten', async () => {
  const retained='urn:uuid:98586b52-17d2-4ab0-9b51-6b6953dadc48'
  let record={kind:'grant',payload:{version:1,hostId:retained}}
  const credentials={modifyRecord:async(_key,mutate)=>{record=await mutate(record)??record;return record}}
  assert.equal(await hostId(credentials),retained)
  record=undefined
  const first=await hostId(credentials)
  assert.match(first,/^urn:uuid:/); assert.equal(await hostId(credentials),first)
  record={kind:'grant',payload:{version:1,hostId:'invalid'}}
  await assert.rejects(hostId(credentials))
  assert.equal(record.payload.hostId,'invalid')
})

test('discovery uses the public account catalog, preserving order and only list visibility', async () => {
  const rows = await models(grant(), async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/models')
    assert.equal(init.headers.authorization, 'Bearer opaque-access-token')
    assert.equal(init.headers['chatgpt-account-id'],undefined)
    return response({ models: [{ slug: 'visible', display_name: 'Visible', visibility: 'list' }, { slug: 'hidden', visibility: 'hide' }, {slug:'unlisted',visibility:'other'}] })
  }, new AbortController().signal)
  assert.deepEqual(rows.map(row => row.slug), ['visible'])
  await assert.rejects(models(grant(), async () => response({ data: [{ id: 'wrong-key-catalog' }] }), new AbortController().signal))
})

test('public sign-in does not invent quota windows or subscription expiration', async () => {
  const value=await usage(grant())
  assert.equal(value.supported,false); assert.deepEqual(value.windows,[])
  assert.equal(value.url,'https://chatgpt.com/settings/usage')
  assert.equal(value.subscriptionEndsAt,undefined)
})

test('refresh rotates tokens, scopes and expiry with the issued client and original identity', async () => {
  const previous = grant()
  const next = await refresh(previous, async (url, init) => {
    assert.equal(url,'https://auth.openai.com/api/accounts/oauth/token')
    const form=new URLSearchParams(init.body)
    assert.equal(form.get('refresh_token'),previous.refreshToken)
    assert.equal(form.get('client_id'),previous.clientId)
    assert.equal(form.get('resource'),'https://api.openai.com/v1')
    assert.equal(form.has('scope'),false)
    return response({...tokens(),id_token:undefined,access_token:'new-access',refresh_token:'new-refresh',expires_in:600})
  }, new AbortController().signal)
  assert.equal(next.generation, previous.generation); assert.equal(next.subject, previous.subject)
  assert.equal(next.refreshToken, 'new-refresh'); assert.equal(next.accessToken,'new-access')
  assert.equal(next.idToken,previous.idToken); assert.ok(next.expiresAt<previous.expiresAt)
})

test('incomplete or reduced-scope refresh replies do not replace a token set', async () => {
  const previous=grant()
  for (const change of [{refresh_token:undefined},{expires_in:undefined},{scope:undefined},{scope:'openid'}]) {
    await assert.rejects(refresh(previous,async()=>response({...tokens(),id_token:undefined,...change}),new AbortController().signal))
    assert.equal(previous.refreshToken,'secret-refresh')
  }
  await assert.rejects(refresh(previous,async()=>response({...tokens(),id_token:'unverified'}),new AbortController().signal),error=>error.code==='auth-failed')
})
