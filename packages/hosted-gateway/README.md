# @oobe-protocol-labs/sap-mcp-hosted-gateway

Internal package boundary for `packages/hosted-gateway/src`.

Owns the hosted gateway surface: Streamable HTTP MCP routing, public metadata,
well-known discovery, premium remote routes, and hosted deployment behavior.

Stable import:

```ts
import { RemoteMCPServer } from '@oobe-protocol-labs/sap-mcp-server/hosted-gateway';
```

This boundary must stay non-custodial. It must not load local keypairs, expose
wallet paths, or silently execute value-moving work that belongs to the local
bridge and signer policy layers.
