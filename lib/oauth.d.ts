import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization';
export declare function pkce(): {
    verifier: string;
    challenge: string;
};
/** Listen before publishing the URL; reject invalid callbacks without consuming the attempt.
 * @param session DSH attempt owning cancellation and notices.
 * @param build Build the authorization URL with the exact bound redirect URI.
 * @param ports Allowed callback ports; zero lets the OS allocate a port for public ChatGPT OAuth.
 * @param host Loopback host registered for the selected OAuth protocol.
 * @returns Validated callback fields and the exact redirect URI for code exchange.
 */
export declare function callback(session: Pick<AuthorizationSession, 'signal' | 'notify'>, build: (redirect: string, state: string) => string, ports?: readonly [number, ...number[]], host?: '127.0.0.1' | 'localhost'): Promise<{
    params: URLSearchParams;
    redirect: string;
}>;
