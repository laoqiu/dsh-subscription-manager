/** Typed entry points to the pinned protobuf/Connect subset; decoded wire values remain untrusted. */
export class Writer {
  bytes(field: number, bytes: Uint8Array): this
  message(field: number, bytes: Uint8Array): this
  string(field: number, value: string): this
  varint(field: number, value: number): this
  finish(): Uint8Array
}
export class ConnectFrameReader {
  push(bytes: Uint8Array): void
  finish(): void
  fail(error: Error): void
  next(): Promise<{ flags: number; payload: Uint8Array } | undefined>
}
export const CONNECT_END_STREAM_FLAG: number
export function frameEncode(bytes: Uint8Array, flags?: number): Uint8Array
export function encodeValue(value: unknown): Uint8Array
export function decodeValue(value: Uint8Array): unknown
export function decodeAgentServerMessage(value: Uint8Array): unknown
export function decodeUsableModels(value: Uint8Array): unknown
export function encodeConversationState(value: { rootPromptBlobIds: Uint8Array[]; turns: Uint8Array[] }): Uint8Array
export function encodeUserMessage(value: { text: string; messageId: string }): Uint8Array
export function encodeUserMessageAction(bytes: Uint8Array): Uint8Array
export function encodeModelDetails(id: string): Uint8Array
export function encodeRunRequest(value: { conversationState: Uint8Array; action: Uint8Array; modelDetails: Uint8Array; conversationId: string }): Uint8Array
export function encodeRunMessage(bytes: Uint8Array): Uint8Array
export function encodeMcpToolDefinition(value: { name: string; description: string; inputSchema: Uint8Array; providerIdentifier: string }): Uint8Array
export function encodeRequestContextResult(tools: Uint8Array[]): Uint8Array
export function encodeExecClientMessageEnvelope(bytes: Uint8Array): Uint8Array
export function encodeExecClientMessage(id: number, execId: string | undefined, field: number, bytes: Uint8Array): Uint8Array
export function encodeKvClientMessage(bytes: Uint8Array): Uint8Array
export function encodeGetBlobResult(id: number, bytes: Uint8Array | undefined): Uint8Array
export function encodeSetBlobResult(id: number): Uint8Array
export function rejectionFor(exec: { case: string; [key: string]: unknown }): { field: number; payload: Uint8Array } | undefined
