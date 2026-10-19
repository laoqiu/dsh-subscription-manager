/** Native DSH settings and subscription LLM routes. No standalone server. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-authorization'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-attachment'
import schema from '@deepseek-ai/schemastery'
import { z } from 'zod'
import { Account } from './account.js'
import { codexModels, chatgptModels, copilotModels, grokModels, responsesAdapter } from './adapter.js'
import * as codex from './providers/codex.js'
import * as chatgpt from './providers/chatgpt.js'
import * as cursor from './providers/cursor.js'
import * as copilot from './providers/copilot.js'
import * as grok from './providers/grok.js'
import { CursorAdapter } from './providers/cursor-stream.js'
import { Upstream, SubscriptionError, errorCode } from './http.js'
import { NS, requests, type Method, type Platform, type View } from './protocol.js'

export const name = NS
export const inject = ['llm', 'authorization', 'credentials', 'connection']
const options = z.object({
  requestTimeoutMs: z.number().int().min(100).max(2_147_483_647).default(30_000),
  authTimeoutMs: z.number().int().min(1000).max(2_147_483_647).default(300_000),
  streamIdleTimeoutMs: z.number().int().min(1000).max(2_147_483_647).default(120_000),
  cursorToolSettleMs: z.number().int().min(1).max(10_000).default(500),
  copilotEditorVersion: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.107.0'),
  codexAuthMode: z.enum(['codex', 'chatgpt']).default('codex'),
  codexClientVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/).default('0.153.4'),
  defaultContextWindow: z.number().int().positive().default(262_144), defaultMaxTokens: z.number().int().positive().default(32_768),
  maxRequestImageBytes: z.number().int().positive().default(20 * 1024 * 1024), requestImagePixelBudget: z.number().int().positive().default(2048 * 2048), requestImageMaxBytes: z.number().int().positive().default(1024 * 1024),
}).strict()
export type Config = z.input<typeof options>
export const Config = schema.object(Object.fromEntries(Object.entries(options.shape).map(([key]) => [key, key === 'codexAuthMode' ? schema.union(['codex', 'chatgpt']) : key.endsWith('Version') ? schema.string() : schema.number()])) )
const envelope = z.object({ type: z.literal('client-request'), rpcId: z.string(), method: z.string(), payload: z.unknown() })

/** Register subscription settings, authorization and native LLM routes.
 * @param ctx Existing Host services, including durable credentials and authorization.
 * @param config Validated operation limits; omitted values resolve once at load.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const spec = options.parse(config), upstream = new Upstream(spec.requestTimeoutMs)
  const cli = spec.codexAuthMode === 'codex'
  const codexAccount = new Account<codex.Grant>({ platform: 'codex', label: 'Codex', key: codex.key,
    parse: value => codex.Grant.parse(value),
    login: async session => cli ? codex.login(session, upstream.fetch) : chatgpt.login(session, upstream.fetch, await chatgpt.hostId(ctx.credentials)),
    refresh: (grant, signal) => cli ? codex.refresh(grant, upstream.fetch, signal) : chatgpt.refresh(codex.chatgptGrant(grant), upstream.fetch, signal),
    models: async (grant, signal, token) => responsesAdapter(cli ? codexModels(await codex.models(grant, upstream.fetch, signal, spec.codexClientVersion), spec) : chatgptModels(await chatgpt.models(codex.chatgptGrant(grant), upstream.fetch, signal), spec), spec, token, () => ctx.get('attachments')),
    usage: (grant, signal) => cli ? codex.usage(grant, upstream.fetch, signal) : chatgpt.usage(codex.chatgptGrant(grant)),
  }, ctx.credentials, ctx.authorization, ctx.llm, spec.authTimeoutMs)
  const cursorAccount = new Account<cursor.Grant>({ platform: 'cursor', label: 'Cursor', key: cursor.key,
    parse: value => cursor.Grant.parse(value), login: session => cursor.login(session, upstream.fetch), refresh: (grant, signal) => cursor.refresh(grant, upstream.fetch, signal),
    models: async (grant, signal, token) => new CursorAdapter(await cursor.models(grant, upstream.fetch, signal), token, spec),
    usage: (grant, signal) => cursor.usage(grant, upstream.fetch, signal),
  }, ctx.credentials, ctx.authorization, ctx.llm, spec.authTimeoutMs)
  const copilotAccount = new Account<copilot.Grant>({ platform: 'copilot', label: 'GitHub Copilot', key: copilot.key,
    parse: value => copilot.Grant.parse(value), login: session => copilot.login(session, upstream.fetch, spec.copilotEditorVersion), refresh: (grant, signal) => copilot.refresh(grant, upstream.fetch, signal, spec.copilotEditorVersion),
    models: async (grant, signal, token) => responsesAdapter(copilotModels(await copilot.models(grant, upstream.fetch, signal, spec.copilotEditorVersion), spec, copilot.headers(spec.copilotEditorVersion)), spec, token, () => ctx.get('attachments'), 'subscription-copilot', 'GitHub Copilot'),
    usage: (grant, signal) => copilot.usage(grant, upstream.fetch, signal, spec.copilotEditorVersion),
    needsRefresh: grant => grant.githubExpiresAt !== undefined && grant.githubExpiresAt <= Date.now() + 60_000,
  }, ctx.credentials, ctx.authorization, ctx.llm, spec.authTimeoutMs)
  const grokAccount = new Account<grok.Grant>({ platform: 'grok', label: 'Grok (X Premium)', key: grok.key,
    parse: value => grok.Grant.parse(value), login: session => grok.login(session, upstream.fetch), refresh: (grant, signal) => grok.refresh(grant, upstream.fetch, signal),
    models: async (grant, signal, token) => responsesAdapter(grokModels(await grok.models(grant, upstream.fetch, signal), spec), spec, token, () => ctx.get('attachments'), 'subscription-grok', 'Grok (X Premium)'),
    usage: (grant, signal) => grok.usage(grant, upstream.fetch, signal),
  }, ctx.credentials, ctx.authorization, ctx.llm, spec.authTimeoutMs)
  const accounts = [codexAccount, cursorAccount, copilotAccount, grokAccount]
  for (const account of accounts) ctx.effect(() => ctx.authorization.registerFlow({ key: account.driver.key, label: account.driver.label, methods: [{ id: 'oauth', label: account.driver.label }],
    run: async session => { const grant = await account.driver.login(session); await session.commit({ kind: 'grant', payload: grant }) },
  }))
  let closing = false
  const select = (platform: Platform) => { const account = accounts.find(account => account.driver.platform === platform); if (!account) throw new SubscriptionError('unsupported'); return account }
  async function execute(method: Method, raw: unknown): Promise<View[]> {
    if (closing) throw new SubscriptionError('unloading')
    switch (method) {
      case 'list': requests.list.parse(raw); await Promise.all(accounts.map(account => account.snapshot().attempt?.phase === 'pending' ? undefined : account.sync())); break
      case 'login': select(requests.login.parse(raw).platform).login(); break
      case 'cancel': { const value = requests.cancel.parse(raw); select(value.platform).cancel(value.attempt); break }
      case 'logout': await select(requests.logout.parse(raw).platform).logout(); break
      case 'refresh': { const value = requests.refresh.parse(raw); await select(value.platform).refresh(value.target); break }
    }
    return accounts.map(account => account.snapshot())
  }
  for (const method of Object.keys(requests) as Method[]) ctx.effect(() => ctx.connection.fetch.register({
    path: `/api/${NS}/${method}`, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return new Response('Expected JSON', { status: 415 })
      let input
      try { input = envelope.parse(await request.json()); if (input.method !== `${NS}/${method}` || !requests[method].safeParse(input.payload).success) throw new SubscriptionError('invalid-request') }
      catch (error) { return new Response('Invalid subscription request', { status: 400 }) }
      let value
      try { value = { ok: true, value: await execute(method, input.payload) } }
      catch (error) { value = { ok: false, code: error instanceof z.ZodError ? 'invalid-response' : errorCode(error) }; ctx.logger.warn('Subscription operation failed: %s', value.code) }
      return Response.json({ type: 'server-response', rpcId: input.rpcId, result: { ok: true, value } })
    },
  }))
  ctx.on('credentials/record-updated', key => { const account = accounts.find(account => account.driver.key === key); if (account && account.snapshot().attempt?.phase !== 'pending') void account.sync().catch(error => { ctx.logger.warn('Subscription state unavailable: %s', errorCode(error)) }) })
  ctx.effect(() => async () => { closing = true; await Promise.all(accounts.map(account => account.close())); await upstream.close() })
  for (const account of accounts) void account.sync().catch(error => { ctx.logger.warn('Subscription state unavailable: %s', errorCode(error)) })
}
