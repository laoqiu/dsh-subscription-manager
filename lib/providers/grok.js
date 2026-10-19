/** xAI device OAuth and live Grok model/billing reads. */
import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { attributionHeaders } from '@deepseek-ai/dsh-llm';
import { device } from '../device.js';
import { json } from '../http.js';
const clientId = 'b1a00492-073a-47ea-816f-4c329264a828';
export const key = credentialKey('subscription-manager', 'grok');
export const Grant = z.object({ version: z.literal(1), platform: z.literal('grok'), generation: z.uuid(), account: z.string(), accessToken: z.string().min(1), refreshToken: z.string().min(1), expiresAt: z.number().positive() });
const tokens = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), expires_in: z.number().positive() });
export async function login(session, http) {
    const wire = tokens.parse(await device(session, http, { clientId, scope: 'openid profile email offline_access grok-cli:access api:access', start: 'https://auth.x.ai/oauth2/device/code', token: 'https://auth.x.ai/oauth2/token', verificationOrigin: 'https://auth.x.ai' }));
    let account = 'Grok';
    try {
        const claims = decodeJwt(wire.access_token);
        account = typeof claims.email === 'string' ? claims.email : claims.sub ?? account;
    }
    catch (_error) { /* An opaque HTTPS-issued access token has no display identity claims. */ }
    return Grant.parse({ version: 1, platform: 'grok', generation: randomUUID(), account, accessToken: wire.access_token, refreshToken: wire.refresh_token, expiresAt: Date.now() + wire.expires_in * 1000 });
}
export async function refresh(grant, http, signal) {
    const wire = tokens.parse(await json(http, 'https://auth.x.ai/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal,
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: grant.refreshToken }).toString() }));
    return { ...grant, accessToken: wire.access_token, refreshToken: wire.refresh_token ?? grant.refreshToken, expiresAt: Date.now() + wire.expires_in * 1000 };
}
export const Model = z.object({ id: z.string(), name: z.string().optional(), input_modalities: z.array(z.string()).optional(), output_modalities: z.array(z.string()).optional() });
export async function models(grant, http, signal) {
    const wire = z.object({ data: z.array(Model) }).parse(await json(http, 'https://api.x.ai/v1/models', { headers: { authorization: `Bearer ${grant.accessToken}`, ...attributionHeaders() }, signal }));
    return wire.data.filter(row => row.output_modalities ? row.output_modalities.includes('text') && !row.output_modalities.includes('image') : /^grok-/i.test(row.id) && !/imagine|image|video|embed/i.test(row.id));
}
export async function usage(grant, http, signal) {
    const amount = z.object({ val: z.number().finite() });
    const wire = z.object({ subscriptionTier: z.string().optional(), config: z.object({ creditUsagePercent: z.number().finite().optional(), currentPeriod: z.object({ end: z.string().optional(), type: z.string().optional() }).optional(), monthlyLimit: amount.optional(), used: amount.optional(), billingPeriodEnd: z.string().optional() }).optional() })
        .parse(await json(http, 'https://cli-chat-proxy.grok.com/v1/billing?format=credits', { headers: { authorization: `Bearer ${grant.accessToken}`, 'x-xai-token-auth': 'xai-grok-cli', ...attributionHeaders() }, signal }));
    const value = wire.config, percent = value?.creditUsagePercent ?? (value?.used && value.monthlyLimit && value.monthlyLimit.val > 0 ? value.used.val / value.monthlyLimit.val * 100 : undefined);
    const reset = Date.parse(value?.currentPeriod?.end ?? value?.billingPeriodEnd ?? '');
    const windows = percent === undefined ? [] : [{ label: value?.currentPeriod?.type ?? 'Grok', usedPercent: percent, ...(Number.isFinite(reset) ? { resetsAt: reset } : {}) }];
    return { supported: windows.length > 0, windows, fetchedAt: Date.now(), ...(wire.subscriptionTier ? { plan: wire.subscriptionTier } : {}) };
}
