# Cursor protocol subset

`cursor-wire.js` contains only protobuf message builders/parsers and Connect framing from [dsh-cursor-subscription 0.6.12](https://github.com/orrinzeng/dsh-cursor-subscription/tree/936fb5b40b8efb50a5bb2031c81f3c8f553bf7f8), including its `proto.js` helpers. Its MIT notice is in `cursor-LICENSE` and is included in package distribution.

The original OAuth, credential store, settings UI, native fetch wrapper, LLM adapter, history reconstruction, diagnostic log and static model fallback are excluded. This plugin owns those behaviors. The selected protocol exports are tree-shaken into one ESM file; the declarations keep decoded network values as `unknown` until the consumer validates them.

Local changes: the native-tool rejection text names DSH; Connect decoding rejects unsupported frame flags, compressed/uncompressed frames beyond 64 MiB and incomplete final frames. Compression limits come from the upstream reader. No checkpoint or live connection is retained between DSH requests.
