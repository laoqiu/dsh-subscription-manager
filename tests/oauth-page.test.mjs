import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { callback } from '../lib/oauth.js'

test('an invalid callback stays retryable and a provider refusal never renders a success or upstream details', async t => {
  const controller = new AbortController()
  let notice
  const ready = new Promise(resolve => { notice = resolve })
  const attempt = callback({ signal: controller.signal, notify: notice }, (redirect, state) => `${redirect}?state=${state}`)
  const failed = assert.rejects(attempt, error => error.code === 'denied')
  t.after(() => controller.abort())
  const url = new URL((await ready).url)
  const invalid = new URL(url); invalid.searchParams.set('state', 'invalid')
  const invalidPage = await fetch(invalid)
  assert.equal(invalidPage.status, 400)
  assert.match(await invalidPage.text(), /authorization link is invalid/)
  url.searchParams.set('error', 'access_denied')
  url.searchParams.set('error_description', '<script>private-provider-error</script>')
  const refusal = await fetch(url, { headers: { 'accept-language': 'zh-CN' } })
  assert.equal(refusal.status, 200)
  const html = await refusal.text()
  assert.match(html, /授权未完成/)
  assert.equal(html.includes('private-provider-error'), false)
  assert.equal(html.includes('授权成功'), false)
  assert.doesNotMatch(html, /DeepSeek Harness|DSH/)
  await failed
})

test('callback falls back from an occupied allowed port without stopping its owner', async t => {
  const owner = createServer((_request, response) => response.end('owner'))
  owner.listen(0, '127.0.0.1'); await new Promise(resolve => owner.once('listening', resolve))
  t.after(() => new Promise(resolve => { owner.closeAllConnections(); owner.close(resolve) }))
  const port = owner.address().port, controller = new AbortController()
  t.after(() => controller.abort())
  let notified
  const ready = new Promise(resolve => { notified = resolve })
  const attempt = callback({ signal: controller.signal, notify: notified }, (redirect, state) => redirect + '?state=' + state, [port, 0])
  const cancelled = assert.rejects(attempt, error => error.code === 'cancelled')
  const url = new URL((await ready).url)
  assert.notEqual(Number(url.port), port)
  assert.equal(await (await fetch('http://127.0.0.1:' + port)).text(), 'owner')
  controller.abort(); await cancelled
  await assert.rejects(fetch(url))
  await assert.rejects(callback({ signal: new AbortController().signal, notify: () => assert.fail('unbound listener') }, () => '', [port]), error => error.code === 'callback-busy')
  assert.equal(owner.listening, true)
})
