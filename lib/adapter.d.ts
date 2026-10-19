/** Native DSH wire translation delegated to the installed pi-ai adapter. */
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { Model as CodexModel } from './providers/codex.js';
import type { Model as CopilotModel } from './providers/copilot.js';
import type { Model as GrokModel } from './providers/grok.js';
export interface Limits {
    streamIdleTimeoutMs: number;
    defaultContextWindow: number;
    defaultMaxTokens: number;
    maxRequestImageBytes: number;
    requestImagePixelBudget: number;
    requestImageMaxBytes: number;
}
/** Materialize only discovered models, borrowing known capacity facts from the installed catalog. */
export declare function codexModels(rows: CodexModel[], limits: Limits): Model<'openai-codex-responses'>[];
/** Use the same live catalog projection for the retained public ChatGPT protocol. */
export declare function chatgptModels(rows: CodexModel[], limits: Limits): Model<'openai-responses'>[];
/** Create a frozen catalog; credentials resolve through this account only, with no ambient fallback. */
export declare function responsesAdapter(models: Model<Api>[], limits: Limits, token: () => Promise<string>, attachments: () => AttachmentStore | undefined, route?: string, label?: string): PiAiAdapter;
/** Copilot endpoint choice follows each account catalog; never advertise unsupported wires. */
export declare function copilotModels(rows: CopilotModel[], limits: Limits, headers: Record<string, string>): Model<Api>[];
/** Use xAI's live ids with known protocol capacities when available. */
export declare function grokModels(rows: GrokModel[], limits: Limits): Model<'openai-responses'>[];
