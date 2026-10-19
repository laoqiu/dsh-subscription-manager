import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import * as codex from '../lib/providers/codex.js'
import * as chatgpt from '../lib/providers/chatgpt.js'
import { callback } from '../lib/oauth.js'
const jwt = claims => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`
const grant = () => ({version:2,platform:'codex',generation:randomUUID(),subject:'user',account:'user@example.test',accountId:'account-test',accessToken:jwt({exp:2000000000,'https://api.openai.com/auth':{chatgpt_account_id:'account-test'}}),refreshToken:'secret-refresh',idToken:'signed-id',expiresAt:Date.now()+3600000})
const publicGrant = () => ({version:3,platform:'codex',generation:randomUUID(),subject:'user',account:'user@example.test',clientId:'oaiapp_test',hostId:'urn:uuid:'+randomUUID(),idToken:'public-id',accessToken:'opaque-public-token',refreshToken:'public-refresh',scopes:['chatgpt.tokens.use.direct'],expiresAt:Date.now()+3600000})
const response = data => ({ok:true,status:200,json:async()=>data})
const receive = (session,build,ports,host) => {assert.deepEqual(ports,[1455,1457]);assert.equal(host,'localhost');return callback(session,build)}
const identity = async()=>({subject:'user',account:'user@example.test',accountId:'account-test'})

test('Codex login uses the fixed client, PKCE and exact callback without dynamic registration', async t=>{
  const controller=new AbortController();t.after(()=>controller.abort())
  let opened;const notice=new Promise(resolve=>{opened=resolve})
  const operation=codex.login({signal:controller.signal,notify:opened},async(url,init)=>{
    assert.equal(url,'https://auth.openai.com/oauth/token')
    const form=new URLSearchParams(init.body)
    assert.equal(form.get('client_id'),'app_EMoamEEZ73f0CkXaXp7hrann')
    assert.equal(form.get('redirect_uri'),auth.searchParams.get('redirect_uri'))
    assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'),auth.searchParams.get('code_challenge'))
    assert.equal(form.has('resource'),false)
    return response({access_token:grant().accessToken,refresh_token:'new-refresh',id_token:'signed-id',expires_in:3600})
  },async(token,audience,nonce)=>{assert.equal(token,'signed-id');assert.equal(audience,'app_EMoamEEZ73f0CkXaXp7hrann');assert.equal(nonce,auth.searchParams.get('nonce'));return identity()},receive)
  const auth=new URL((await notice).url)
  assert.equal(auth.pathname,'/oauth/authorize');assert.equal(auth.searchParams.get('originator'),'codex_cli_rs')
  assert.equal(auth.searchParams.has('ext_agent_host_id'),false)
  const url=new URL(auth.searchParams.get('redirect_uri'));url.search=new URLSearchParams({code:'code',state:auth.searchParams.get('state')})
  assert.equal((await fetch(url)).status,200)
  const value=await operation
  assert.equal(value.version,2);assert.equal(value.accountId,'account-test')
  await assert.rejects(fetch(url))
})

test('Codex cancellation closes its callback before any token exchange',async t=>{
  const controller=new AbortController();t.after(()=>controller.abort())
  let opened;const notice=new Promise(resolve=>{opened=resolve})
  const operation=codex.login({signal:controller.signal,notify:opened},async()=>assert.fail('no exchange'),undefined,receive)
  const auth=new URL((await notice).url);controller.abort()
  await assert.rejects(operation,error=>error.code==='cancelled')
  await assert.rejects(fetch(auth.searchParams.get('redirect_uri')))
})

test('Codex rejects mismatched account identity and unverified ID tokens',async()=>{
  const receive=async()=>({params:new URLSearchParams('code=fixture'),redirect:'http://localhost:1455/auth/callback'})
  const http=async()=>response({access_token:grant().accessToken,id_token:'unverified',refresh_token:'refresh',expires_in:3600})
  await assert.rejects(codex.login({signal:new AbortController().signal,notify(){}},http,async()=>({...await identity(),accountId:'different'}),receive),error=>error.code==='auth-failed')
  await assert.rejects(codex.login({signal:new AbortController().signal,notify(){}},http,undefined,receive),error=>error.code==='auth-failed')
})

test('Codex discovery uses its account header and live catalog with no public API fallback',async()=>{
  const rows=await codex.models(grant(),async(url,init)=>{
    assert.equal(url,'https://chatgpt.com/backend-api/codex/models?client_version=0.153.4')
    assert.equal(init.headers['chatgpt-account-id'],'account-test')
    return response({models:[{slug:'visible',visibility:'list'},{slug:'hidden',visibility:'hide'},{slug:'none',visibility:'none'}]})
  },new AbortController().signal,'0.153.4')
  assert.deepEqual(rows.map(row=>row.slug),['visible'])
})

test('Codex quota preserves zero, classifies weekly primary windows and resolves reset times',async()=>{
  const value=await codex.usage(grant(),async(url,init)=>{
    assert.equal(url,'https://chatgpt.com/backend-api/wham/usage')
    assert.equal(init.headers['chatgpt-account-id'],'account-test');assert.equal(init.headers.originator,'codex_cli_rs')
    return response({plan_type:'pro',rate_limit:{primary_window:{used_percent:82,limit_window_seconds:604800,reset_after_seconds:3600},secondary_window:{used_percent:0,limit_window_seconds:18000,reset_at:123}}})
  },new AbortController().signal)
  assert.equal(value.supported,true);assert.equal(value.plan,'pro');assert.equal(value.url,undefined)
  assert.equal(value.windows[0].kind,'weekly');assert.equal(value.windows[0].resetsAt,value.fetchedAt+3600000)
  assert.equal(value.windows[1].usedPercent,0);assert.equal(value.windows[1].resetsAt,123000)
  assert.equal(value.subscriptionEndsAt,undefined)
})

test('quota refusals and malformed responses stay errors instead of unsupported usage',async()=>{
  for(const [status,code] of [[401,'auth-required'],[403,'denied'],[404,'network']]) await assert.rejects(codex.usage(grant(),async()=>({ok:false,status}),new AbortController().signal),error=>error.code===code)
  await assert.rejects(codex.usage(grant(),async()=>response({unexpected:true}),new AbortController().signal),error=>error.code==='invalid-response')
  const value=await codex.usage(grant(),async()=>response({plan_type:'pro',rate_limit:{primary_window:{reset_at:123}}}),new AbortController().signal)
  assert.deepEqual(value.windows,[])
})

test('stored grants are readable in both modes but tokens never cross protocol families',async()=>{
  const stored=codex.Grant.parse(grant()),pub=codex.Grant.parse(publicGrant())
  const http=async()=>assert.fail('wrong token family must never reach HTTP')
  for(const operation of [()=>codex.models(pub,http,new AbortController().signal,'0.153.4'),()=>codex.usage(pub,http,new AbortController().signal),()=>codex.refresh(pub,http,new AbortController().signal)]) await assert.rejects(operation(),error=>error.code==='reauth-required')
  assert.throws(()=>codex.chatgptGrant(stored),error=>error.code==='reauth-required')
  assert.equal(codex.chatgptGrant(pub).version,3)
  assert.equal(chatgpt.Grant.safeParse(stored).success,false)
  assert.equal(codex.Grant.parse({...pub,version:1}).version,1)
})

test('Codex refresh keeps its client and account, accepting an unrotated refresh token and JWT expiry',async()=>{
  const previous=grant()
  const next=await codex.refresh(previous,async(url,init)=>{
    assert.equal(url,'https://auth.openai.com/oauth/token')
    assert.equal(new URLSearchParams(init.body).get('client_id'),'app_EMoamEEZ73f0CkXaXp7hrann')
    return response({access_token:previous.accessToken})
  },new AbortController().signal)
  assert.equal(next.expiresAt,2000000000000);assert.equal(next.refreshToken,previous.refreshToken);assert.equal(next.generation,previous.generation)
  await assert.rejects(codex.refresh(previous,async()=>response({access_token:jwt({exp:2000000000,'https://api.openai.com/auth':{chatgpt_account_id:'different'}})}),new AbortController().signal),error=>error.code==='auth-failed')
})
