/** Native DSH settings and subscription LLM routes. No standalone server. */
import type { Context } from '@deepseek-ai/cordis';
import schema from '@deepseek-ai/schemastery';
import { z } from 'zod';
export declare const name = "subscription-manager";
export declare const inject: string[];
declare const options: z.ZodObject<{
    requestTimeoutMs: z.ZodDefault<z.ZodNumber>;
    authTimeoutMs: z.ZodDefault<z.ZodNumber>;
    streamIdleTimeoutMs: z.ZodDefault<z.ZodNumber>;
    cursorToolSettleMs: z.ZodDefault<z.ZodNumber>;
    copilotEditorVersion: z.ZodDefault<z.ZodString>;
    codexAuthMode: z.ZodDefault<z.ZodEnum<{
        codex: "codex";
        chatgpt: "chatgpt";
    }>>;
    codexClientVersion: z.ZodDefault<z.ZodString>;
    defaultContextWindow: z.ZodDefault<z.ZodNumber>;
    defaultMaxTokens: z.ZodDefault<z.ZodNumber>;
    maxRequestImageBytes: z.ZodDefault<z.ZodNumber>;
    requestImagePixelBudget: z.ZodDefault<z.ZodNumber>;
    requestImageMaxBytes: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export type Config = z.input<typeof options>;
export declare const Config: schema<Schemastery.ObjectS<NoInfer<{
    [k: string]: schema<"codex" | "chatgpt", "codex" | "chatgpt", "plain"> | schema<string, string, "plain"> | schema<number, number, "plain">;
}>>, Schemastery.ObjectT<NoInfer<{
    [k: string]: schema<"codex" | "chatgpt", "codex" | "chatgpt", "plain"> | schema<string, string, "plain"> | schema<number, number, "plain">;
}>>, "plain">;
/** Register subscription settings, authorization and native LLM routes.
 * @param ctx Existing Host services, including durable credentials and authorization.
 * @param config Validated operation limits; omitted values resolve once at load.
 */
export declare function apply(ctx: Context, config?: Config): void;
export {};
