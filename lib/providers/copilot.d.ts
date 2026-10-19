import { z } from 'zod';
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization';
import { type Http } from '../http.js';
import type { Usage } from '../protocol.js';
export declare const key: import("@deepseek-ai/dsh-credentials").CredentialKey;
export declare const Grant: z.ZodObject<{
    version: z.ZodLiteral<1>;
    platform: z.ZodLiteral<"copilot">;
    generation: z.ZodUUID;
    account: z.ZodString;
    accessToken: z.ZodString;
    expiresAt: z.ZodNumber;
    githubToken: z.ZodString;
    githubRefresh: z.ZodOptional<z.ZodString>;
    githubExpiresAt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type Grant = z.infer<typeof Grant>;
export declare function headers(editorVersion: string): Record<string, string>;
export declare function login(session: AuthorizationSession, http: Http, editorVersion: string): Promise<Grant>;
export declare function refresh(grant: Grant, http: Http, signal: AbortSignal, editorVersion: string): Promise<Grant>;
export declare const Model: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    supported_endpoints: z.ZodOptional<z.ZodArray<z.ZodString>>;
    policy: z.ZodOptional<z.ZodObject<{
        state: z.ZodString;
    }, z.core.$strip>>;
    capabilities: z.ZodOptional<z.ZodObject<{
        type: z.ZodOptional<z.ZodString>;
        limits: z.ZodOptional<z.ZodObject<{
            max_context_window_tokens: z.ZodOptional<z.ZodNumber>;
            max_output_tokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        supports: z.ZodOptional<z.ZodObject<{
            vision: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Model = z.infer<typeof Model>;
export declare function models(grant: Grant, http: Http, signal: AbortSignal, editorVersion: string): Promise<Model[]>;
export declare function usage(grant: Grant, http: Http, signal: AbortSignal, editorVersion: string): Promise<Usage>;
