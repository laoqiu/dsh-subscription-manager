/** Sign in with ChatGPT: dynamically registered OAuth and the public Responses API. */
import { randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { attributionHeaders } from '@deepseek-ai/dsh-llm';
import { callback, pkce } from '../oauth.js';
import { json, SubscriptionError } from '../http.js';
const common = z.object({ platform: z.literal('codex'), generation: z.uuid(), account: z.string(), accessToken: z.string().min(1), expiresAt: z.number().positive() });
export const Grant = common.extend({
    version: z.union([z.literal(1), z.literal(3)]), subject: z.string().min(1), clientId: z.string().startsWith('oaiapp_'),
    hostId: z.string().min(1), idToken: z.string().min(1), refreshToken: z.string().min(1), scopes: z.array(z.string()),
});
const hostKey = credentialKey('subscription-manager', 'host');
const resource = 'https://api.openai.com/v1';
const directScope = 'chatgpt.tokens.use.direct';
const tokenUrl = 'https://auth.openai.com/api/accounts/oauth/token';
const tokenResponse = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), id_token: z.string().min(1).optional(), expires_in: z.number().positive(), scope: z.string().min(1) });
const jwks = createRemoteJWKSet(new URL('https://auth.openai.com/.well-known/jwks.json'));
/** Verify identity before using the ID token's subject or email for the account view. */
export const verify = async (token, audience, nonce) => {
    const { payload } = await jwtVerify(token, jwks, { issuer: 'https://auth.openai.com', audience, requiredClaims: ['exp', 'sub', ...(nonce === undefined ? [] : ['nonce'])] });
    if ((nonce !== undefined && payload.nonce !== nonce) || !payload.sub)
        throw new SubscriptionError('auth-failed');
    return { subject: payload.sub, account: typeof payload.email === 'string' ? payload.email : payload.sub };
};
/** Persist one host identifier under the credential provider's cross-process lock. */
export async function hostId(credentials) {
    const host = z.object({ version: z.literal(1), hostId: z.templateLiteral(['urn:uuid:', z.uuid()]) });
    const record = await credentials.modifyRecord(hostKey, async (previous) => {
        if (previous) {
            if (previous.kind !== 'grant')
                throw new SubscriptionError('storage-failed');
            host.parse(previous.payload);
            return undefined;
        }
        return { kind: 'grant', payload: { version: 1, hostId: `urn:uuid:${randomUUID()}` } };
    });
    if (record?.kind !== 'grant')
        throw new SubscriptionError('storage-failed');
    return host.parse(record.payload).hostId;
}
function current(grant) {
    if (!grant.scopes.includes(directScope))
        throw new SubscriptionError('denied');
}
function tokenFields(wire) {
    const scopes = wire.scope.trim().split(/\s+/);
    if (!scopes.includes(directScope))
        throw new SubscriptionError('denied');
    return { accessToken: wire.access_token, refreshToken: wire.refresh_token, scopes, expiresAt: Date.now() + wire.expires_in * 1000 };
}
/** Register a public client; credentials remain uncommitted until identity and scopes pass. */
export async function login(session, http, host, verifyId = verify, receive = callback) {
    const proof = pkce(), nonce = randomBytes(32).toString('base64url');
    const { params, redirect } = await receive(session, (redirectUri, state) => {
        const query = new URLSearchParams({ client_id: 'dynamic_agent_client', agent_name_hint: 'DeepSeek Harness', ext_agent_host_id: host, response_type: 'code', redirect_uri: redirectUri, resource, scope: `openid profile email offline_access resource.invoke ${directScope}`, state, nonce, code_challenge_method: 'S256', code_challenge: proof.challenge });
        return `https://auth.openai.com/api/accounts/authorize?${query}`;
    });
    const clientId = params.get('client_id');
    if (!clientId?.startsWith('oaiapp_'))
        throw new SubscriptionError('auth-failed');
    const wire = tokenResponse.parse(await json(http, tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: session.signal,
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code: params.get('code'), code_verifier: proof.verifier, redirect_uri: redirect, resource }).toString() }));
    if (!wire.id_token)
        throw new SubscriptionError('auth-failed');
    let identity;
    try {
        identity = await verifyId(wire.id_token, clientId, nonce);
    }
    catch (error) {
        throw new SubscriptionError('auth-failed');
    }
    return { version: 3, platform: 'codex', generation: randomUUID(), ...identity, clientId, hostId: host, idToken: wire.id_token, ...tokenFields(wire) };
}
/** Rotate the whole token set under the caller's credential lock, keeping its registration. */
export async function refresh(grant, http, signal) {
    current(grant);
    const wire = tokenResponse.parse(await json(http, tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal,
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: grant.clientId, refresh_token: grant.refreshToken, resource }).toString() }));
    if (wire.id_token) {
        let identity;
        try {
            identity = await verify(wire.id_token, grant.clientId);
        }
        catch (error) {
            throw new SubscriptionError('auth-failed');
        }
        if (identity.subject !== grant.subject)
            throw new SubscriptionError('auth-failed');
    }
    return { ...grant, ...tokenFields(wire), idToken: wire.id_token ?? grant.idToken };
}
export const Model = z.object({ slug: z.string().min(1), display_name: z.string().min(1).optional(), visibility: z.string(), context_window: z.number().positive().nullish(), max_output_tokens: z.number().positive().nullish(), input_modalities: z.array(z.string()).optional() });
/** Discover only the signed-in account's publicly listed models, preserving server order. */
export async function models(grant, http, signal) {
    current(grant);
    const wire = z.object({ models: z.array(Model) }).parse(await json(http, `${resource}/models`, { headers: { authorization: `Bearer ${grant.accessToken}`, accept: 'application/json', ...attributionHeaders() }, signal }));
    return wire.models.filter(model => model.visibility === 'list');
}
/** The documented public flow links quota tracking to ChatGPT Settings, without a quota API. */
export async function usage(grant) {
    current(grant);
    return { supported: false, windows: [], fetchedAt: Date.now(), url: 'https://chatgpt.com/settings/usage' };
}
