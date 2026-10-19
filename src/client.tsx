/** Native subscription settings with platform-local actions and app-wide feedback. */
import { useEffect, useId, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Button, Toast, StateDot, Tooltip, IconPlusOutlineRegular, IconChevronDownOutlineRegular, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { z } from 'zod'
import { Catalog, Failure, NS, remainingPercent, type Method, type Platform, type View } from './protocol.js'
import { en, zh, type Key } from './locales.js'
import css from './styles.js'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'subscription-manager': Key } }
declare module '@deepseek-ai/cordis' { interface Context { connection: ConnectionHandle } }
interface State { rows: View[]; loading: boolean; error: boolean; busy: Partial<Record<Platform, boolean>>; notice: { id: number; text: string; error: boolean } | null }
interface Actions {
  hooks: { subscriptions: Pick<SnapshotStore<State>, 'getSnapshot' | 'subscribe'> }
  load(): Promise<void>
  run(method: Exclude<Method, 'list'>, platform: Platform, extra?: object): Promise<void>
  dismiss(id: number): void
}
type PageProps = PropsRuntime<'settings.section'> & PropsLocale<'subscription-manager'> & InjectFace<Actions>
const labels: Record<Platform, string> = { codex: 'Codex (ChatGPT)', cursor: 'Cursor', copilot: 'GitHub Copilot', grok: 'Grok (X Premium)' }
class RequestError extends Error { constructor(readonly text: string) { super(text) } }

