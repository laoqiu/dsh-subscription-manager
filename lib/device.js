/** RFC 8628 waiting and slowdown, shared by subscription device flows. */
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { json, SubscriptionError } from './http.js';
/** Keep device_code on Host; only user_code and the validated verification page cross to Client. */
export async function device(session, http, spec) {
    const headers = { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' };
    const wire = z.object({ device_code: z.string().min(1), user_code: z.string().min(1), verification_uri: z.url(), interval: z.number().nonnegative().optional(), expires_in: z.number().positive() })
        .parse(await json(http, spec.start, { method: 'POST', headers, body: new URLSearchParams({ client_id: spec.clientId, scope: spec.scope }).toString(), signal: session.signal }));
    if (new URL(wire.verification_uri).origin !== spec.verificationOrigin)
        throw new SubscriptionError('invalid-response');
    const signal = AbortSignal.any([session.signal, AbortSignal.timeout(Math.min(2_147_483_647, wire.expires_in * 1000))]);
    session.notify({ message: 'Enter this code in your browser', url: wire.verification_uri, code: wire.user_code });
    let interval = Math.max(1, wire.interval ?? 5) * 1000;
    for (;;) {
        await delay(interval, undefined, { signal });
        const response = await http(spec.token, { method: 'POST', headers, signal, body: new URLSearchParams({ client_id: spec.clientId, device_code: wire.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }).toString() });
        const value = await response.json();
        const pending = z.object({ error: z.string() }).safeParse(value);
        if (pending.success) {
            if (pending.data.error === 'authorization_pending')
                continue;
            if (pending.data.error === 'slow_down') {
                interval += 5000;
                continue;
            }
            throw new SubscriptionError(pending.data.error === 'expired_token' ? 'timeout' : 'denied');
        }
        if (!response.ok)
            throw new SubscriptionError('auth-failed');
        return value;
    }
}
