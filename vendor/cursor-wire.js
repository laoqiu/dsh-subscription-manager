// MIT: dsh-cursor-subscription 0.6.12, 936fb5b40b8efb50a5bb2031c81f3c8f553bf7f8. Protocol subset; see cursor-LICENSE.
// ../../.subscription-references/cursor/lib/index.js
import { gunzipSync } from "node:zlib";

// ../../.subscription-references/cursor/lib/proto.js
function varintEncode(value) {
  let out = [], n = Math.trunc(value);
  for (; n > 127; )
    out.push(n & 127 | 128), n = Math.floor(n / 128);
  return out.push(n), Uint8Array.from(out);
}
function concatBytes(parts) {
  let total = 0;
  for (let part of parts) total += part.length;
  let out = new Uint8Array(total), offset = 0;
  for (let part of parts)
    out.set(part, offset), offset += part.length;
  return out;
}
var Writer = class {
  constructor() {
    this.parts = [];
  }
  /** Append a raw field tag. */
  tag(field, wireType) {
    return this.parts.push(varintEncode(field << 3 | wireType)), this;
  }
  /** Append a length-delimited payload. */
  bytes(field, data) {
    return this.tag(field, 2), this.parts.push(varintEncode(data.length)), this.parts.push(data), this;
  }
  /** Append a UTF-8 string field. */
  string(field, value) {
    return this.bytes(field, new TextEncoder().encode(value));
  }
  /** Append a nested message field. */
  message(field, inner) {
    return this.bytes(field, inner);
  }
  /** Append a varint field (uint32/int32/bool/enum). */
  varint(field, value) {
    return this.tag(field, 0), this.parts.push(varintEncode(Math.trunc(value))), this;
  }
  /** Append a double (fixed64, little-endian) field. */
  double(field, value) {
    this.tag(field, 1);
    let buffer = new ArrayBuffer(8);
    return new DataView(buffer).setFloat64(0, value, !0), this.parts.push(new Uint8Array(buffer)), this;
  }
  finish() {
    return concatBytes(this.parts);
  }
}, Reader = class {
  constructor(bytes) {
    this.data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), this.pos = 0;
  }
  get done() {
    return this.pos >= this.data.length;
  }
  varint() {
    let result = 0, shift = 0;
    for (; ; ) {
      if (this.pos >= this.data.length) throw new Error("protobuf: truncated varint");
      let byte = this.data[this.pos++];
      if (result += (byte & 127) * 2 ** shift, (byte & 128) === 0) break;
      if (shift += 7, shift > 63) throw new Error("protobuf: varint too long");
    }
    return result;
  }
  /** Read the tag and return { field, wireType }. */
  tag() {
    let raw = this.varint();
    return { field: Math.floor(raw / 8), wireType: raw % 8 };
  }
  bytes() {
    let length = this.varint();
    if (this.pos + length > this.data.length) throw new Error("protobuf: truncated bytes");
    let out = this.data.subarray(this.pos, this.pos + length);
    return this.pos += length, out;
  }
  string() {
    return new TextDecoder().decode(this.bytes());
  }
  double() {
    if (this.pos + 8 > this.data.length) throw new Error("protobuf: truncated double");
    let view = new DataView(this.data.buffer, this.data.byteOffset + this.pos, 8);
    return this.pos += 8, view.getFloat64(0, !0);
  }
  /** Skip a field of the given wire type (length-delimited or varint or fixed64). */
  skip(wireType) {
    if (wireType === 0)
      this.varint();
    else if (wireType === 1) {
      if (this.pos + 8 > this.bytes.length) throw new Error("protobuf: truncated fixed64");
      this.pos += 8;
    } else if (wireType === 2)
      this.bytes();
    else if (wireType === 5) {
      if (this.pos + 4 > this.bytes.length) throw new Error("protobuf: truncated fixed32");
      this.pos += 4;
    } else
      throw new Error(`protobuf: unsupported wire type ${wireType}`);
  }
};
function encodeValue(value) {
  let writer = new Writer();
  if (value == null)
    writer.varint(1, 0);
  else if (typeof value == "boolean")
    writer.varint(4, value ? 1 : 0);
  else if (typeof value == "number")
    writer.double(2, value);
  else if (typeof value == "string")
    writer.string(3, value);
  else if (Array.isArray(value)) {
    let list = new Writer();
    for (let item of value) list.message(1, encodeValue(item));
    writer.message(6, list.finish());
  } else if (typeof value == "object") {
    let struct = new Writer();
    for (let [key, item] of Object.entries(value)) {
      let entry = new Writer();
      entry.string(1, key), entry.message(2, encodeValue(item)), struct.message(1, entry.finish());
    }
    writer.message(5, struct.finish());
  } else
    throw new Error(`cannot encode ${typeof value} as google.protobuf.Value`);
  return writer.finish();
}
function decodeValue(bytes) {
  let reader = new Reader(bytes);
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 0)
      return reader.varint(), null;
    if (field === 2 && wireType === 1)
      return reader.double();
    if (field === 3 && wireType === 2)
      return reader.string();
    if (field === 4 && wireType === 0)
      return reader.varint() !== 0;
    if (field === 5 && wireType === 2)
      return decodeStruct(reader.bytes());
    if (field === 6 && wireType === 2)
      return decodeList(reader.bytes());
    reader.skip(wireType);
  }
  return null;
}
function decodeStruct(bytes) {
  let reader = new Reader(bytes), result = {};
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 2) {
      let entry = new Reader(reader.bytes()), key = "", value = null;
      for (; !entry.done; ) {
        let tag = entry.tag();
        tag.field === 1 && tag.wireType === 2 ? key = entry.string() : tag.field === 2 && tag.wireType === 2 ? value = decodeValue(entry.bytes()) : entry.skip(tag.wireType);
      }
      result[key] = value;
    } else
      reader.skip(wireType);
  }
  return result;
}
function decodeList(bytes) {
  let reader = new Reader(bytes), result = [];
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    field === 1 && wireType === 2 ? result.push(decodeValue(reader.bytes())) : reader.skip(wireType);
  }
  return result;
}

