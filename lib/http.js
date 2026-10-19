/** Bounded Host-only upstream requests with sanitized failures. */
import { fetch, EnvHttpProxyAgent } from 'undici';
import { z } from 'zod';
export class SubscriptionError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
export const errorCode = (error) => error instanceof SubscriptionError ? error.code : error instanceof z.ZodError ? 'invalid-response' : 'network';
/** Own the proxy agent until all admitted requests have settled. */
export class Upstream {
    timeoutMs;
    dispatcher = new EnvHttpProxyAgent();
    constructor(timeoutMs) {
        this.timeoutMs = timeoutMs;
    }
    fetch = async (url, init = {}) => {
        const signal = AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(this.timeoutMs)]);
        try {
            return await fetch(url, { ...init, signal, dispatcher: this.dispatcher, redirect: 'error' });
        }
        catch (error) {
            if (init.signal?.aborted)
                throw new SubscriptionError('cancelled');
            throw new SubscriptionError(signal.aborted ? 'timeout' : 'network');
        }
    };
    async close() { await this.dispatcher.close(); }
}
/** Read JSON without returning a provider's response body in an exception. */
export async function json(http, url, init = {}) {
    const response = await http(url, init);
    if (!response.ok) {
        if (response.status === 400) {
            let raw;
            try {
                raw = await response.json();
            }
            catch (_error) { /* A non-JSON refusal carries no structured OAuth code. */ }
            const failure = z.object({ error: z.string() }).safeParse(raw);
            if (failure.success && ['invalid_grant', 'refresh_token_expired', 'refresh_token_reused', 'refresh_token_invalidated'].includes(failure.data.error))
                throw new SubscriptionError('auth-required');
        }
        throw new SubscriptionError(response.status === 401 ? 'auth-required' : response.status === 403 ? 'denied' : 'network');
    }
    try {
        return await response.json();
    }
    catch (error) {
        throw new SubscriptionError('invalid-response');
    }
}
