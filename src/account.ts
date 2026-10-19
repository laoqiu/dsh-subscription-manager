/** One subscription account: cancellable authorization, isolated cache, and native route ownership. */
import { randomUUID } from 'node:crypto'
import type { AuthorizationService, AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import type { CredentialKey, CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { LlmAdapter, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle, GenerateOptions, LlmModelInfo, LlmRuntime, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SubscriptionError, errorCode } from './http.js'
import { AttemptId, type Platform, type Usage, type View } from './protocol.js'

interface Grant { generation: string; account: string; expiresAt: number; accessToken: string }
/** Provider-owned protocols, with no credentials exposed to the public view. */
export interface Driver<G extends Grant> {
  platform: Platform
  label: string
  key: CredentialKey
  parse(value: unknown): G
  login(session: AuthorizationSession): Promise<G>
  refresh(grant: G, signal: AbortSignal): Promise<G>
  needsRefresh?(grant: G): boolean
  models(grant: G, signal: AbortSignal, token: () => Promise<string>): Promise<LlmAdapter>
  usage(grant: G, signal: AbortSignal): Promise<Usage>
}

/** Independent lifetime per platform; reads coalesce but never block another platform. */
export class Account<G extends Grant> extends LlmAdapter {
  private view: View
  private adapter: LlmAdapter | undefined
  private registration: AdapterRegistrationHandle | undefined
  private lifetime = new AbortController()
  private generation: string | undefined
  private closing = false
  private blocked = false
  private deletionFailed = false
  private attempt: Promise<void> | undefined
  private readonly jobs = new Set<Promise<unknown>>()
  private readonly reads = new Map<string, Promise<void>>()
  readonly route: string
  constructor(readonly driver: Driver<G>, private readonly credentials: CredentialProvider, private readonly authorization: AuthorizationService, private readonly llm: LlmRuntime, private readonly authTimeoutMs: number) {
    super()
    this.route = `subscription-${driver.platform}`
    this.view = { platform: driver.platform, authenticated: false, models: [] }
  }
  snapshot(): View { return structuredClone(this.view) }
  override providerInfo() { return { id: this.route, name: this.driver.label } }
  override providerRetryPolicy() { return resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, this.route) }
  override listModels(): Promise<readonly LlmModelInfo[]> { return this.adapter?.listModels(this.route) ?? Promise.resolve([]) }
  private admit(): void { if (this.closing) throw new SubscriptionError('unloading'); if (this.blocked) throw new SubscriptionError('busy') }
  private track<T>(job: Promise<T>): Promise<T> {
    this.jobs.add(job)
    void job.finally(() => { this.jobs.delete(job) }).catch((_error) => { /* The operation's caller owns reporting. */ })
    return job
  }
  private readGrant(): Promise<G | undefined> {
    return this.credentials.readRecord(this.driver.key).then(record => {
      if (!record) return undefined
      if (record.kind !== 'grant') throw new SubscriptionError('storage-failed')
      try { return this.driver.parse(record.payload) }
      catch (error) { throw new SubscriptionError('storage-failed') }
    })
  }
  private freshGrant(expected: string, signal: AbortSignal): Promise<G> {
    return this.track(this.credentials.modifyRecord(this.driver.key, async record => {
      signal.throwIfAborted()
      if (record?.kind !== 'grant') throw new SubscriptionError('auth-required')
      const current = this.driver.parse(record.payload)
      if (current.generation !== expected) throw new SubscriptionError('auth-required')
      if (current.expiresAt > Date.now() + 60_000 && !this.driver.needsRefresh?.(current)) return undefined
      const updated = await this.driver.refresh(current, signal)
      signal.throwIfAborted()
      return { kind: 'grant', payload: updated }
    }).then(record => {
      signal.throwIfAborted()
      if (record?.kind !== 'grant') throw new SubscriptionError('auth-required')
      const grant = this.driver.parse(record.payload)
      if (grant.generation !== expected) throw new SubscriptionError('auth-required')
      return grant
    }))
  }
  private reset(): void {
    this.lifetime.abort()
    this.lifetime = new AbortController()
    this.adapter = undefined
    this.registration?.replace([])
    this.generation = undefined
    this.view = { platform: this.driver.platform, authenticated: false, models: [], ...(this.view.attempt ? { attempt: this.view.attempt } : {}) }
  }

  /** Reconcile stored credentials and await this generation's model and usage reads. */
  async sync(): Promise<void> {
    if (this.closing || this.blocked) return
    if (this.deletionFailed) throw new SubscriptionError('storage-failed')
    const grant = await this.readGrant()
    if (this.closing || this.blocked) return
    if (grant?.generation === this.generation) {
      if (grant) {
        this.view = { ...this.view, tokenExpiresAt: grant.expiresAt }
        await Promise.all(['models', 'usage'].map(target => this.reads.get(`${grant.generation}:${target}`)))
      }
      return
    }
    this.reset()
    if (!grant) return
    this.generation = grant.generation
    this.view = { ...this.view, authenticated: true, account: grant.account, tokenExpiresAt: grant.expiresAt }
    await Promise.all([this.refresh('models'), this.refresh('usage')])
  }

  /** Coalesce only this target; failed refreshes retain prior data with a visible error. */
  refresh(target: 'usage' | 'models'): Promise<void> {
    this.admit()
    const cacheKey = `${this.generation}:${target}`
    const previous = this.reads.get(cacheKey)
    if (previous) return previous
    const signal = this.lifetime.signal, generation = this.generation
    const job = (async () => {
      try {
        const grant = await this.readGrant()
        if (!grant || grant.generation !== generation) throw new SubscriptionError('auth-required')
        const current = await this.freshGrant(grant.generation, signal)
        this.view = { ...this.view, tokenExpiresAt: current.expiresAt }
        if (target === 'usage') {
          const usage = await this.driver.usage(current, signal)
          signal.throwIfAborted()
          this.view = { ...this.view, usage }
          delete this.view.usageError
        } else {
          const adapter = await this.driver.models(current, signal, async () => (await this.freshGrant(grant.generation, signal)).accessToken)
          const models = await adapter.listModels(this.route)
          signal.throwIfAborted()
          this.adapter = adapter
          this.view = { ...this.view, models: models.map(row => ({ id: row.id, name: row.name })) }
          delete this.view.modelsError
          if (models.length) {
            if (this.registration) this.registration.replace([this.route])
            else this.registration = this.llm.registerAdapter([this.route], this)
          } else this.registration?.replace([])
        }
      } catch (error) {
        if (!signal.aborted) this.view = { ...this.view, [target === 'usage' ? 'usageError' : 'modelsError']: errorCode(error) }
      }
    })()
    this.reads.set(cacheKey, job)
    void job.finally(() => { this.reads.delete(cacheKey) })
    return this.track(job)
  }

  /** Begin a DSH authorization flow and expose only its public notice fields. */
  login(): void {
    this.admit()
    if (this.attempt) throw new SubscriptionError('busy')
    const id = AttemptId.parse(randomUUID()), timeout = AbortSignal.timeout(this.authTimeoutMs)
    const signal = AbortSignal.any([this.lifetime.signal, timeout])
    this.view = { ...this.view, attempt: { id, phase: 'pending' } }
    this.attempt = this.authorization.begin({ key: this.driver.key, signal, interaction: {
      notify: notice => {
        if (this.view.attempt?.id !== id || this.view.attempt.phase !== 'pending') return
        this.view = { ...this.view, attempt: { id, phase: 'pending', ...(notice.url ? { url: notice.url } : {}), ...(notice.code ? { code: notice.code } : {}) } }
      },
      prompt: async () => { throw new SubscriptionError('unsupported') },
    } }).then(async outcome => {
      if (outcome.status === 'authorized') this.deletionFailed = false
      this.view = { ...this.view, attempt: timeout.aborted && outcome.status === 'cancelled' ? { id, phase: 'failed', error: 'timeout' } : { id, phase: outcome.status } }
      await this.sync()
    }).catch(error => { this.view = { ...this.view, attempt: { id, phase: timeout.aborted ? 'failed' : signal.aborted ? 'cancelled' : 'failed', error: timeout.aborted ? 'timeout' : errorCode(error) } } })
      .finally(() => { this.attempt = undefined })
    this.track(this.attempt)
  }
  cancel(id: AttemptId): void {
    if (this.view.attempt?.id !== id) throw new SubscriptionError('invalid-request')
    this.authorization.cancel(this.driver.key)
  }
  /** Quiesce refresh and authorization before deletion so no late response resurrects a login. */
  async logout(): Promise<void> {
    this.admit(); this.blocked = true
    this.authorization.cancel(this.driver.key)
    this.lifetime.abort()
    await Promise.allSettled([...this.jobs])
    try { await this.credentials.deleteRecord(this.driver.key); this.deletionFailed = false }
    catch (error) { this.deletionFailed = true; throw new SubscriptionError('storage-failed') }
    finally { this.reset(); this.blocked = false }
  }
  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    this.admit()
    const adapter = this.adapter, lifetime = this.lifetime.signal
    if (!adapter || !this.view.models.some(row => row.id === model)) throw new LlmError('Sign in and refresh subscription models', 'AUTH')
    const prepared = await adapter.prepareCall(provider, model, signal)
    return { model: prepared.model, stream: options => this.dispatch(prepared, options, lifetime) }
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const prepared = await this.prepareCall(options.provider, options.model, options.signal)
    yield* prepared.stream(options)
  }
  override async resolveModel(provider: string, model: string, signal?: AbortSignal) {
    return (await this.prepareCall(provider, model, signal)).model
  }
  private async *dispatch(prepared: PreparedAdapterCall, options: GenerateOptions, lifetime: AbortSignal): AsyncIterable<StreamChunk> {
    this.admit()
    const signal = AbortSignal.any([lifetime, ...(options.signal ? [options.signal] : [])])
    let done!: () => void
    const job = this.track(new Promise<void>(resolve => { done = resolve }))
    try { signal.throwIfAborted(); yield* prepared.stream({ ...options, signal }) }
    finally { done(); await job }
  }
  async close(): Promise<void> {
    this.closing = true
    this.authorization.cancel(this.driver.key)
    this.lifetime.abort()
    this.registration?.()
    await Promise.allSettled([...this.jobs])
  }
}
