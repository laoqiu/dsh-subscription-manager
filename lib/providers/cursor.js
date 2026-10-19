/** Cursor PKCE pairing, credential rotation, live protobuf catalog and dashboard quota. */
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { attributionHeaders } from '@deepseek-ai/dsh-llm';
import { pkce } from '../oauth.js';
import { json, SubscriptionError } from '../http.js';
import { decodeUsableModels, ConnectFrameReader, CONNECT_END_STREAM_FLAG } from '../../vendor/cursor-wire.js';
export const key = credentialKey('subscription-manager', 'cursor');
export const version = 'cli-2026.02.13-41ac335';
export const Grant = z.object({ version: z.literal(1), platform: z.literal('cursor'), generation: z.uuid(), account: z.string(), subject: z.string(), accessToken: z.string().min(1), refreshToken: z.string(), expiresAt: z.number().positive() });
const tokens = z.object({ accessToken: z.string().min(1), refreshToken: z.string().optional() });
function fromTokens(wire, prior) {
    // These claims describe a token obtained from Cursor's HTTPS pairing endpoint; they do not verify an OIDC identity.
    const claims = decodeJwt(wire.accessToken);
    if (!claims.sub || !claims.exp)
        throw new SubscriptionError('invalid-response');
    if (prior && claims.sub !== prior.subject)
        throw new SubscriptionError('auth-failed');
    return { version: 1, platform: 'cursor', generation: prior?.generation ?? randomUUID(), subject: claims.sub, account: typeof claims.email === 'string' ? claims.email : claims.sub,
        accessToken: wire.accessToken, refreshToken: wire.refreshToken ?? prior?.refreshToken ?? '', expiresAt: claims.exp * 1000 };
}
/** Pair with the browser; the verifier remains on the Host until the attempt ends. */
export async function login(session, http) {
    const proof = pkce(), uuid = randomUUID();
    session.notify({ message: 'Continue in your browser', url: `https://cursor.com/loginDeepControl?${new URLSearchParams({ challenge: proof.challenge, uuid, mode: 'login', redirectTarget: 'cli' })}` });
    for (;;) {
        await delay(1000, undefined, { signal: session.signal });
        const response = await http(`https://api2.cursor.sh/auth/poll?${new URLSearchParams({ uuid, verifier: proof.verifier })}`, { headers: { accept: 'application/json', ...attributionHeaders() }, signal: session.signal });
        if (response.status === 404)
            continue;
        if (!response.ok)
            throw new SubscriptionError('auth-failed');
        return fromTokens(tokens.parse(await response.json()));
    }
}
export async function refresh(grant, http, signal) {
    if (!grant.refreshToken)
        throw new SubscriptionError('auth-required');
    return fromTokens(tokens.parse(await json(http, 'https://api2.cursor.sh/auth/exchange_user_api_key', { method: 'POST', headers: { authorization: `Bearer ${grant.refreshToken}`, 'content-type': 'application/json', ...attributionHeaders() }, body: '{}', signal })), grant);
}
export const Model = z.object({ id: z.string().min(1), name: z.string().optional() });
/** Query the authenticated account; both raw protobuf and Connect envelopes are supported. */
export async function models(grant, http, signal) {
    const response = await http('https://api2.cursor.sh/agent.v1.AgentService/GetUsableModels', { method: 'POST', headers: { authorization: `Bearer ${grant.accessToken}`, 'content-type': 'application/proto', 'x-cursor-client-version': version, 'x-cursor-client-type': 'cli', 'x-ghost-mode': 'true', ...attributionHeaders() }, body: '', signal });
    if (!response.ok)
        throw new SubscriptionError(response.status === 401 ? 'auth-required' : 'network');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 64 * 1024 * 1024)
        throw new SubscriptionError('invalid-response');
    if (!bytes.length)
        return [];
    if (bytes[0] !== 0 && bytes[0] !== 1 && bytes[0] !== CONNECT_END_STREAM_FLAG)
        return z.array(Model).parse(decodeUsableModels(bytes));
    const reader = new ConnectFrameReader(), found = [];
    reader.push(bytes);
    reader.finish();
    for (;;) {
        const frame = await reader.next();
        if (!frame)
            break;
        if (frame.flags & CONNECT_END_STREAM_FLAG)
            break;
        found.push(...z.array(Model).parse(decodeUsableModels(frame.payload)));
    }
    return found;
}
/** Read only quota summary; billing-cycle end is never projected as subscription termination. */
export async function usage(grant, http, signal) {
    const plan = z.object({ totalPercentUsed: z.number().finite().optional(), autoPercentUsed: z.number().finite().optional(), apiPercentUsed: z.number().finite().optional(), used: z.number().finite().optional(), limit: z.number().finite().optional() });
    const wire = z.object({ membershipType: z.string().optional(), isUnlimited: z.boolean().optional(), billingCycleEnd: z.string().optional(), individualUsage: z.object({ plan: plan.optional() }).optional(), teamUsage: z.object({ plan: plan.optional() }).optional() })
        .parse(await json(http, 'https://cursor.com/api/usage-summary', { headers: { cookie: `WorkosCursorSessionToken=${grant.subject}::${grant.accessToken}`, accept: 'application/json', ...attributionHeaders() }, signal }));
    const quota = wire.individualUsage?.plan ?? wire.teamUsage?.plan;
    const windows = [];
    if (wire.isUnlimited === true)
        windows.push({ label: 'Cursor', unlimited: true });
    else if (quota) {
        for (const [label, percent] of [['Total', quota.totalPercentUsed], ['Auto', quota.autoPercentUsed], ['API', quota.apiPercentUsed]])
            if (percent !== undefined)
                windows.push({ label, usedPercent: percent });
        if (!windows.length && quota.used !== undefined && quota.limit !== undefined && quota.limit > 0)
            windows.push({ label: 'Total', usedPercent: quota.used / quota.limit * 100 });
    }
    const end = wire.billingCycleEnd ? Date.parse(wire.billingCycleEnd) : NaN;
    return { supported: windows.length > 0, windows, fetchedAt: Date.now(), ...(wire.membershipType ? { plan: wire.membershipType } : {}), ...(Number.isFinite(end) ? { billingPeriodEnd: end } : {}) };
}
