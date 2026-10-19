/** Native DSH wire translation delegated to the installed pi-ai adapter. */
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import { createProvider } from '@earendil-works/pi-ai/models';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAICodexResponsesApi } from '@earendil-works/pi-ai/api/openai-codex-responses.lazy';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { githubCopilotProvider } from '@earendil-works/pi-ai/providers/github-copilot';
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai';
import { attributionHeaders, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import { z } from 'zod';
import { SubscriptionError } from './http.js';
/** Materialize only discovered models, borrowing known capacity facts from the installed catalog. */
export function codexModels(rows, limits) {
    return subscriptionModels(rows, limits, openaiCodexProvider().getModels().filter((model) => model.api === 'openai-codex-responses'), 'openai-codex-responses', 'https://chatgpt.com/backend-api');
}
/** Use the same live catalog projection for the retained public ChatGPT protocol. */
export function chatgptModels(rows, limits) {
    return subscriptionModels(rows, limits, openaiProvider().getModels().filter((model) => model.api === 'openai-responses'), 'openai-responses', 'https://api.openai.com/v1');
}
function subscriptionModels(rows, limits, known, api, baseUrl) {
    return rows.map(row => {
        const base = known.find(model => model.id === row.slug);
        const input = row.input_modalities ? row.input_modalities.filter((value) => value === 'text' || value === 'image') : base?.input ?? ['text'];
        return { ...base, id: row.slug, name: row.display_name ?? row.slug, provider: 'subscription-codex', api, baseUrl,
            contextWindow: row.context_window ?? base?.contextWindow ?? limits.defaultContextWindow,
            maxTokens: row.max_output_tokens ?? base?.maxTokens ?? limits.defaultMaxTokens,
            input, reasoning: base?.reasoning ?? false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    });
}
/** Create a frozen catalog; credentials resolve through this account only, with no ambient fallback. */
export function responsesAdapter(models, limits, token, attachments, route = 'subscription-codex', label = 'Codex') {
    const responses = openAIResponsesApi(), completions = openAICompletionsApi(), codex = openAICodexResponsesApi();
    const codexFetch = (input, init) => {
        const headers = new Headers(init?.headers);
        for (const [name, value] of Object.entries(attributionHeaders()))
            headers.set(name, value);
        headers.set('originator', 'codex_cli_rs');
        return globalThis.fetch(input, { ...init, headers });
    };
    const wireModel = (model) => ({ ...model, provider: route === 'subscription-codex' ? 'openai' : route === 'subscription-copilot' ? 'github-copilot' : model.provider });
    const api = {
        stream: (model, context, options) => model.api === 'openai-codex-responses' ? codex.stream({ ...model, provider: 'openai-codex' }, context, { ...options, transport: 'sse', maxRetries: 0, fetch: codexFetch }) : (model.api === 'openai-completions' ? completions : responses).stream(wireModel(model), context, route === 'subscription-codex' ? { ...options, onPayload: chatgptPayload } : options),
        streamSimple: (model, context, options) => model.api === 'openai-codex-responses' ? codex.streamSimple({ ...model, provider: 'openai-codex' }, context, { ...options, transport: 'sse', maxRetries: 0, fetch: codexFetch }) : (model.api === 'openai-completions' ? completions : responses).streamSimple(wireModel(model), context, route === 'subscription-codex' ? { ...options, onPayload: chatgptPayload } : options),
    };
    const provider = createProvider({ id: route, name: label, models, api, auth: { apiKey: { name: 'Subscription', resolve: async () => ({ auth: { apiKey: await token() } }) } } });
    const profile = {
        ...limits, provider: route, displayName: label, piProvider: provider, retryPolicy: resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, route), modelErrors: new Map(), configuredMaxTokens: new Map(),
    };
    const profiles = new Map([[route, profile]]);
    return new PiAiAdapter({ profiles: () => profiles, resolveApiKey: token,
        auth: { authContext: { env: async () => undefined, fileExists: async () => false }, credentials: {
                read: async () => undefined, list: async () => [], delete: async () => { throw new SubscriptionError('unsupported'); }, modify: async () => { throw new SubscriptionError('unsupported'); },
            } }, resolveAttachments: attachments,
    });
}
/** Apply the public subscription endpoint's field and tool restrictions to SDK requests. */
function chatgptPayload(payload) {
    const request = z.object({ input: z.array(z.unknown()), tools: z.array(z.unknown()).optional() }).passthrough().parse(payload);
    const systemMessage = z.object({ role: z.literal('system') }).passthrough();
    request.input = request.input.map(item => {
        const parsed = systemMessage.safeParse(item);
        return parsed.success ? { ...parsed.data, role: 'developer' } : item;
    });
    if (request.tools?.length)
        request.input = [{ type: 'additional_tools', role: 'developer', tools: request.tools }, ...request.input];
    const omitted = new Set(['tools', 'background', 'conversation', 'max_output_tokens', 'max_tool_calls', 'metadata', 'moderation', 'multi_agent', 'prompt', 'prompt_cache_retention', 'safety_identifier', 'temperature', 'top_logprobs', 'top_p', 'truncation', 'user', 'previous_response_id']);
    return Object.fromEntries(Object.entries({ ...request, store: false, stream: true }).filter(([key]) => !omitted.has(key)));
}
/** Copilot endpoint choice follows each account catalog; never advertise unsupported wires. */
export function copilotModels(rows, limits, headers) {
    const known = githubCopilotProvider().getModels();
    return rows.map(row => {
        const base = known.find(model => model.id === row.id);
        return { id: row.id, name: row.name ?? row.id, provider: 'subscription-copilot', api: row.supported_endpoints?.includes('/responses') ? 'openai-responses' : 'openai-completions', baseUrl: 'https://api.githubcopilot.com', headers,
            input: row.capabilities?.supports?.vision === true ? ['text', 'image'] : ['text'], reasoning: false,
            contextWindow: row.capabilities?.limits?.max_context_window_tokens ?? base?.contextWindow ?? limits.defaultContextWindow, maxTokens: row.capabilities?.limits?.max_output_tokens ?? base?.maxTokens ?? limits.defaultMaxTokens,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    });
}
/** Use xAI's live ids with known protocol capacities when available. */
export function grokModels(rows, limits) {
    const known = xaiProvider().getModels();
    return rows.map(row => {
        const base = known.find(model => model.id === row.id);
        return { ...base, id: row.id, name: row.name ?? row.id, provider: 'subscription-grok', api: 'openai-responses', baseUrl: 'https://api.x.ai/v1',
            input: row.input_modalities ? row.input_modalities.filter((item) => item === 'text' || item === 'image') : base?.input ?? ['text'],
            reasoning: base?.reasoning ?? false, contextWindow: base?.contextWindow ?? limits.defaultContextWindow, maxTokens: base?.maxTokens ?? limits.defaultMaxTokens, cost: base?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    });
}
