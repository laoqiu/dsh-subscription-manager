/** Codex CLI subscription OAuth, account model catalog and quota. */
import { randomBytes, randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { attributionHeaders } from '@deepseek-ai/dsh-llm';
import { callback, pkce } from '../oauth.js';
import { json, SubscriptionError } from '../http.js';
import * as chatgpt from './chatgpt.js';
const cliGrant = z.object({ version: z.literal(2), platform: z.literal('codex'), generation: z.uuid(), subject: z.string().min(1), account: z.string(), accountId: z.string().min(1), idToken: z.string().min(1), accessToken: z.string().min(1), refreshToken: z.string().min(1), expiresAt: z.number().positive() });
export const Grant = z.union([cliGrant, chatgpt.Grant]);
export const key = credentialKey('subscription-manager', 'codex');
const clientId = 'app_EMoamEEZ73f0CkXaXp7hrann';
const tokenUrl = 'https://auth.openai.com/oauth/token';
const tokenResponse = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), id_token: z.string().min(1).optional(), expires_in: z.number().positive().optional() });
const accessClaims = z.object({ exp: z.number().positive().optional(), 'https://api.openai.com/auth': z.object({ chatgpt_account_id: z.string().min(1) }) });
const verify = async (token, audience, nonce) => {
    const identity = await chatgpt.verify(token, audience, nonce);
    return { ...identity, accountId: accessClaims.parse(decodeJwt(token))['https://api.openai.com/auth'].chatgpt_account_id };
};
function current(grant) {
    if (grant.version !== 2)
        throw new SubscriptionError('reauth-required');
}
/** Reject CLI credentials before entering the public ChatGPT protocol. */
export function chatgptGrant(grant) {
    if (grant.version === 2)
        throw new SubscriptionError('reauth-required');
    return grant;
}
function tokenFields(wire, accountId) {
    const claims = accessClaims.parse(decodeJwt(wire.access_token));
    if (claims['https://api.openai.com/auth'].chatgpt_account_id !== accountId)
        throw new SubscriptionError('auth-failed');
    const expiresAt = wire.expires_in === undefined ? claims.exp === undefined ? undefined : claims.exp * 1000 : Date.now() + wire.expires_in * 1000;
    if (expiresAt === undefined)
        throw new SubscriptionError('invalid-response');
    return { accessToken: wire.access_token, expiresAt };
}
/** Commit only after OIDC identity and the access token agree on the Codex account. */
export async function login(session, http, verifyId = verify, receive = callback) {
    const proof = pkce(), nonce = randomBytes(32).toString('base64url');
    const { params, redirect } = await receive(session, (redirectUri, state) => {
        const query = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'openid profile email offline_access api.connectors.read api.connectors.invoke', state, nonce, code_challenge_method: 'S256', code_challenge: proof.challenge, id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', originator: 'codex_cli_rs' });
        return `https://auth.openai.com/oauth/authorize?${query}`;
    }, [1455, 1457], 'localhost');
    if (params.has('client_id') && params.get('client_id') !== clientId)
        throw new SubscriptionError('auth-failed');
    const wire = tokenResponse.parse(await json(http, tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: session.signal,
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code: params.get('code'), code_verifier: proof.verifier, redirect_uri: redirect }).toString() }));
    if (!wire.id_token || !wire.refresh_token)
        throw new SubscriptionError('auth-failed');
    let identity;
    try {
        identity = await verifyId(wire.id_token, clientId, nonce);
    }
    catch (error) {
        throw new SubscriptionError('auth-failed');
    }
    return { version: 2, platform: 'codex', generation: randomUUID(), ...identity, idToken: wire.id_token, refreshToken: wire.refresh_token, ...tokenFields(wire, identity.accountId) };
}
/** Refresh within the caller's credential lock, keeping the account and generation. */
export async function refresh(grant, http, signal) {
    current(grant);
    const wire = tokenResponse.parse(await json(http, tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal,
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: grant.refreshToken }).toString() }));
    if (wire.id_token) {
        let identity;
        try {
            identity = await verify(wire.id_token, clientId);
        }
        catch (error) {
            throw new SubscriptionError('auth-failed');
        }
        if (identity.subject !== grant.subject || identity.accountId !== grant.accountId)
            throw new SubscriptionError('auth-failed');
    }
    return { ...grant, ...tokenFields(wire, grant.accountId), refreshToken: wire.refresh_token ?? grant.refreshToken, idToken: wire.id_token ?? grant.idToken };
}
export const Model = chatgpt.Model.extend({ visibility: z.string().optional() });
/** Discover the selected account's catalog without substituting bundled model ids. */
export async function models(grant, http, signal, clientVersion) {
    current(grant);
    const wire = z.object({ models: z.array(Model) }).parse(await json(http, `https://chatgpt.com/backend-api/codex/models?client_version=${encodeURIComponent(clientVersion)}`, { headers: headers(grant), signal }));
    return wire.models.filter(model => model.visibility !== 'hide' && model.visibility !== 'none');
}
function headers(grant) {
    return { authorization: `Bearer ${grant.accessToken}`, 'chatgpt-account-id': grant.accountId, originator: 'codex_cli_rs', accept: 'application/json', ...attributionHeaders() };
}
/** Read quota windows; reset timestamps never stand in for paid subscription expiration. */
export async function usage(grant, http, signal) {
    current(grant);
    const wire = z.object({ plan_type: z.string().optional(), rate_limit: z.object({ primary_window: z.unknown().optional(), secondary_window: z.unknown().optional() }).nullish() }).parse(await json(http, 'https://chatgpt.com/backend-api/wham/usage', { headers: headers(grant), signal }));
    const window = z.object({ used_percent: z.number().finite(), reset_at: z.number().finite().optional(), reset_after_seconds: z.number().nonnegative().finite().optional(), limit_window_seconds: z.number().positive().finite().optional() });
    const fetchedAt = Date.now();
    const windows = [wire.rate_limit?.primary_window, wire.rate_limit?.secondary_window].flatMap((raw, index) => {
        const parsed = window.safeParse(raw);
        if (!parsed.success)
            return [];
        const item = parsed.data, seconds = item.limit_window_seconds;
        const matches = (expected) => seconds !== undefined && Math.abs(seconds - expected) <= expected * 0.05;
        const kind = seconds === undefined ? index === 0 ? 'session' : 'weekly' : matches(604800) ? 'weekly' : matches(18000) ? 'session' : 'other';
        const resetsAt = item.reset_at !== undefined && item.reset_at > 0 ? item.reset_at * 1000 : item.reset_after_seconds === undefined ? undefined : fetchedAt + item.reset_after_seconds * 1000;
        return [{ label: seconds === undefined ? kind : `${seconds / 3600}h`, kind, usedPercent: item.used_percent, ...(resetsAt === undefined ? {} : { resetsAt }) }];
    });
    if (!wire.rate_limit && !wire.plan_type)
        throw new SubscriptionError('invalid-response');
    return { supported: true, windows, fetchedAt, ...(wire.plan_type ? { plan: wire.plan_type } : {}) };
}
