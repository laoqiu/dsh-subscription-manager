/** GitHub device authorization, Copilot token exchange, catalog and quota projection. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { attributionHeaders } from '@deepseek-ai/dsh-llm';
import { device } from '../device.js';
import { json, SubscriptionError } from '../http.js';
const clientId = 'Iv1.b507a08c87ecfe98';
export const key = credentialKey('subscription-manager', 'copilot');
export const Grant = z.object({ version: z.literal(1), platform: z.literal('copilot'), generation: z.uuid(), account: z.string(), accessToken: z.string().min(1), expiresAt: z.number().positive(), githubToken: z.string().min(1), githubRefresh: z.string().optional(), githubExpiresAt: z.number().optional() });
export function headers(editorVersion) { return { accept: 'application/json', 'editor-version': `vscode/${editorVersion}`, 'editor-plugin-version': 'copilot-chat/0.35.0', 'copilot-integration-id': 'vscode-chat', ...attributionHeaders() }; }
const oauth = z.object({ access_token: z.string().min(1), refresh_token: z.string().optional(), expires_in: z.number().positive().optional() });
async function exchange(token, http, signal, editorVersion) {
    return z.object({ token: z.string().min(1), expires_at: z.number().positive() }).parse(await json(http, 'https://api.github.com/copilot_internal/v2/token', { headers: { ...headers(editorVersion), authorization: `token ${token}` }, signal }));
}
export async function login(session, http, editorVersion) {
    const token = oauth.parse(await device(session, http, { clientId, scope: 'read:user', start: 'https://github.com/login/device/code', token: 'https://github.com/login/oauth/access_token', verificationOrigin: 'https://github.com' }));
    const user = z.object({ login: z.string() }).parse(await json(http, 'https://api.github.com/user', { headers: { ...headers(editorVersion), authorization: `Bearer ${token.access_token}` }, signal: session.signal }));
    const pair = await exchange(token.access_token, http, session.signal, editorVersion);
    return { version: 1, platform: 'copilot', generation: randomUUID(), account: user.login, accessToken: pair.token, expiresAt: pair.expires_at * 1000, githubToken: token.access_token,
        ...(token.refresh_token ? { githubRefresh: token.refresh_token } : {}), ...(token.expires_in ? { githubExpiresAt: Date.now() + token.expires_in * 1000 } : {}) };
}
export async function refresh(grant, http, signal, editorVersion) {
    let current = grant;
    if (grant.githubExpiresAt !== undefined && grant.githubExpiresAt <= Date.now() + 60_000) {
        if (!grant.githubRefresh)
            throw new SubscriptionError('auth-required');
        const token = oauth.parse(await json(http, 'https://github.com/login/oauth/access_token', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, signal,
            body: new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: grant.githubRefresh }).toString() }));
        current = { ...grant, githubToken: token.access_token, ...(token.refresh_token ? { githubRefresh: token.refresh_token } : {}), ...(token.expires_in ? { githubExpiresAt: Date.now() + token.expires_in * 1000 } : {}) };
    }
    let pair;
    try {
        pair = await exchange(current.githubToken, http, signal, editorVersion);
    }
    catch (error) {
        if (current !== grant)
            throw new SubscriptionError('auth-required');
        throw error;
    }
    return { ...current, accessToken: pair.token, expiresAt: pair.expires_at * 1000 };
}
export const Model = z.object({ id: z.string().min(1), name: z.string().optional(), supported_endpoints: z.array(z.string()).optional(), policy: z.object({ state: z.string() }).optional(), capabilities: z.object({ type: z.string().optional(), limits: z.object({ max_context_window_tokens: z.number().positive().optional(), max_output_tokens: z.number().positive().optional() }).optional(), supports: z.object({ vision: z.boolean().optional() }).optional() }).optional() });
export async function models(grant, http, signal, editorVersion) {
    const wire = z.object({ data: z.array(Model) }).parse(await json(http, 'https://api.githubcopilot.com/models', { headers: { ...headers(editorVersion), authorization: `Bearer ${grant.accessToken}` }, signal }));
    return wire.data.filter(row => row.capabilities?.type === 'chat' && row.policy?.state !== 'disabled' && row.supported_endpoints?.some(endpoint => endpoint === '/responses' || endpoint === '/chat/completions'));
}
export async function usage(grant, http, signal, editorVersion) {
    const response = await http('https://api.github.com/copilot_internal/user', { headers: { ...headers(editorVersion), authorization: `Bearer ${grant.githubToken}` }, signal });
    if ([403, 404].includes(response.status))
        return { supported: false, windows: [], fetchedAt: Date.now() };
    if (!response.ok)
        throw new SubscriptionError(response.status === 401 ? 'auth-required' : 'network');
    const quota = z.object({ percent_remaining: z.number().finite().optional(), unlimited: z.boolean().optional(), entitlement: z.number().finite().optional(), remaining: z.number().finite().optional() });
    const wire = z.object({ copilot_plan: z.string().optional(), quota_reset_date_utc: z.string().optional(), quota_reset_date: z.string().optional(), quota_snapshots: z.record(z.string(), quota).optional() }).parse(await response.json());
    const reset = Date.parse(wire.quota_reset_date_utc ?? wire.quota_reset_date ?? '');
    const windows = Object.entries(wire.quota_snapshots ?? {}).flatMap(([label, value]) => value.unlimited === true ? [{ label, unlimited: true }] : value.percent_remaining !== undefined ? [{ label, usedPercent: 100 - value.percent_remaining, ...(Number.isFinite(reset) ? { resetsAt: reset } : {}) }] : value.entitlement !== undefined && value.remaining !== undefined && value.entitlement > 0 ? [{ label, used: value.entitlement - value.remaining, limit: value.entitlement, ...(Number.isFinite(reset) ? { resetsAt: reset } : {}) }] : []);
    return { supported: windows.length > 0, windows, fetchedAt: Date.now(), ...(wire.copilot_plan ? { plan: wire.copilot_plan } : {}) };
}
