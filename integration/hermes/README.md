# Hermes Catalog Resubmission

The previous Hermes PR for `sap-mcp` was closed on 2026-08-25 because the
catalog entry used the name "SAP MCP" and the default remote surface included
blockchain transaction and spend helpers.

Use `optional-mcps/oobe-protocol/manifest.yaml` only after both checks are true:

1. The hosted `https://mcp.sap.oobeprotocol.ai/mcp` process starts with
   `SAP_MCP_CATALOG_READONLY=true`.
2. `initialize`, `/server.json`, and `/.well-known/mcp/server-card.json`
   report `oobe-protocol` / `OOBE Protocol MCP`.

Before opening a new PR, verify the remote `tools/list` output does not include
any signer, submit, transaction builder, x402 payment, local bridge, install,
self-update, webhook, memory-write, or meta-execution tools.

Suggested PR framing:

- Title: `feat(mcp): add OOBE Protocol read-only catalog entry`
- Do not use `SAP MCP` as the catalog name.
- Mention that SAP in the codebase means Synapse Agent Protocol, not SAP SE, but
  keep that acronym out of the Hermes catalog surface.
- Include the local test command:
  `pnpm test -- src/config/env.test.ts src/tools/tool-catalog.test.ts src/tools/module-registry.test.ts`
