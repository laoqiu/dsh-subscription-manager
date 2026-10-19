import { z } from 'zod';
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization';
import { callback } from '../oauth.js';
import { type Http } from '../http.js';
import type { Usage } from '../protocol.js';
import * as chatgpt from './chatgpt.js';
export declare const Grant: z.ZodUnion<readonly [z.ZodObject<{
    version: z.ZodLiteral<2>;
    platform: z.ZodLiteral<"codex">;
    generation: z.ZodUUID;
    subject: z.ZodString;
    account: z.ZodString;
    accountId: z.ZodString;
    idToken: z.ZodString;
    accessToken: z.ZodString;
    refreshToken: z.ZodString;
    expiresAt: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"codex">;
    generation: z.ZodUUID;
    account: z.ZodString;
    accessToken: z.ZodString;
    expiresAt: z.ZodNumber;
    version: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<3>]>;
    subject: z.ZodString;
    clientId: z.ZodString;
    hostId: z.ZodString;
    idToken: z.ZodString;
    refreshToken: z.ZodString;
    scopes: z.ZodArray<z.ZodString>;
}, z.core.$strip>]>;
export type Grant = z.infer<typeof Grant>;
export declare const key: import("@deepseek-ai/dsh-credentials").CredentialKey;
export type Verify = (token: string, audience: string, nonce?: string) => Promise<{
    subject: string;
    account: string;
    accountId: string;
}>;
/** Reject CLI credentials before entering the public ChatGPT protocol. */
export declare function chatgptGrant(grant: Grant): chatgpt.Grant;
/** Commit only after OIDC identity and the access token agree on the Codex account. */
export declare function login(session: AuthorizationSession, http: Http, verifyId?: Verify, receive?: typeof callback): Promise<Grant>;
/** Refresh within the caller's credential lock, keeping the account and generation. */
export declare function refresh(grant: Grant, http: Http, signal: AbortSignal): Promise<Grant>;
export declare const Model: z.ZodObject<{
    slug: z.ZodString;
    display_name: z.ZodOptional<z.ZodString>;
    context_window: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    max_output_tokens: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    input_modalities: z.ZodOptional<z.ZodArray<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Model = z.infer<typeof Model>;
/** Discover the selected account's catalog without substituting bundled model ids. */
export declare function models(grant: Grant, http: Http, signal: AbortSignal, clientVersion: string): Promise<Model[]>;
/** Read quota windows; reset timestamps never stand in for paid subscription expiration. */
export declare function usage(grant: Grant, http: Http, signal: AbortSignal): Promise<Usage>;
