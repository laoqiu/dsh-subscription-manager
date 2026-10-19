import { z } from 'zod';
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization';
import { type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { callback } from '../oauth.js';
import { type Http } from '../http.js';
import type { Usage } from '../protocol.js';
export declare const Grant: z.ZodObject<{
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
}, z.core.$strip>;
export type Grant = z.infer<typeof Grant>;
export type Verify = (token: string, audience: string, nonce?: string) => Promise<{
    subject: string;
    account: string;
}>;
/** Verify identity before using the ID token's subject or email for the account view. */
export declare const verify: Verify;
/** Persist one host identifier under the credential provider's cross-process lock. */
export declare function hostId(credentials: CredentialProvider): Promise<string>;
/** Register a public client; credentials remain uncommitted until identity and scopes pass. */
export declare function login(session: AuthorizationSession, http: Http, host: string, verifyId?: Verify, receive?: typeof callback): Promise<Grant>;
/** Rotate the whole token set under the caller's credential lock, keeping its registration. */
export declare function refresh(grant: Grant, http: Http, signal: AbortSignal): Promise<Grant>;
export declare const Model: z.ZodObject<{
    slug: z.ZodString;
    display_name: z.ZodOptional<z.ZodString>;
    visibility: z.ZodString;
    context_window: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    max_output_tokens: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    input_modalities: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type Model = z.infer<typeof Model>;
/** Discover only the signed-in account's publicly listed models, preserving server order. */
export declare function models(grant: Grant, http: Http, signal: AbortSignal): Promise<Model[]>;
/** The documented public flow links quota tracking to ChatGPT Settings, without a quota API. */
export declare function usage(grant: Grant): Promise<Usage>;
