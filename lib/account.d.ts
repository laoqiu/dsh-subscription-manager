import type { AuthorizationService, AuthorizationSession } from '@deepseek-ai/dsh-authorization';
import type { CredentialKey, CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmRuntime, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm';
import { AttemptId, type Platform, type Usage, type View } from './protocol.js';
interface Grant {
    generation: string;
    account: string;
    expiresAt: number;
    accessToken: string;
}
/** Provider-owned protocols, with no credentials exposed to the public view. */
export interface Driver<G extends Grant> {
    platform: Platform;
    label: string;
    key: CredentialKey;
    parse(value: unknown): G;
    login(session: AuthorizationSession): Promise<G>;
    refresh(grant: G, signal: AbortSignal): Promise<G>;
    needsRefresh?(grant: G): boolean;
    models(grant: G, signal: AbortSignal, token: () => Promise<string>): Promise<LlmAdapter>;
    usage(grant: G, signal: AbortSignal): Promise<Usage>;
}
/** Independent lifetime per platform; reads coalesce but never block another platform. */
export declare class Account<G extends Grant> extends LlmAdapter {
    readonly driver: Driver<G>;
    private readonly credentials;
    private readonly authorization;
    private readonly llm;
    private readonly authTimeoutMs;
    private view;
    private adapter;
    private registration;
    private lifetime;
    private generation;
    private closing;
    private blocked;
    private deletionFailed;
    private attempt;
    private readonly jobs;
    private readonly reads;
    readonly route: string;
    constructor(driver: Driver<G>, credentials: CredentialProvider, authorization: AuthorizationService, llm: LlmRuntime, authTimeoutMs: number);
    snapshot(): View;
    providerInfo(): {
        id: string;
        name: string;
    };
    providerRetryPolicy(): import("@deepseek-ai/dsh-llm").ResolvedRetryPolicy;
    listModels(): Promise<readonly LlmModelInfo[]>;
    private admit;
    private track;
    private readGrant;
    private freshGrant;
    private reset;
    /** Reconcile stored credentials and await this generation's model and usage reads. */
    sync(): Promise<void>;
    /** Coalesce only this target; failed refreshes retain prior data with a visible error. */
    refresh(target: 'usage' | 'models'): Promise<void>;
    /** Begin a DSH authorization flow and expose only its public notice fields. */
    login(): void;
    cancel(id: AttemptId): void;
    /** Quiesce refresh and authorization before deletion so no late response resurrects a login. */
    logout(): Promise<void>;
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<import("@deepseek-ai/dsh-llm").LlmResolvedModelInfo>;
    private dispatch;
    close(): Promise<void>;
}
export {};
