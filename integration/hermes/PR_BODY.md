## Context

Thanks again @teknium1 for the review on #73086, and sorry for the slow follow-up.
We missed the review for about 20 days, but the feedback was clear and useful.
This PR is a revised catalog proposal that addresses the two main concerns from
that review instead of resubmitting the previous `sap-mcp` entry as-is.

The previous PR had two problems:

- `SAP MCP` was a poor catalog-facing name because it could be confused with SAP SE.
- The default remote MCP surface included blockchain transaction, signing, spend,
  payment, local bridge, and meta-execution helpers that do not belong in a curated
  default catalog entry.

## What changed

This proposal adds a neutral Hermes catalog entry named `oobe-protocol`.

The hosted remote remains:

```text
https://mcp.sap.oobeprotocol.ai/mcp
```

That is the existing production hostname. The catalog-facing name, initialize
metadata, `/server.json`, and `/.well-known/mcp/server-card.json` now avoid
presenting the service as `SAP MCP` when the server is started in catalog mode.
In this repository, `SAP` refers to Synapse Agent Protocol, not SAP SE, but the
catalog entry now uses `OOBE Protocol MCP` to avoid that ambiguity entirely.

Catalog mode is enabled with:

```bash
SAP_MCP_CATALOG_READONLY=true
```

When enabled, the server applies a hard read-only allow-list to `tools/list`, the
public tool catalog JSON, and the hosted discovery metadata. This keeps the full
server available for users who intentionally install/configure it, while giving
Hermes a much narrower public catalog surface.

The manifest enables a curated 20-tool core by default, following the same
token-budget pattern used by entries such as `comfy-cloud`. Additional
catalog-mode read-only tools remain available for users to opt into with
`hermes mcp configure oobe-protocol`.

## Catalog surface

The catalog entry exposes only public OOBE Protocol discovery and metadata reads:

- public agent profiles and stats;
- public protocol, capability, tool, and category indexes;
- network overview and network stats;
- SNS domain, record, wallet, and ownership read helpers;
- bundled skill metadata;
- local profile/status reads that do not expose key material;
- server/runtime status helpers.

The catalog surface does not expose:

- signing tools;
- transaction submission;
- transaction builders;
- spend or value-moving helpers;
- x402 or pay.sh payment helpers;
- local payment bridge tools;
- install or self-update tools;
- webhook tools;
- memory-write tools;
- generic execution/meta-execution tools.

In catalog mode, `tools/list` also sanitizes tool titles, descriptions, and JSON
schema descriptions so the listed tools do not advertise payment, signing,
builder, transaction, premium, wizard, webhook, or bridge flows.

## Regression coverage

This change adds regression tests for the behavior requested in the previous
review:

- `SAP_MCP_CATALOG_READONLY=true` resolves to the fixed read-only tool allow-list.
- The catalog allow-list excludes transaction submission and registry/write tools.
- The public tool catalog is filtered to the same read-only surface.
- The Hermes manifest defaults to a 20-tool core subset rather than enabling the
  full read-only catalog surface.
- `initialize`, `/server.json`, and the static MCP server card publish neutral
  `oobe-protocol` / `OOBE Protocol MCP` metadata in catalog mode.
- Catalog-mode `/server.json` does not expose payment, premium, wizard, transaction
  relay, or local setup/download metadata.
- Catalog-mode `tools/list` strips payment/signing/transaction wording from the
  visible tool metadata.

## Verification

Validated locally in the OOBE Protocol repository:

```bash
pnpm run typecheck
pnpm test -- src/adapters/mcp/sdk-compat.test.ts src/remote/server.test.ts src/config/env.test.ts src/tools/tool-catalog.test.ts src/tools/module-registry.test.ts
pnpm run lint
pnpm run build
```

I also ran a local smoke check against the hosted HTTP server in catalog mode.
The checked surface returned:

- `serverInfo.name`: `oobe-protocol`
- `serverInfo.title`: `OOBE Protocol MCP`
- `serverInfo.websiteUrl`: `https://mcp.sap.oobeprotocol.ai/`
- `tools/list`: read-only catalog tools only; Hermes defaults to a curated
  20-tool subset
- auth: `none`
- no payment, premium, wizard, transaction relay, signing, builder, webhook, or
  local bridge wording in the catalog-mode `tools/list` or `/server.json` output

Before merging, the live `https://mcp.sap.oobeprotocol.ai/mcp` deployment should
be probed the same way after it is started with `SAP_MCP_CATALOG_READONLY=true`.
