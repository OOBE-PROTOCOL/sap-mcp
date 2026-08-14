# @oobe-protocol-labs/sap-mcp-config-runtime

Internal package boundary for `src/config`.

This package owns secure profile configuration, config defaults, profile
selection, client injection and repair helpers, runtime-doctor readiness
primitives, and platform-aware config paths.

The runtime-doctor module is intentionally reusable by the CLI, MCP bootstrap
tools, desktop wizard, and future agent-facing UI without exposing keypair
bytes or creating a second profile model.

Stable import:

```ts
import { buildActiveDoctorReport } from '@oobe-protocol-labs/sap-mcp-server/config-runtime';
```

This boundary must preserve client injection safety: repair flows may update
SAP MCP entries, but must not overwrite unrelated third-party MCP servers or
user-managed runtime settings.
