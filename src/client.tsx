/** Native subscription settings with platform-local actions and app-wide feedback. */
import { useEffect, useId, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Button, Modal, Toast, StateDot, Tooltip, IconPlusOutlineRegular, IconChevronDownOutlineRegular, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { z } from 'zod'
import { Catalog, Failure, NS, remainingPercent, type Method, type Platform, type View } from './protocol.js'
import { en, zh, type Key } from './locales.js'
import css from './styles.js'

declare const PLUGIN_VERSION: string

function HeaderIcon({ name }: { name: 'refresh' | 'github' | 'edit' }) {
  const paths = name === 'refresh'
    ? ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5']
    : name === 'github'
    ? ['M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4', 'M9 18c-4.51 2-5-2-7-2']
    : ['M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M16 3a2.12 2.12 0 0 1 3 3l-9 9-4 1 1-4Z']
  return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths.map(d => <path key={d} d={d} />)}</svg>
}

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

/** Check this repository's stable releases without replacing the installed plugin. */
function UpdateButton({ t }: Pick<PageProps, 't'>) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<{ phase: 'checking' | 'ready' | 'unpublished' | 'error'; version?: string }>({ phase: 'checking' })
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => { request.current?.abort() }, [])
  const close = () => { request.current?.abort(); setOpen(false) }
  const check = async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setOpen(true)
    setResult({ phase: 'checking' })
    try {
      const response = await fetch('https://api.github.com/repos/laoqiu/dsh-subscription-manager/releases/latest', {
        credentials: 'omit', headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      })
      if (controller.signal.aborted) return
      if (response.status === 404) { setResult({ phase: 'unpublished' }); return }
      if (!response.ok) throw new Error('Release request failed')
      const release = z.object({ tag_name: z.string().regex(/^v\d+\.\d+\.\d+$/), draft: z.literal(false), prerelease: z.literal(false) }).parse(await response.json())
      if (!controller.signal.aborted) setResult({ phase: 'ready', version: release.tag_name.slice(1) })
    } catch (error) {
      if (!controller.signal.aborted) setResult({ phase: 'error' })
    }
  }
  const status = result.phase === 'ready'
    ? result.version!.localeCompare(PLUGIN_VERSION, 'en', { numeric: true }) > 0 ? 'updateAvailable' : 'upToDate'
    : result.phase === 'checking' ? 'checkingUpdates' : result.phase === 'unpublished' ? 'noRelease' : 'updateCheckFailed'
  return <>
    <Tooltip label={t('checkUpdates')} side="bottom" portal><Button size="sm" variant="ghost" className="sub-header-action" aria-label={t('checkUpdates')}
      icon={<HeaderIcon name="refresh" />} onClick={() => { void check() }} /></Tooltip>
    <Modal open={open} title={t('checkUpdates')} closeLabel={t('close')} onClose={close}
      footer={<div className="sub-update-actions"><Button variant="outline" disabled={result.phase === 'checking'} onClick={() => { void check() }}>{t('checkAgain')}</Button>
        <Button variant="primary" disabled={result.phase !== 'ready'} onClick={() => { if (result.version) window.open(`https://github.com/laoqiu/dsh-subscription-manager/releases/tag/v${result.version}`, '_blank', 'noreferrer') }}>{t('viewRelease')}</Button></div>}>
      <div className="sub-update"><p>{t('currentVersion')} · v{PLUGIN_VERSION}</p>
        {result.version && <p>{t('latestVersion')} · v{result.version}</p>}
        <p role={result.phase === 'error' ? 'alert' : 'status'}>{result.phase === 'checking' && <StateDot state="ongoing" />} {t(status)}</p>
      </div>
    </Modal>
  </>
}
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
    <header className="sub-header">
      <div className="sub-title-row"><h2>{t('nav')}<span className="sub-version">v{PLUGIN_VERSION}</span></h2>
        <div className="sub-header-actions">
          <UpdateButton t={t} />
          {(['github', 'edit'] as const).map(action => <Tooltip key={action} label={t(action === 'github' ? 'viewProject' : 'feedback')} side="bottom" portal>
            <Button size="sm" variant="ghost" className="sub-header-action" aria-label={t(action === 'github' ? 'viewProject' : 'feedback')} icon={<HeaderIcon name={action} />}
              onClick={() => { window.open(`https://github.com/laoqiu/dsh-subscription-manager${action === 'edit' ? '/issues' : ''}`, '_blank', 'noreferrer') }} />
          </Tooltip>)}
        </div>
      </div>
      <p className="sub-subtitle">{t('subtitle')}</p>
    </header>
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
