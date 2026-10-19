import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { device } from '../lib/device.js'
import * as copilot from '../lib/providers/copilot.js'
import * as grok from '../lib/providers/grok.js'
import { json } from '../lib/http.js'

const ok = data => ({ok:true,status:200,json:async()=>data})
const signal = () => new AbortController().signal
const base = () => ({version:1,generation:randomUUID(),account:'user',accessToken:'access',expiresAt:Date.now()+3600000})

test('device authorization exposes only a short user code and respects server polling',async()=>{
  const calls=[],notices=[]
  const value=await device({signal:signal(),notify:value=>notices.push(value)},async(url,init)=>{
    calls.push({url,init})
    return url.endsWith('/device') ? ok({device_code:'secret-device',user_code:'ABCD',verification_uri:'https://example.test/verify',interval:0,expires_in:30}) : ok({access_token:'account-token'})
  },{clientId:'client',scope:'read',start:'https://example.test/device',token:'https://example.test/token',verificationOrigin:'https://example.test'})
  assert.equal(value.access_token,'account-token');assert.equal(notices[0].code,'ABCD');assert.equal(JSON.stringify(notices).includes('secret-device'),false)
  assert.equal(new URLSearchParams(calls[1].init.body).get('device_code'),'secret-device')
})

test('device authorization rejects a verification page outside the provider origin',async()=>{
  await assert.rejects(device({signal:signal(),notify:()=>assert.fail('no URL may escape')},async()=>ok({device_code:'secret',user_code:'code',verification_uri:'https://attacker.test',expires_in:30}),{clientId:'client',scope:'read',start:'https://example.test/device',token:'https://example.test/token',verificationOrigin:'https://example.test'}),error=>error.code==='invalid-response')
})

test('Copilot exchanges short-lived tokens and selects only supported account chat models',async()=>{
  const grant={...base(),platform:'copilot',githubToken:'github'}
  const renewed=await copilot.refresh(grant,async(url,init)=>{assert.match(url,/copilot_internal\/v2\/token$/);assert.equal(init.headers.authorization,'token github');return ok({token:'rotated',expires_at:2000000000})},signal(),'1.107.0')
  assert.equal(renewed.accessToken,'rotated');assert.equal(renewed.githubToken,'github');assert.equal(renewed.generation,grant.generation)
  const rows=await copilot.models(grant,async()=>ok({data:[
    {id:'responses',capabilities:{type:'chat'},supported_endpoints:['/responses']},
    {id:'chat',capabilities:{type:'chat'},supported_endpoints:['/chat/completions']},
    {id:'embed',capabilities:{type:'embedding'},supported_endpoints:['/chat/completions']},
    {id:'disabled',capabilities:{type:'chat'},policy:{state:'disabled'},supported_endpoints:['/responses']},
    {id:'unsupported',capabilities:{type:'chat'},supported_endpoints:['/messages']},
  ]}),signal(),'1.107.0')
  assert.deepEqual(rows.map(row=>row.id),['responses','chat'])
})

test('Copilot quota keys stay separate and unlimited is not interpreted as zero',async()=>{
  const value=await copilot.usage({...base(),platform:'copilot',githubToken:'github'},async()=>ok({copilot_plan:'individual',quota_reset_date:'2026-11-01T00:00:00Z',quota_snapshots:{premium_models:{percent_remaining:60},chat:{unlimited:true},absent:{}}}),signal(),'1.107.0')
  assert.deepEqual(value.windows.map(row=>[row.label,row.usedPercent,row.unlimited]),[['premium_models',40,undefined],['chat',undefined,true]])
  assert.equal(value.subscriptionEndsAt,undefined)
})

test('Grok discovery removes non-chat models and usage handles both credit response formats',async()=>{
  const grant={...base(),platform:'grok',refreshToken:'refresh'}
  const rows=await grok.models(grant,async()=>ok({data:[{id:'grok-chat'},{id:'grok-imagine-image'},{id:'grok-other',output_modalities:['image']}] }),signal())
  assert.deepEqual(rows.map(row=>row.id),['grok-chat'])
  for(const config of [{creditUsagePercent:0,currentPeriod:{end:'2026-11-01T00:00:00Z'}},{used:{val:50},monthlyLimit:{val:100},billingPeriodEnd:'2026-11-01T00:00:00Z'}]){
    const value=await grok.usage(grant,async()=>ok({config}),signal());assert.equal(value.windows.length,1);assert.equal(value.subscriptionEndsAt,undefined)
  }
  const missing=await grok.usage(grant,async()=>ok({config:{currentPeriod:{type:'WEEKLY'}}}),signal());assert.equal(missing.windows.length,0)
})

test('a revoked refresh grant is an auth failure without exposing the upstream response',async()=>{
  await assert.rejects(json(async()=>({ok:false,status:400,json:async()=>({error:'invalid_grant',error_description:'secret response'})}),'https://example.test/token'),error=>error.code==='auth-required'&&!error.message.includes('secret'))
})
