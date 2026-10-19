/** Temporary loopback callback owned by one cancellable PKCE attempt. */
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { SubscriptionError } from './http.js';
import { callbackPage } from './oauth-page.js';
export function pkce() {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
/** Listen before publishing the URL; reject invalid callbacks without consuming the attempt.
 * @param session DSH attempt owning cancellation and notices.
 * @param build Build the authorization URL with the exact bound redirect URI.
 * @param ports Allowed callback ports; zero lets the OS allocate a port for public ChatGPT OAuth.
 * @param host Loopback host registered for the selected OAuth protocol.
 * @returns Validated callback fields and the exact redirect URI for code exchange.
 */
export async function callback(session, build, ports = [0], host = '127.0.0.1') {
    session.signal.throwIfAborted();
    const state = randomBytes(32).toString('base64url');
    let resolveResult;
    let rejectResult;
    let consumed = false;
    const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
    // Cancellation may precede the listener's bind; the awaited result still owns its rejection.
    void result.catch((_error) => { });
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const valid = request.method === 'GET' && url.pathname === '/auth/callback' && url.searchParams.getAll('state').length === 1 && url.searchParams.get('state') === state
            && ['code', 'error', 'client_id'].every(key => url.searchParams.getAll(key).length <= 1);
        const status = !valid ? 400 : consumed ? 410 : 200;
        const page = callbackPage(status !== 200 ? 'invalid' : url.searchParams.has('error') || !url.searchParams.get('code') ? 'denied' : 'received', request.headers['accept-language']);
        response.writeHead(status, page.headers);
        response.end(page.html);
        if (status !== 200)
            return;
        consumed = true;
        if (url.searchParams.has('error'))
            rejectResult(new SubscriptionError('denied'));
        else if (!url.searchParams.get('code'))
            rejectResult(new SubscriptionError('auth-failed'));
        else
            resolveResult(url.searchParams);
    });
    const abort = () => { rejectResult(new SubscriptionError('cancelled')); };
    session.signal.addEventListener('abort', abort, { once: true });
    try {
        for (const [index, port] of ports.entries()) {
            session.signal.throwIfAborted();
            try {
                await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.removeListener('error', reject); resolve(); }); });
                break;
            }
            catch (error) {
                if (!(error instanceof Error && 'code' in error && error.code === 'EADDRINUSE'))
                    throw error;
                if (index === ports.length - 1)
                    throw new SubscriptionError('callback-busy');
            }
        }
        const address = server.address();
        if (address === null || typeof address === 'string')
            throw new SubscriptionError('auth-failed');
        const redirect = `http://${host}:${address.port}/auth/callback`;
        server.on('error', rejectResult);
        session.signal.throwIfAborted();
        session.notify({ message: 'Continue in your browser', url: build(redirect, state) });
        return { params: await result, redirect };
    }
    finally {
        session.signal.removeEventListener('abort', abort);
        server.closeAllConnections();
        await new Promise(resolve => { server.close(() => { resolve(); }); });
    }
}
