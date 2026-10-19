import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { zstdDecompressSync } from 'node:zlib'
import { createMessage } from '@deepseek-ai/dsh-llm'
import { codexModels, chatgptModels, copilotModels, responsesAdapter } from '../lib/adapter.js'

const limits = { streamIdleTimeoutMs: 10000, defaultContextWindow: 262144, defaultMaxTokens: 32768, maxRequestImageBytes: 20971520, requestImagePixelBudget: 4194304, requestImageMaxBytes: 1048576 }
const codexToken = 'opaque-oauth-access'
async function fixture(t, events, route = 'subscription-codex', mode = 'chatgpt') {
  const requests = []
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const bytes = Buffer.concat(chunks)
    const body = request.headers['content-encoding'] === 'zstd' ? zstdDecompressSync(bytes) : bytes
    requests.push({ headers: request.headers, body: JSON.parse(body.toString()), path: request.url })
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const event of events) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    response.end()
  })
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const models = route === 'subscription-copilot' ? copilotModels([{ id: 'test-model', supported_endpoints: ['/responses'] }], limits, { 'editor-version': 'vscode/1.107.0' }) : (mode === 'codex' ? codexModels : chatgptModels)([{ slug: 'test-model', display_name: 'Test', visibility: 'list' }], limits)
  models[0].baseUrl = `http://127.0.0.1:${server.address().port}${mode === 'codex' ? '/backend-api' : '/v1'}`
  const token = mode === 'codex' ? `e30.${Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:'account-test'}})).toString('base64url')}.fixture` : codexToken
  return { adapter: responsesAdapter(models, limits, async () => route === 'subscription-codex' ? token : 'account-token', () => undefined, route), requests, token }
}
const tool = { type: 'function_call', id: 'fc_test', call_id: 'call_test', name: 'lookup', arguments: '{"id":1}', status: 'completed' }
const completed = output => ({ type: 'response.completed', response: { id: 'r_test', status: 'completed', output, usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7, input_tokens_details: { cached_tokens: 0 } } } })
const toolEvents = [
    { type: 'response.output_item.added', output_index: 0, item: { ...tool, arguments: '' } },
    { type: 'response.function_call_arguments.delta', item_id: tool.id, output_index: 0, delta: tool.arguments },
    { type: 'response.output_item.done', output_index: 0, item: tool }, completed([tool]),
  ]

for (const mode of ['codex','chatgpt']) test(`${mode} delegated stream preserves tools, history and attribution without SDK retries`, async t => {
  const { adapter, requests, token } = await fixture(t, toolEvents, 'subscription-codex', mode)
  const chunks = await Array.fromAsync(adapter.stream({ provider: 'subscription-codex', model: 'test-model', system: 'Use DSH tools', temperature: 0.7, maxTokens: 100, messages: [{ role: 'user', content: [{ type: 'text', text: 'Look up 1' }] }], tools: [{ name: 'lookup', description: 'Look up a record', parameters: { type: 'object', properties: { id: { type: 'integer' } } } }] }))
  assert.equal(chunks.at(-1).reason.kind, 'tool-calls')
  assert.equal(chunks.find(chunk => chunk.type === 'block-end').block.name, 'lookup')
  assert.equal(requests.length, 1); assert.equal(requests[0].path, mode === 'codex' ? '/backend-api/codex/responses' : '/v1/responses')
  assert.equal(requests[0].headers.authorization, `Bearer ${token}`)
  assert.equal(requests[0].headers['chatgpt-account-id'],mode === 'codex' ? 'account-test' : undefined)
  assert.equal(requests[0].headers.originator,mode === 'codex' ? 'codex_cli_rs' : undefined)
  assert.match(requests[0].headers['user-agent'], /deepseek-harness/)
  assert.equal(requests[0].body.store, false); assert.equal(requests[0].body.stream, true)
  if (mode === 'chatgpt') assert.equal(requests[0].body.tools,undefined)
  assert.equal(requests[0].body.max_output_tokens,undefined)
  assert.equal(requests[0].body.temperature,mode === 'codex' ? 0.7 : undefined)
  assert.equal(requests[0].body.input.some(item=>item.role==='system'),false)
  assert.equal((mode === 'chatgpt' ? requests[0].body.input.find(item=>item.type==='additional_tools').tools : requests[0].body.tools)[0].name,'lookup')
  const block=chunks.find(chunk=>chunk.type==='block-end').block
  const assistant=createMessage({role:'assistant',source:{kind:'model',provider:'subscription-codex',model:'test-model',replayState:chunks.at(-1).replayState},content:[block]})
  const result=createMessage({role:'tool',source:{kind:'tool',callId:block.id},toolCallId:block.id,content:[{type:'text',text:'Result from DSH'}]})
  await Array.fromAsync(adapter.stream({provider:'subscription-codex',model:'test-model',messages:[{role:'user',content:[{type:'text',text:'Look up 1'}]},assistant,result]}))
  const replayCall=requests[1].body.input.find(item=>item.type==='function_call')
  const replayResult=requests[1].body.input.find(item=>item.type==='function_call_output')
  assert.equal(replayCall.call_id,replayResult.call_id)
  assert.equal(replayCall.arguments,tool.arguments)
  assert.match(JSON.stringify(replayResult.output),/Result from DSH/)
  assert.equal(requests.length,2)
})

for (const mode of ['codex','chatgpt']) test(`${mode} interrupted stream is not reported as completed`, async t => {
  const { adapter, requests } = await fixture(t, [{ type: 'response.output_item.added', output_index: 0, item: { ...tool, arguments: '' } }], 'subscription-codex', mode)
  const chunks = await Array.fromAsync(adapter.stream({ provider: 'subscription-codex', model: 'test-model', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }))
  assert.equal(chunks.at(-1).reason.kind, 'error')
  assert.equal(requests.length, 1)
})

test('Copilot keeps its native initiator headers when using a subscription route', async t => {
  const { adapter, requests } = await fixture(t, toolEvents, 'subscription-copilot')
  const chunks = await Array.fromAsync(adapter.stream({ provider: 'subscription-copilot', model: 'test-model', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] }))
  assert.equal(chunks.at(-1).reason.kind, 'tool-calls')
  assert.equal(requests[0].headers['x-initiator'], 'user')
  assert.equal(requests[0].headers['editor-version'], 'vscode/1.107.0')
  assert.equal(requests[0].headers.authorization, 'Bearer account-token')
  assert.equal(requests[0].path, '/v1/responses')
})

for (const mode of ['codex','chatgpt']) test(`${mode} subscription limit failure is not retried`, async t => {
  const {adapter,requests}=await fixture(t,[{type:'response.failed',response:{id:'r_failed',status:'failed',error:{code:'subscription_sharing_usage_limit_exceeded',message:'Plan limit reached'}}}], 'subscription-codex', mode)
  const chunks=await Array.fromAsync(adapter.stream({provider:'subscription-codex',model:'test-model',messages:[{role:'user',content:[{type:'text',text:'hello'}]}]}))
  assert.equal(chunks.at(-1).reason.kind,'error')
  assert.equal(requests.length,1)
})
