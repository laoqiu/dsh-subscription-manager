/** Cursor's bidirectional protocol; each DSH step reconstructs history without hidden checkpoints. */
import http2 from 'node:http2';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LlmAdapter, LlmError, ToolCallId, attributionHeaders, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import * as wire from '../../vendor/cursor-wire.js';
import { version } from './cursor.js';
const bytes = z.instanceof(Uint8Array);
const outer = z.object({ case: z.string(), value: z.unknown() });
const interaction = z.object({ type: z.string(), text: z.string().optional() });
const kv = z.object({ id: z.number(), case: z.string(), blobId: bytes.optional(), blobData: bytes.optional() });
const exec = z.object({ id: z.number(), execId: z.string().optional(), case: z.string(), args: z.object({ name: z.string(), toolName: z.string(), toolCallId: z.string(), args: z.record(z.string(), bytes) }).optional() }).passthrough();
/** Text-only history projection preserves full tool arguments and their correlated results. */
export function transcript(options) {
    const content = (blocks) => blocks.map(block => {
        switch (block.type) {
            case 'text': return { type: 'text', text: block.text };
            case 'tool-call': return { type: 'tool-call', id: block.id, name: block.name, arguments: block.arguments };
            case 'reasoning': return null;
            default: throw new LlmError('Unsupported Cursor request content', 'UNSUPPORTED_OPTION');
        }
    }).filter(value => value !== null);
    const system = [options.system, ...options.messages.filter(message => message.role === 'system').map(message => message.content.filter(block => block.type === 'text').map(block => block.text).join('\n'))].filter(Boolean).join('\n');
    const messages = options.messages.filter(message => message.role !== 'system').map(message => ({ role: message.role, content: content(message.content), ...(message.role === 'tool' ? { toolCallId: message.toolCallId, isError: message.isError === true } : {}) }));
    return { system, action: JSON.stringify(messages) };
}
/** A fresh HTTP/2 run per DSH step. Native server tools are explicitly declined. */
export class CursorAdapter extends LlmAdapter {
    rows;
    token;
    limits;
    origin;
    constructor(rows, token, limits, origin = 'https://api2.cursor.sh') {
        super();
        this.rows = rows;
        this.token = token;
        this.limits = limits;
        this.origin = origin;
    }
    providerInfo() { return { id: 'subscription-cursor', name: 'Cursor' }; }
    providerRetryPolicy() { return resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'subscription-cursor'); }
    async listModels(provider) { return this.rows.map(row => ({ provider, id: row.id, name: row.name ?? row.id, inputModalities: ['text'] })); }
    async resolveModel(provider, model) {
        const row = this.rows.find(row => row.id === model);
        if (!row)
            throw new LlmError('Refresh Cursor models', 'INVALID_MODEL');
        return { provider, id: model, name: row.name ?? model, inputModalities: ['text'], context: { contextWindow: this.limits.defaultContextWindow } };
    }
    async *stream(options) {
        if (options.stop || options.reasoningEffort || options.temperature !== undefined || options.maxTokens !== undefined)
            throw new LlmError('Cursor does not expose this request option', 'UNSUPPORTED_OPTION');
        const access = await this.token(), history = transcript(options);
        options.signal?.throwIfAborted();
        const blobs = new Map(), rootPromptBlobIds = [];
        if (history.system) {
            const value = Buffer.from(JSON.stringify({ role: 'system', content: history.system }));
            const id = createHash('sha256').update(value).digest();
            blobs.set(id.toString('hex'), value);
            rootPromptBlobIds.push(id);
        }
        const payload = wire.encodeRunMessage(wire.encodeRunRequest({ conversationState: wire.encodeConversationState({ rootPromptBlobIds, turns: [] }), action: wire.encodeUserMessageAction(wire.encodeUserMessage({ text: history.action, messageId: randomUUID() })), modelDetails: wire.encodeModelDetails(options.model), conversationId: randomUUID() }));
        const tools = (options.tools ?? []).map(tool => wire.encodeMcpToolDefinition({ name: tool.name, description: tool.description, inputSchema: wire.encodeValue(tool.parameters), providerIdentifier: 'dsh-subscription-manager' }));
        const reader = new wire.ConnectFrameReader(), client = http2.connect(this.origin);
        const closed = new Promise(resolve => { client.once('close', resolve); });
        let idle, settle, heartbeat;
        let text = '', reasoning = '', completed = false;
        const calls = [];
        const fail = (error) => { reader.fail(error); client.destroy(); };
        client.on('error', fail);
        const abort = () => { fail(new LlmError('Cursor request cancelled', 'ABORTED')); };
        options.signal?.addEventListener('abort', abort, { once: true });
        const progress = () => { clearTimeout(idle); idle = setTimeout(() => { fail(new LlmError('Cursor stream timed out', 'TIMEOUT')); }, this.limits.streamIdleTimeoutMs); };
        try {
            const stream = client.request({ ':method': 'POST', ':path': '/agent.v1.AgentService/Run', authorization: `Bearer ${access}`, 'content-type': 'application/connect+proto', 'connect-protocol-version': '1', 'connect-accept-encoding': 'gzip', te: 'trailers', 'x-ghost-mode': 'true', 'x-cursor-client-version': version, 'x-cursor-client-type': 'cli', ...attributionHeaders() });
            stream.on('data', (chunk) => { try {
                reader.push(chunk);
            }
            catch (error) {
                fail(new LlmError('Invalid Cursor frame', 'CURSOR_PROTOCOL'));
            } });
            stream.on('error', fail);
            stream.on('end', () => { reader.finish(); });
            const response = once(stream, 'response', { ...(options.signal ? { signal: options.signal } : {}) });
            const write = (value) => { if (!stream.destroyed)
                stream.write(wire.frameEncode(value)); };
            progress();
            write(payload);
            const [headers] = await response;
            if (headers[':status'] !== 200 || !String(headers['content-type']).startsWith('application/connect+proto'))
                throw new LlmError('Cursor refused the request', headers[':status'] === 401 ? 'AUTH' : 'CURSOR_PROTOCOL');
            heartbeat = setInterval(() => { write(new wire.Writer().message(7, new Uint8Array()).finish()); }, 5000);
            for (;;) {
                const frame = await reader.next();
                if (!frame)
                    break;
                if (frame.flags & wire.CONNECT_END_STREAM_FLAG) {
                    const end = z.object({ error: z.unknown().optional() }).parse(JSON.parse(Buffer.from(frame.payload).toString('utf8')));
                    if (end.error !== undefined)
                        throw new LlmError('Cursor ended the request with an error', 'CURSOR_PROTOCOL');
                    completed = true;
                    break;
                }
                const message = outer.parse(wire.decodeAgentServerMessage(frame.payload));
                if (message.case === 'interactionUpdate') {
                    const update = interaction.parse(message.value);
                    if (update.type === 'textDelta' && update.text) {
                        progress();
                        if (!text)
                            yield { type: 'block-start', index: 0, blockType: 'text' };
                        text += update.text;
                        yield { type: 'text-delta', index: 0, text: update.text };
                    }
                    else if (update.type === 'thinkingDelta' && update.text) {
                        progress();
                        if (!reasoning)
                            yield { type: 'block-start', index: 1, blockType: 'reasoning' };
                        reasoning += update.text;
                        yield { type: 'reasoning-delta', index: 1, text: update.text };
                    }
                    else if (update.type === 'turnEnded') {
                        completed = true;
                        break;
                    }
                }
                else if (message.case === 'kvServerMessage') {
                    const value = kv.parse(message.value);
                    if (value.case === 'getBlobArgs' && value.blobId)
                        write(wire.encodeKvClientMessage(wire.encodeGetBlobResult(value.id, blobs.get(Buffer.from(value.blobId).toString('hex')))));
                    else if (value.case === 'setBlobArgs' && value.blobId && value.blobData) {
                        blobs.set(Buffer.from(value.blobId).toString('hex'), Uint8Array.from(value.blobData));
                        write(wire.encodeKvClientMessage(wire.encodeSetBlobResult(value.id)));
                    }
                }
                else if (message.case === 'execServerMessage') {
                    const value = exec.parse(message.value);
                    const reply = (field, bytes) => { write(wire.encodeExecClientMessageEnvelope(wire.encodeExecClientMessage(value.id, value.execId, field, bytes))); };
                    if (value.case === 'requestContextArgs')
                        reply(10, wire.encodeRequestContextResult(tools));
                    else if (value.case === 'mcpArgs' && value.args) {
                        const name = value.args.toolName || value.args.name;
                        if (!(options.tools ?? []).some(tool => tool.name === name)) {
                            reply(11, new wire.Writer().message(2, new wire.Writer().string(1, 'Unknown DSH tool').finish()).finish());
                            continue;
                        }
                        const args = Object.fromEntries(Object.entries(value.args.args).map(([key, bytes]) => [key, wire.decodeValue(bytes)]));
                        const id = value.args.toolCallId || value.execId || randomUUID();
                        if (!calls.some(call => call.id === id))
                            calls.push({ id, name, arguments: JSON.stringify(args) });
                        progress();
                        settle ??= setTimeout(() => { reader.finish(); }, this.limits.cursorToolSettleMs);
                    }
                    else {
                        const rejected = wire.rejectionFor(value);
                        if (!rejected)
                            throw new LlmError('Unsupported Cursor tool request', 'CURSOR_PROTOCOL');
                        reply(rejected.field, rejected.payload);
                    }
                }
            }
            if (!completed && !calls.length)
                throw new LlmError('Cursor stream ended before completion', 'CURSOR_PROTOCOL');
            if (text)
                yield { type: 'block-end', index: 0, block: { type: 'text', text } };
            if (reasoning)
                yield { type: 'block-end', index: 1, block: { type: 'reasoning', text: reasoning } };
            for (const [index, call] of calls.entries()) {
                const blockIndex = index + 2, id = ToolCallId(call.id);
                yield { type: 'block-start', index: blockIndex, blockType: 'tool-call' };
                yield { type: 'tool-call-delta', index: blockIndex, id, name: call.name, argumentsDelta: call.arguments };
                yield { type: 'block-end', index: blockIndex, block: { type: 'tool-call', id, name: call.name, arguments: call.arguments } };
            }
            yield { type: 'finish', reason: { kind: calls.length ? 'tool-calls' : 'stop' } };
        }
        finally {
            clearTimeout(idle);
            clearTimeout(settle);
            clearInterval(heartbeat);
            options.signal?.removeEventListener('abort', abort);
            client.destroy();
            await closed;
        }
    }
}
