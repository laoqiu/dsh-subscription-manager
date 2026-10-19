import type { ErrorCode } from './protocol.js';
export declare class SubscriptionError extends Error {
    readonly code: ErrorCode;
    constructor(code: ErrorCode);
}
export declare const errorCode: (error: unknown) => ErrorCode;
export type Http = (url: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<Pick<Response, 'status' | 'ok' | 'json' | 'arrayBuffer'>>;
/** Own the proxy agent until all admitted requests have settled. */
export declare class Upstream {
    private readonly timeoutMs;
    private readonly dispatcher;
    constructor(timeoutMs: number);
    readonly fetch: Http;
    close(): Promise<void>;
}
/** Read JSON without returning a provider's response body in an exception. */
export declare function json(http: Http, url: string, init?: Parameters<Http>[1]): Promise<unknown>;
