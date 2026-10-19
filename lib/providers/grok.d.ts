import { z } from 'zod';
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization';
import { type Http } from '../http.js';
import type { Usage } from '../protocol.js';
export declare const key: import("@deepseek-ai/dsh-credentials").CredentialKey;
export declare const Grant: z.ZodObject<{
    version: z.ZodLiteral<1>;
    platform: z.ZodLiteral<"grok">;
    generation: z.ZodUUID;
    account: z.ZodString;
    accessToken: z.ZodString;
    refreshToken: z.ZodString;
    expiresAt: z.ZodNumber;
}, z.core.$strip>;
export type Grant = z.infer<typeof Grant>;
export declare function login(session: AuthorizationSession, http: Http): Promise<Grant>;
export declare function refresh(grant: Grant, http: Http, signal: AbortSignal): Promise<Grant>;
export declare const Model: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    input_modalities: z.ZodOptional<z.ZodArray<z.ZodString>>;
    output_modalities: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type Model = z.infer<typeof Model>;
export declare function models(grant: Grant, http: Http, signal: AbortSignal): Promise<Model[]>;
export declare function usage(grant: Grant, http: Http, signal: AbortSignal): Promise<Usage>;