// ../../.subscription-references/cursor/lib/index.js
var textEncoder = new TextEncoder();
function bytesOf(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
function encodeUserMessage({ text, messageId }) {
  let writer = new Writer();
  return typeof text == "string" && text.length > 0 && writer.string(1, text), typeof messageId == "string" && messageId.length > 0 && writer.string(2, messageId), writer.finish();
}
function encodeModelDetails(modelId) {
  let writer = new Writer();
  return writer.string(1, modelId), writer.string(3, modelId), writer.string(4, modelId), writer.finish();
}
function encodeConversationHistoryImage({ data, mimeType }) {
  let image = new Writer().string(1, data);
  mimeType && image.string(2, mimeType);
  let content = new Writer().message(2, image.finish()).finish(), user = new Writer().message(1, content).finish();
  return new Writer().message(1, user).finish();
}
function encodeConversationHistory(images) {
  let writer = new Writer();
  for (let image of images) writer.message(1, encodeConversationHistoryImage(image));
  return writer.finish();
}
function encodeUserMessageAction(userBytes, images = []) {
  let inner = new Writer().message(1, userBytes);
  return images.length > 0 && inner.message(7, encodeConversationHistory(images)), new Writer().message(1, inner.finish()).finish();
}
function encodeConversationState({ rootPromptBlobIds, turns }) {
  let writer = new Writer();
  for (let id of rootPromptBlobIds) writer.bytes(1, id);
  for (let turn of turns) writer.bytes(8, turn);
  return writer.finish();
}
function encodeRunRequest({ conversationState, action, modelDetails, conversationId }) {
  let writer = new Writer();
  return writer.message(1, conversationState), writer.message(2, action), writer.message(3, modelDetails), conversationId && writer.string(5, conversationId), writer.finish();
}
function encodeRunMessage(runRequestBytes) {
  return new Writer().message(1, runRequestBytes).finish();
}
function encodeGetBlobResult(id, blobData) {
  let inner = blobData === void 0 ? new Uint8Array(0) : blobData, result = new Writer().bytes(1, inner).finish(), writer = new Writer();
  return writer.varint(1, id), writer.message(2, result), writer.finish();
}
function encodeKvClientMessage(kvBytes) {
  return new Writer().message(3, kvBytes).finish();
}
function encodeSetBlobResult(id) {
  let writer = new Writer();
  return writer.varint(1, id), writer.message(3, new Uint8Array(0)), writer.finish();
}
function encodeExecClientMessage(id, execId, messageField, messageBytes) {
  let writer = new Writer();
  return writer.varint(1, id), typeof execId == "string" && execId.length > 0 && writer.string(15, execId), messageBytes !== void 0 && writer.message(messageField, messageBytes), writer.finish();
}
function encodeExecClientMessageEnvelope(execBytes) {
  return new Writer().message(2, execBytes).finish();
}
function encodeRequestContextResult(tools) {
  let context = new Writer();
  for (let tool of tools) context.message(7, tool);
  let success = new Writer().message(1, context.finish()).finish();
  return new Writer().message(1, success).finish();
}
function encodeMcpToolDefinition({ name, description, inputSchema, providerIdentifier, toolName }) {
  let writer = new Writer();
  return writer.string(1, name), writer.string(2, description ?? ""), writer.bytes(3, bytesOf(inputSchema)), writer.string(4, providerIdentifier ?? "dsh-cursor-subscription"), writer.string(5, toolName ?? name), writer.finish();
}
function encodeMcpError(error) {
  return new Writer().message(2, new Writer().string(1, error).finish()).finish();
}
function encodeReadRejected(path, reason) {
  let rejected = new Writer().string(1, path ?? "").string(2, reason).finish();
  return new Writer().message(3, rejected).finish();
}
function encodeLsRejected(path, reason) {
  let rejected = new Writer().string(1, path ?? "").string(2, reason).finish();
  return new Writer().message(3, rejected).finish();
}
function encodeGrepError(error) {
  return new Writer().message(2, new Writer().string(1, error).finish()).finish();
}
function encodeWriteRejected(path, reason) {
  let rejected = new Writer().string(1, path ?? "").string(2, reason).finish();
  return new Writer().message(6, rejected).finish();
}
function encodeDeleteRejected(path, reason) {
  let rejected = new Writer().string(1, path ?? "").string(2, reason).finish();
  return new Writer().message(6, rejected).finish();
}
function encodeShellRejected(command, workingDirectory, reason) {
  let writer = new Writer();
  return writer.string(1, command ?? ""), writer.string(2, workingDirectory ?? ""), writer.string(3, reason), writer.varint(4, 0), writer.finish();
}
function encodeShellRejectedResult(command, workingDirectory, reason) {
  return new Writer().message(4, encodeShellRejected(command, workingDirectory, reason)).finish();
}
function encodeShellStreamRejected(command, workingDirectory, reason) {
  return new Writer().message(5, encodeShellRejected(command, workingDirectory, reason)).finish();
}
function encodeBackgroundShellRejectedResult(command, workingDirectory, reason) {
  return new Writer().message(3, encodeShellRejected(command, workingDirectory, reason)).finish();
}
function encodeFetchError(url, error) {
  let inner = new Writer().string(1, url ?? "").string(2, error).finish();
  return new Writer().message(2, inner).finish();
}
function encodeWriteShellStdinError(error) {
  return new Writer().message(2, new Writer().string(1, error).finish()).finish();
}
function encodeDiagnosticsResult() {
  return new Writer().message(1, new Uint8Array(0)).finish();
}
var decoder = new TextDecoder();
function decodeAgentServerMessage(bytes) {
  let reader = new Reader(bytes);
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (wireType !== 2) {
      reader.skip(wireType);
      continue;
    }
    let payload = reader.bytes();
    if (field === 1) return { case: "interactionUpdate", value: decodeInteractionUpdate(payload) };
    if (field === 2) return { case: "execServerMessage", value: decodeExecServerMessage(payload) };
    if (field === 3) return { case: "conversationCheckpointUpdate", value: payload };
    if (field === 4) return { case: "kvServerMessage", value: decodeKvServerMessage(payload) };
  }
  return { case: "unknown", value: void 0 };
}
function decodeInteractionUpdate(bytes) {
  let reader = new Reader(bytes);
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (wireType !== 2) {
      reader.skip(wireType);
      continue;
    }
    let payload = reader.bytes();
    if (field === 1) return { type: "textDelta", text: decodeTextDelta(payload) };
    if (field === 4) return { type: "thinkingDelta", text: decodeTextDelta(payload) };
    if (field === 5) return { type: "thinkingCompleted", durationMs: decodeThinkingDuration(payload) };
    if (field === 8) return { type: "tokenDelta", tokens: decodeTokenDelta(payload) };
    if (field === 14) return { type: "turnEnded" };
    if (field === 2) return { type: "toolCallStarted" };
    if (field === 3) return { type: "toolCallCompleted" };
    if (field === 7) return { type: "partialToolCall", ...decodePartialToolCall(payload) };
    if (field === 15) return { type: "toolCallDelta" };
    if (field === 13) return { type: "heartbeat" };
  }
  return { type: "unknown" };
}
function decodeThinkingDuration(bytes) {
  let reader = new Reader(bytes);
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 0) return reader.varint();
    reader.skip(wireType);
  }
  return 0;
}
function decodeTextDelta(bytes) {
  let reader = new Reader(bytes);
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 2) return reader.string();
    reader.skip(wireType);
  }
  return "";
}
function decodeTokenDelta(bytes) {
  let reader = new Reader(bytes);
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 0) return reader.varint();
    reader.skip(wireType);
  }
  return 0;
}
function decodePartialToolCall(bytes) {
  let reader = new Reader(bytes), callId = "", argsTextDelta = "";
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    field === 1 && wireType === 2 ? callId = reader.string() : field === 3 && wireType === 2 ? argsTextDelta = reader.string() : reader.skip(wireType);
  }
  return { callId, argsTextDelta };
}
function decodeKvServerMessage(bytes) {
  let reader = new Reader(bytes), id = 0, blobId;
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 0) id = reader.varint();
    else if (field === 2 && wireType === 2) blobId = decodeBlobId(reader.bytes());
    else {
      if (field === 3 && wireType === 2)
        return { id, case: "setBlobArgs", ...decodeSetBlobArgs(reader.bytes()) };
      reader.skip(wireType);
    }
  }
  return blobId === void 0 ? { id, case: "unknown" } : { id, case: "getBlobArgs", blobId };
}
function decodeSetBlobArgs(bytes) {
  let reader = new Reader(bytes), blobId, blobData;
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    field === 1 && wireType === 2 ? blobId = reader.bytes() : field === 2 && wireType === 2 ? blobData = reader.bytes() : reader.skip(wireType);
  }
  return { blobId, blobData };
}
function decodeBlobId(bytes) {
  let reader = new Reader(bytes);
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 2) return reader.bytes();
    reader.skip(wireType);
  }
}
var EXEC_SPAN_CONTEXT_FIELD = 19;
function decodeExecServerMessage(bytes) {
  let reader = new Reader(bytes), id = 0, execId = "", unknownField, seen = [];
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (seen.push(field), field === 1 && wireType === 0)
      id = reader.varint();
    else if (field === 15 && wireType === 2)
      execId = reader.string();
    else if (wireType === 2) {
      let payload = reader.bytes();
      if (field === 10) return { id, execId, case: "requestContextArgs" };
      if (field === 11) return { id, execId, case: "mcpArgs", args: decodeMcpArgs(payload) };
      if (field === 2) return { id, execId, case: "shellArgs", path: decodeSinglePathArg(payload) };
      if (field === 3) return { id, execId, case: "writeArgs", path: decodeSinglePathArg(payload) };
      if (field === 4) return { id, execId, case: "deleteArgs", path: decodeSinglePathArg(payload) };
      if (field === 5) return { id, execId, case: "grepArgs" };
      if (field === 7) return { id, execId, case: "readArgs", path: decodeReadArgsPath(payload) };
      if (field === 8) return { id, execId, case: "lsArgs", path: decodeSinglePathArg(payload) };
      if (field === 9) return { id, execId, case: "diagnosticsArgs" };
      if (field === 14) return { id, execId, case: "shellStreamArgs", path: decodeSinglePathArg(payload) };
      if (field === 16) return { id, execId, case: "backgroundShellSpawnArgs" };
      if (field === 17) return { id, execId, case: "listMcpResourcesExecArgs" };
      if (field === 18) return { id, execId, case: "readMcpResourceExecArgs" };
      if (field === 20) return { id, execId, case: "fetchArgs", url: decodeFetchUrl(payload) };
      if (field === 21) return { id, execId, case: "recordScreenArgs" };
      if (field === 22) return { id, execId, case: "computerUseArgs" };
      if (field === 23) return { id, execId, case: "writeShellStdinArgs" };
      field !== EXEC_SPAN_CONTEXT_FIELD && (unknownField ??= field);
    } else
      reader.skip(wireType);
  }
  return { id, execId, case: "unknown", field: unknownField, seen };
}
function decodeSinglePathArg(bytes) {
  let reader = new Reader(bytes);
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 2) return reader.string();
    reader.skip(wireType);
  }
  return "";
}
function decodeReadArgsPath(bytes) {
  return decodeSinglePathArg(bytes);
}
function decodeFetchUrl(bytes) {
  let reader = new Reader(bytes);
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 2) return reader.string();
    reader.skip(wireType);
  }
  return "";
}
function decodeMcpArgs(bytes) {
  let reader = new Reader(bytes), name = "", toolCallId = "", providerIdentifier = "", toolName = "", args = {};
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 2) name = reader.string();
    else if (field === 2 && wireType === 2) {
      let entry = new Reader(reader.bytes()), key = "", value;
      for (; !entry.done; ) {
        let tag = entry.tag();
        tag.field === 1 && tag.wireType === 2 ? key = entry.string() : tag.field === 2 && tag.wireType === 2 ? value = entry.bytes() : entry.skip(tag.wireType);
      }
      key && (args[key] = value);
    } else field === 3 && wireType === 2 ? toolCallId = reader.string() : field === 4 && wireType === 2 ? providerIdentifier = reader.string() : field === 5 && wireType === 2 ? toolName = reader.string() : reader.skip(wireType);
  }
  return { name, toolCallId, providerIdentifier, toolName, args };
}
function decodeUsableModels(bytes) {
  let reader = new Reader(bytes), models = [];
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    if (field === 1 && wireType === 2) {
      let model = decodeModelDetails(reader.bytes());
      model?.id && models.push(model);
    } else
      reader.skip(wireType);
  }
  return models;
}
function decodeModelDetails(bytes) {
  let reader = new Reader(bytes), model = { id: "", name: "" };
  for (; !reader.done; ) {
    let { field, wireType } = reader.tag();
    wireType === 2 ? field === 1 ? model.id = reader.string() : field === 3 ? model.displayModelId = reader.string() : field === 4 ? model.name = reader.string() : field === 5 ? model.displayNameShort = reader.string() : reader.bytes() : reader.skip(wireType);
  }
  return model;
}
function frameEncode(payload, flags = 0) {
  let out = new Uint8Array(5 + payload.length), view = new DataView(out.buffer);
  return view.setUint8(0, flags), view.setUint32(1, payload.length, !1), out.set(payload, 5), out;
}
var CONNECT_END_STREAM_FLAG = 2, CONNECT_COMPRESSED_FLAG = 1, MAX_CONNECT_FRAME_BYTES = 64 * 1024 * 1024, ConnectFrameReader = class {
  constructor() {
    this.buffer = new Uint8Array(0), this.frames = [], this.waiters = [], this.ended = !1, this.paused = !1, this.error = void 0;
  }
  push(chunk) {
    let combined = new Uint8Array(this.buffer.length + chunk.length);
    for (combined.set(this.buffer), combined.set(chunk, this.buffer.length), this.buffer = combined; this.buffer.length >= 5; ) {
      let view = new DataView(this.buffer.buffer, this.buffer.byteOffset, 5), flags = view.getUint8(0), length = view.getUint32(1, !1);
      if (length > MAX_CONNECT_FRAME_BYTES || (flags & ~3) !== 0) {
        this.fail(new Error("Cursor frame exceeds the supported protocol limits"));
        return;
      }
      if (this.buffer.length < 5 + length) break;
      let payload = this.buffer.slice(5, 5 + length);
      this.buffer = this.buffer.slice(5 + length);
      let data = payload;
      if ((flags & CONNECT_COMPRESSED_FLAG) !== 0)
        try {
          data = gunzipSync(Buffer.from(payload), { maxOutputLength: MAX_CONNECT_FRAME_BYTES });
        } catch (error) {
          this.fail(new Error("Cursor sent an unreadable compressed frame", { cause: error }));
          return;
        }
      this.#enqueue({ flags: flags & ~CONNECT_COMPRESSED_FLAG, payload: data });
    }
  }
  #enqueue(frame) {
    if (this.waiters.length > 0) {
      this.waiters.shift().resolve(frame);
      return;
    }
    this.frames.push(frame);
  }
  finish() {
    if (this.buffer.length) { this.fail(new Error("Cursor stream ended with an incomplete frame")); return; }
    this.ended = !0;
    for (let waiter of this.waiters.splice(0)) waiter.resolve(void 0);
  }
  /**
   * Stop blocking for new frames without ending the stream: buffered frames
   * are still returned, and `resume()` restores normal waiting. A Cursor run
   * stays alive across DSH steps, so a reader that is paused to end one step
   * must accept frames again when the next step continues the same run.
   */
  pause() {
    this.paused = !0;
    for (let waiter of this.waiters.splice(0)) waiter.resolve(void 0);
  }
  resume() {
    this.paused = !1;
  }
  fail(error) {
    this.error = error, this.ended = !0;
    for (let waiter of this.waiters.splice(0)) waiter.reject(error);
  }
  async next() {
    if (this.frames.length > 0) return this.frames.shift();
    if (!this.paused) {
      if (this.ended) {
        if (this.error !== void 0) throw this.error;
        return;
      }
      return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
    }
  }
}, TOOL_REJECT_REASON = "Use the DSH tools provided instead.";
function rejectionFor(exec) {
  switch (exec.case) {
    case "readArgs":
      return { field: 7, payload: encodeReadRejected(exec.path, TOOL_REJECT_REASON) };
    case "lsArgs":
      return { field: 8, payload: encodeLsRejected(exec.path, TOOL_REJECT_REASON) };
    case "grepArgs":
      return { field: 5, payload: encodeGrepError(TOOL_REJECT_REASON) };
    case "writeArgs":
      return { field: 3, payload: encodeWriteRejected(exec.path, TOOL_REJECT_REASON) };
    case "deleteArgs":
      return { field: 4, payload: encodeDeleteRejected(exec.path, TOOL_REJECT_REASON) };
    case "shellArgs":
      return { field: 2, payload: encodeShellRejectedResult(void 0, void 0, TOOL_REJECT_REASON) };
    case "shellStreamArgs":
      return { field: 14, payload: encodeShellStreamRejected(void 0, void 0, TOOL_REJECT_REASON) };
    case "backgroundShellSpawnArgs":
      return { field: 16, payload: encodeBackgroundShellRejectedResult(void 0, void 0, TOOL_REJECT_REASON) };
    case "fetchArgs":
      return { field: 20, payload: encodeFetchError(exec.url, TOOL_REJECT_REASON) };
    case "writeShellStdinArgs":
      return { field: 23, payload: encodeWriteShellStdinError(TOOL_REJECT_REASON) };
    case "diagnosticsArgs":
      return { field: 9, payload: encodeDiagnosticsResult() };
    case "recordScreenArgs":
      return { field: 21, payload: encodeMcpError("Screen recording is not available") };
    case "computerUseArgs":
      return { field: 22, payload: encodeMcpError("Computer use is not available") };
    case "listMcpResourcesExecArgs":
      return { field: 17, payload: encodeMcpError("MCP resources are not available") };
    case "readMcpResourceExecArgs":
      return { field: 18, payload: encodeMcpError("MCP resources are not available") };
    case "unknown":
      return typeof exec.field != "number" ? void 0 : { field: exec.field, payload: encodeMcpError(TOOL_REJECT_REASON) };
    default:
      return;
  }
}
export {
  CONNECT_END_STREAM_FLAG,
  ConnectFrameReader,
  Writer,
  decodeAgentServerMessage,
  decodeUsableModels,
  decodeValue,
  encodeConversationState,
  encodeExecClientMessage,
  encodeExecClientMessageEnvelope,
  encodeGetBlobResult,
  encodeKvClientMessage,
  encodeMcpToolDefinition,
  encodeModelDetails,
  encodeRequestContextResult,
  encodeRunMessage,
  encodeRunRequest,
  encodeSetBlobResult,
  encodeUserMessage,
  encodeUserMessageAction,
  encodeValue,
  frameEncode,
  rejectionFor
};