function Page(props: PageProps) {
  const state = props.useSubscriptions(value => value), { t } = props
  const [collapsed, setCollapsed] = useState<Partial<Record<Platform, boolean>>>({})
  const group = useId()
  const date = (value: number | undefined) => value === undefined ? t('unknown') : new Date(value).toLocaleString()
  useEffect(() => { void props.load() }, [props.load])
  const waiting = state.rows.some(row => row.attempt?.phase === 'pending')
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => { void props.load() }, 1500)
    return () => { clearInterval(timer) }
  }, [waiting, props.load])
  return <div className="sub-page" aria-busy={state.loading}>
    <h2>{t('nav')}</h2>
    {state.loading && state.rows.length === 0 && <div className="sub-loading"><StateDot state="ongoing" /></div>}
    {state.error && <div className="sub-line sub-error" role="alert">{t('loadError')}<Button onClick={() => { void props.load() }}>{t('retry')}</Button></div>}
    {state.rows.map(row => {
      const busy = state.busy[row.platform] === true, pending = row.attempt?.phase === 'pending'
      const run = (method: Exclude<Method, 'list'>, extra?: object) => { void props.run(method, row.platform, extra) }
      return <section className="sub-group" key={row.platform}>
        <div className="sub-head">
          <h3><button className="sub-toggle" aria-expanded={!collapsed[row.platform]} aria-controls={`${group}-${row.platform}`} onClick={() => { setCollapsed(current => ({ ...current, [row.platform]: !current[row.platform] })) }}><StateDot state={pending ? 'ongoing' : row.authenticated ? 'done' : 'idle'} size={10} /><span>{labels[row.platform]}</span><IconChevronDownOutlineRegular size={14} /></button></h3>
          <p className="sub-muted">{t(pending ? 'pending' : row.authenticated ? 'connectedAccount' : 'signedOutState')}</p></div>
        {!collapsed[row.platform] && <div id={`${group}-${row.platform}`} className="sub-content">
            {!row.authenticated && !pending && <button className="sub-login" disabled={busy} onClick={() => { run('login') }}><IconPlusOutlineRegular size={14} />{t('login')}</button>}
            {pending && <div className="sub-authorization"><div className="sub-line">{row.attempt?.url && <a className="sub-link" href={row.attempt.url} target="_blank" rel="noreferrer">{t('continue')}</a>}<Button disabled={busy} onClick={() => { run('cancel', { attempt: row.attempt!.id }) }}>{t('cancel')}</Button></div>{row.attempt?.code && <code className="sub-code">{row.attempt.code}</code>}</div>}
            {row.attempt?.phase === 'failed' && <p role="alert" className="sub-error">{t(row.attempt.error ?? 'auth-failed')}</p>}
            {row.authenticated && <>
              <div className="sub-account">
                <div className="sub-account-head"><div className="sub-account-copy"><div className="sub-identity"><span className="sub-account-name">{row.account}</span>{row.usage?.plan && <span className="sub-plan">{row.usage.plan}</span>}</div>{(row.usage?.subscriptionEndsAt !== undefined || row.tokenExpiresAt !== undefined) && <p className="sub-muted sub-expiry">{t(row.usage?.subscriptionEndsAt !== undefined ? 'expiry' : 'tokenExpiry')} · {date(row.usage?.subscriptionEndsAt ?? row.tokenExpiresAt)}</p>}</div><Button variant="outline" size="sm" disabled={busy} onClick={() => { run('logout') }}>{t('logout')}</Button></div>
                <div className="sub-usage">
                  <div className="sub-line"><div className="sub-usage-title"><span>{t('usage')}</span>{row.usage?.plan && <span className="sub-muted">{t('plan')} · {row.usage.plan}</span>}</div>{!row.usage?.url && <Tooltip label={t('refresh')} side="top" portal><Button size="sm" className="sub-refresh" aria-label={t('refresh')} disabled={busy} onClick={() => { run('refresh', { target: 'usage' }) }}><IconRefreshOutlineRegular size={16} /></Button></Tooltip>}</div>
                  {row.usageError && <p role="alert" className="sub-error">{t('quotaError')} · {t(row.usageError)}</p>}
                  {row.usage?.url ? <p><a className="sub-link" href={row.usage.url} target="_blank" rel="noreferrer">{t('chatgptUsage')}</a></p> : row.usage && !row.usage.supported && <p className="sub-muted">{t('noUsage')}</p>}
                  {row.usage?.supported && row.usage.windows.length === 0 && <p className="sub-muted">{t('noQuotaWindows')}</p>}
                  {row.usage?.windows.map((window, index) => {
                    const label = window.kind === 'session' ? t('quotaSession') : window.kind === 'weekly' ? t('quotaWeekly') : window.label
                    const remaining = remainingPercent(window)
                    const fill = remaining === undefined ? undefined : Math.max(0, Math.min(100, remaining))
                    return <div className="sub-window" key={index}><div className="sub-line sub-muted"><span>{label}</span><div className="sub-window-info"><span>{window.unlimited ? t('unlimited') : remaining !== undefined ? `${Math.round(remaining * 10) / 10}% ${t('available')}` : t('unknown')}</span>{window.resetsAt !== undefined && <span>{date(window.resetsAt)} {t('reset')}</span>}</div></div>{fill !== undefined && <div className="sub-progress" data-tone={fill <= 10 ? 'error' : fill <= 25 ? 'warning' : 'normal'} role="progressbar" aria-label={`${label} ${t('available')}`} aria-valuenow={fill} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${fill}%` }} /></div>}</div>
                  })}
                  <div className="sub-dates sub-muted">{row.usage?.billingPeriodEnd !== undefined && <span>{t('billing')} · {date(row.usage.billingPeriodEnd)}</span>}{row.usage?.supported && <span>{t('lastUpdated')} · {date(row.usage.fetchedAt)}</span>}</div>
                </div>
              {row.modelsError && <p role="alert" className="sub-error">{t('modelError')} · {t(row.modelsError)}</p>}
              <div className="sub-models-footer"><details className="sub-models"><summary>{t('models')}<span className="sub-model-count">{row.models.length}</span><IconChevronDownOutlineRegular size={14} /></summary>{row.models.length ? <ul>{row.models.map(model => <li key={model.id}>{model.name}</li>)}</ul> : <p className="sub-muted">{t('emptyModels')}</p>}</details><Tooltip label={t('discover')} side="top" portal><Button size="sm" className="sub-refresh" aria-label={t('discover')} disabled={busy} onClick={() => { run('refresh', { target: 'models' }) }}><IconRefreshOutlineRegular size={16} /></Button></Tooltip></div>
              </div>
            </>}
        </div>}
      </section>
    })}
  </div>
}
function Notice(props: InjectFace<Actions>) {
  const notice = props.useSubscriptions(state => state.notice)
  return notice ? <Toast key={notice.id} text={notice.text} {...notice.error ? {} : { tone: 'success' as const }} onDone={() => { props.dismiss(notice.id) }} /> : null
}
export const name = NS
export const inject = ['slots', 'locale', 'connection']

/** Register only native settings and a toast host that survives settings closing. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }))
  const t = ctx.locale.bind(NS)
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style); return () => { style.remove() } })
  let state: State = { rows: [], loading: false, error: false, busy: {}, notice: null }, disposed = false, generation = 0, noticeId = 0, loading = false
  const listeners = new Set<() => void>()
  const update = (value: Partial<State>) => { if (!disposed) { state = { ...state, ...value }; listeners.forEach(listener => { listener() }) } }
  const notify = (text: string, error = false) => { update({ notice: { id: ++noticeId, text, error } }) }
  const store: Actions['hooks']['subscriptions'] = { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  async function call(method: Method, payload: object): Promise<View[]> {
    const result = await ctx.connection.rpc.call('/api', `${NS}/${method}`, payload)
    if (!result.ok) throw new RequestError(t('network'))
    const failure = Failure.safeParse(result.value)
    if (failure.success) throw new RequestError(t(failure.data.code))
    const value = z.object({ ok: z.literal(true), value: Catalog }).safeParse(result.value)
    if (!value.success) throw new RequestError(t('invalid-response'))
    return value.data.value
  }
  const load = async () => {
    if (disposed || loading || Object.values(state.busy).some(Boolean)) return
    const current = generation; loading = true; update({ loading: state.rows.length === 0 })
    try { const rows = await call('list', {}); if (current === generation) update({ rows, error: false }) }
    catch (error) { if (current === generation) update({ error: true }) }
    finally { loading = false; update({ loading: false }) }
  }
  const actions: Actions = { hooks: { subscriptions: store }, load,
    run: async (method, platform, extra = {}) => {
      if (disposed || state.busy[platform]) return
      generation++; update({ busy: { ...state.busy, [platform]: true } })
      try {
        const rows = await call(method, { platform, ...extra })
        update({ rows: state.rows.length ? state.rows.map(current => current.platform === platform ? rows.find(row => row.platform === platform) ?? current : current) : rows, error: false })
        const row = rows.find(item => item.platform === platform)
        const failure = method === 'refresh' ? extra && 'target' in extra && extra.target === 'models' ? row?.modelsError : row?.usageError : undefined
        if (method === 'refresh' || method === 'logout') notify(t(failure ?? (method === 'logout' ? 'signedOut' : 'success')), failure !== undefined)
      } catch (error) { notify(error instanceof RequestError ? error.text : t('network'), true) }
      finally { update({ busy: { ...state.busy, [platform]: false } }) }
    }, dismiss: id => { if (state.notice?.id === id) update({ notice: null }) },
  }
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: NS, order: 27, label: () => t('nav'), locale: NS, inject: () => actions }, Page)))
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: `${NS}.notice`, inject: () => actions }, Notice)))
  ctx.on('connection/reset', () => { generation++; void load() })
  ctx.effect(() => () => { disposed = true; generation++; listeners.clear() })
}
