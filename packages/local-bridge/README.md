# @oobe-protocol-labs/sap-mcp-local-bridge

Internal package boundary for `packages/local-bridge/src`, `src/transports/stdio.ts`,
`src/bin`, and `src/runtime`.

Owns the local bridge entrypoints, stdio MCP transport, local runtime process
helpers, and the payment bridge process used by `sap_payments`.

This boundary may call config and server runtime code, but signing and spend
policy enforcement must remain in signer and policy modules. The local bridge
must never emit keypair bytes or mutate unrelated client configuration.

Stable import:

```ts
import { startStdioTransport } from '@oobe-protocol-labs/sap-mcp-server/local-bridge';
```
