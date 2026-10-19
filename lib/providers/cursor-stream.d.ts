import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { type Model } from './cursor.js';
export interface CursorLimits {
    streamIdleTimeoutMs: number;
    cursorToolSettleMs: number;
    defaultContextWindow: number;
}
/** Text-only history projection preserves full tool arguments and their correlated results. */
export declare function transcript(options: GenerateOptions): {
    system: string;
    action: string;
};
/** A fresh HTTP/2 run per DSH step. Native server tools are explicitly declined. */
export declare class CursorAdapter extends LlmAdapter {
    private readonly rows;
    private readonly token;
    private readonly limits;
    private readonly origin;
    constructor(rows: Model[], token: () => Promise<string>, limits: CursorLimits, origin?: string);
    providerInfo(): {
        id: string;
        name: string;
    };
    providerRetryPolicy(): import("@deepseek-ai/dsh-llm").ResolvedRetryPolicy;
    listModels(provider: string): Promise<{
        provider: string;
        id: string;
        name: string;
        inputModalities: readonly ["text"];
    }[]>;
    resolveModel(provider: string, model: string): Promise<{
        provider: string;
        id: string;
        name: string;
        inputModalities: readonly ["text"];
        context: {
            contextWindow: number;
        };
    }>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
