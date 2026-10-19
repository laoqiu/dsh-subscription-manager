import { z } from 'zod';
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization';
import { type Http } from '../http.js';
import type { Usage } from '../protocol.js';
export declare const key: import("@deepseek-ai/dsh-credentials").CredentialKey;
export declare const version = "cli-2026.02.13-41ac335";
export declare const Grant: z.ZodObject<{
    version: z.ZodLiteral<1>;
    platform: z.ZodLiteral<"cursor">;
    generation: z.ZodUUID;
    account: z.ZodString;
    subject: z.ZodString;
    accessToken: z.ZodString;
    refreshToken: z.ZodString;
    expiresAt: z.ZodNumber;
}, z.core.$strip>;
export type Grant = z.infer<typeof Grant>;
/** Pair with the browser; the verifier remains on the Host until the attempt ends. */
export declare function login(session: AuthorizationSession, http: Http): Promise<Grant>;
export declare function refresh(grant: Grant, http: Http, signal: AbortSignal): Promise<Grant>;
export declare const Model: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Model = z.infer<typeof Model>;
/** Query the authenticated account; both raw protobuf and Connect envelopes are supported. */
export declare function models(grant: Grant, http: Http, signal: AbortSignal): Promise<Model[]>;
/** Read only quota summary; billing-cycle end is never projected as subscription termination. */
export declare function usage(grant: Grant, http: Http, signal: AbortSignal): Promise<Usage>;
