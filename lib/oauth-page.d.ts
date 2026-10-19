/** Render a callback receipt or failure; the client owns token verification and the final sign-in result.
 * @param state Public callback result, independent of the later token exchange.
 * @param language Browser Accept-Language; the preferred supported language is used.
 * @returns Static HTML and restrictive response headers.
 */
export declare function callbackPage(state: 'received' | 'denied' | 'invalid', language?: string): {
    html: string;
    headers: Record<string, string>;
};
