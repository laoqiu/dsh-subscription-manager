import test from 'node:test'
import assert from 'node:assert/strict'
import http2 from 'node:http2'
import { randomUUID } from 'node:crypto'
import { login, refresh, models, usage } from '../lib/providers/cursor.js'
import { CursorAdapter, transcript } from '../lib/providers/cursor-stream.js'
import { Writer, frameEncode, ConnectFrameReader, encodeValue } from '../vendor/cursor-wire.js'

const jwt = values => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(values)).toString('base64url')}.fixture`
const grant = () => ({ platform: 'cursor', version: 1, generation: randomUUID(), account: 'user', subject: 'user', accessToken: jwt({ sub: 'user', exp: Math.floor(Date.now()/1000)+3600 }), refreshToken: 'refresh', expiresAt: Date.now()+3600000 })
const limits = { streamIdleTimeoutMs: 10000, cursorToolSettleMs: 5, defaultContextWindow: 200000, defaultMaxTokens: 64000 }
const event = value => frameEncode(new Writer().message(1, value).finish())
const text = value => event(new Writer().message(1, new Writer().string(1, value).finish()).finish())
const turnEnded = () => event(new Writer().message(14, new Uint8Array()).finish())
const mcp = (name, id) => {
  const args = new Writer().string(1, name).string(5, name).string(3, id).message(2, new Writer().string(1, 'id').message(2, encodeValue(42)).finish()).finish()
  return frameEncode(new Writer().message(2, new Writer().varint(1, 1).string(15, id).message(11, args).finish()).finish())
}
async function serverFixture(t, reply) {
  const server = http2.createServer(), sessions = new Set(), requests = []
  server.on('session', session => { sessions.add(session); session.on('close', () => sessions.delete(session)); session.on('error', () => {}) })
  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})
    stream.once('data', bytes => { requests.push({ headers, bytes }); stream.respond({ ':status': 200, 'content-type': 'application/connect+proto' }); reply(stream) })
  })
  server.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve))
  t.after(() => new Promise(resolve => { sessions.forEach(session => session.destroy()); server.close(resolve) }))
  const adapter = new CursorAdapter([{ id:'composer', name:'Composer' }],async ()=>'access',limits,`http://127.0.0.1:${server.address().port}`)
  return { adapter, requests, sessions }
}
const options = () => ({ provider:'subscription-cursor',model:'composer',messages:[{role:'user',content:[{type:'text',text:'hi'}]}] })

test('pairing keeps the verifier on Host and validates the returned Cursor token fields', async () => {
  let url
  const value = await login({ signal: new AbortController().signal, notify: notice => { url=new URL(notice.url) } }, async (endpoint) => {
    const poll = new URL(endpoint)
    assert.equal(poll.searchParams.get('uuid'),url.searchParams.get('uuid'))
    assert.ok(poll.searchParams.get('verifier')); assert.equal(url.searchParams.has('verifier'),false)
    return {ok:true,status:200,json:async()=>({accessToken:grant().accessToken,refreshToken:'r'})}
  })
  assert.equal(value.subject,'user'); assert.equal(value.refreshToken,'r')
})

test('live model discovery handles raw and framed protobuf and never substitutes a static list', async () => {
  const protobuf = new Writer().message(1,new Writer().string(1,'composer').string(4,'Composer').finish()).finish()
  for(const bytes of [protobuf,frameEncode(protobuf)]) {
    const found=await models(grant(),async()=>({ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),new AbortController().signal)
    assert.equal(found[0].id,'composer')
  }
  await assert.rejects(models(grant(),async()=>({ok:false,status:503}),new AbortController().signal))
})

test('quota summary preserves zero and billing period without inventing subscription expiration', async () => {
  const value=await usage(grant(),async (_url,init)=>{
    assert.match(init.headers.cookie,/WorkosCursorSessionToken=user::/)
    return {ok:true,status:200,json:async()=>({membershipType:'pro',billingCycleEnd:'2026-11-01T00:00:00Z',individualUsage:{plan:{totalPercentUsed:0}}})}
  },new AbortController().signal)
  assert.equal(value.windows[0].usedPercent,0);assert.equal(value.subscriptionEndsAt,undefined);assert.equal(value.billingPeriodEnd,Date.parse('2026-11-01T00:00:00Z'))
})

test('full history retains long arguments and first-class correlated tool results',()=>{
  const content=transcript({...options(),messages:[...options().messages,{role:'assistant',content:[{type:'tool-call',id:'call',name:'lookup',arguments:'x'.repeat(1000)}]},{role:'tool',toolCallId:'call',content:[{type:'text',text:'result42'}]}]})
  const entries=JSON.parse(content.action)
  assert.equal(entries[1].content[0].arguments.length,1000);assert.equal(entries[2].toolCallId,'call');assert.equal(entries[2].content[0].text,'result42')
  assert.equal(content.action.includes('sandbox_permissions'),false)
})

test('a real HTTP/2 stream ends only on explicit completion and releases its session',async t=>{
  const {adapter,requests}=await serverFixture(t,stream=>{stream.write(text('hello'));stream.write(turnEnded())})
  const chunks=await Array.fromAsync(adapter.stream(options()))
  assert.equal(chunks.at(-1).reason.kind,'stop');assert.equal(chunks.find(chunk=>chunk.type==='block-end').block.text,'hello')
  assert.match(requests[0].headers['user-agent'],/deepseek-harness/);assert.equal(requests[0].headers.authorization,'Bearer access')
})

test('parallel MCP calls become distinct DSH tool blocks without remote tool execution',async t=>{
  const {adapter}=await serverFixture(t,stream=>{stream.write(mcp('lookup','call-1'));stream.write(mcp('lookup','call-2'))})
  const chunks=await Array.fromAsync(adapter.stream({...options(),tools:[{name:'lookup',description:'Lookup',parameters:{type:'object'}}]}))
  assert.equal(chunks.at(-1).reason.kind,'tool-calls')
  assert.deepEqual(chunks.filter(chunk=>chunk.type==='block-end').map(chunk=>[chunk.index,chunk.block.id,JSON.parse(chunk.block.arguments)]),[[2,'call-1',{id:42}],[3,'call-2',{id:42}]])
})

test('premature EOF fails even after visible output instead of claiming a successful answer',async t=>{
  const {adapter}=await serverFixture(t,stream=>{stream.end(text('incomplete'))})
  await assert.rejects(Array.fromAsync(adapter.stream(options())),error=>error.code==='CURSOR_PROTOCOL')
})

test('Connect parser rejects excessive lengths and truncated frames',async()=>{
  const oversized=new ConnectFrameReader();oversized.push(Uint8Array.from([0,255,255,255,255]));await assert.rejects(oversized.next())
  const truncated=new ConnectFrameReader();truncated.push(Uint8Array.from([0,0,0]));truncated.finish();await assert.rejects(truncated.next())
})
