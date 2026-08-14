# @oobe-protocol-labs/sap-mcp-server-runtime

Internal package boundary for `src/server`.

Owns `createSapMcpServer`, capability registration, server metadata, and the
shared MCP bootstrap surface used by hosted and local transports.

Stable import:

```ts
import { createSapMcpServer } from '@oobe-protocol-labs/sap-mcp-server/server-runtime';
```

Do not place transport-specific HTTP, stdio, wallet loading, or deployment code
inside this boundary. Those belong to hosted gateway, local bridge, config
runtime, signer, or release operations packages.
