# SAP MCP Internal Packages

This directory is the modular monorepo target for SAP MCP. The public product
still ships as `@oobe-protocol-labs/sap-mcp-server`; these packages now contain
physical TypeScript source for each internal ownership boundary. The legacy
`src/*` tree remains in place during the transition as the CLI/runtime
compatibility layer.

The first consumable modular API is exposed through npm subpath exports on the
root package:

| Import | Runtime Source | Boundary |
| --- | --- | --- |
| `@oobe-protocol-labs/sap-mcp-server/core` | `dist/packages/core/src/index.js` | Shared runtime contracts and primitives. |
| `@oobe-protocol-labs/sap-mcp-server/schemas` | `dist/packages/schemas/src/index.js` | Public Zod schemas and protocol contracts. |
| `@oobe-protocol-labs/sap-mcp-server/mcp-adapter` | `dist/packages/mcp-adapter/src/index.js` | MCP response and SDK compatibility helpers. |
| `@oobe-protocol-labs/sap-mcp-server/ui-cards` | `dist/packages/ui-cards/src/index.js` | MCP Apps Card rendering helpers and `ui://` resources. |
| `@oobe-protocol-labs/sap-mcp-server/tools` | `dist/packages/tools/src/index.js` | Tool module registry primitives and built-in tool module catalog. |
| `@oobe-protocol-labs/sap-mcp-server/config-runtime` | `dist/packages/config-runtime/src/index.js` | Secure config, runtime doctor, profile defaults, and client injection helpers. |
| `@oobe-protocol-labs/sap-mcp-server/server-runtime` | `dist/packages/server-runtime/src/index.js` | Shared MCP server bootstrap, capability registration, and server metadata. |
| `@oobe-protocol-labs/sap-mcp-server/hosted-gateway` | `dist/packages/hosted-gateway/src/index.js` | Hosted Streamable HTTP gateway, public discovery, and marketplace metadata. |
| `@oobe-protocol-labs/sap-mcp-server/local-bridge` | `dist/packages/local-bridge/src/index.js` | Local stdio bridge and `sap_payments` process diagnostics. |
| `@oobe-protocol-labs/sap-mcp-server/wizard-core` | `dist/packages/wizard-core/src/desktop-flow.js` | Shared wizard defaults, hosted discovery, runtime detection, and save orchestration. |

## Phase 1 Packages

| Package | Boundary | Physical source | Compatibility source | Architecture domain | Rule |
| --- | --- | --- | --- | --- |
| `@oobe-protocol-labs/sap-mcp-core` | Shared runtime contracts | `packages/core/src` | `src/core` | `core` | No runtime feature dependencies. |
| `@oobe-protocol-labs/sap-mcp-schemas` | Public schemas and protocol contracts | `packages/schemas/src` | `packages/schemas/src` | `schemas` | May depend on core only. |
| `@oobe-protocol-labs/sap-mcp-mcp-adapter` | MCP SDK compatibility and response helpers | `packages/mcp-adapter/src` | `src/adapters/mcp` | `mcp-adapter` | May depend on core, security, payments, observability, tool aliases, and UI card resources. |
| `@oobe-protocol-labs/sap-mcp-ui-cards` | MCP Apps Cards and `ui://` resources | `packages/ui-cards/src` | `src/ui` | `ui-cards` | Must stay rendering-only; no signer, remote server, or payment side effects. |
| `@oobe-protocol-labs/sap-mcp-tools` | Tool module registry and built-in catalog | `packages/tools/src` | `packages/tools/src` | `tools` | Owns tool-family manifests, policy metadata, runtime selection, and trusted plugin integration. |
| `@oobe-protocol-labs/sap-mcp-config-runtime` | Profile config, runtime doctor, and client injection | `packages/config-runtime/src` | `src/config` | `config` | Owns one profile model, secret redaction, runtime doctor primitives, and safe client repair. |
| `@oobe-protocol-labs/sap-mcp-server-runtime` | Shared MCP server runtime | `packages/server-runtime/src` | `src/server` | `server` | Owns server bootstrap, server metadata, and capability registration. |
| `@oobe-protocol-labs/sap-mcp-hosted-gateway` | Hosted Streamable HTTP gateway | `packages/hosted-gateway/src` | `src/remote` | `remote-server` | Owns hosted routes, public metadata, premium remote routes, and non-custodial hosted behavior. |
| `@oobe-protocol-labs/sap-mcp-local-bridge` | Local stdio and payment bridge runtime | `packages/local-bridge/src` | `src/local-bridge` | `local-bridge` | Owns local entrypoints and bridge process orchestration; signing policy stays in signer/policy modules. |
| `@oobe-protocol-labs/sap-mcp-wizard-core` | Shared CLI/Desktop wizard flow | `packages/wizard-core/src` | `src/wizard-core` | `wizard` | Owns setup flow primitives reused by TUI, Desktop, and repair modes. |
| `@oobe-protocol-labs/sap-mcp-tool-plugin-template` | Trusted external tool-family template | `packages/tool-plugin-template/src` | none | none | Private workspace template; never loaded dynamically from MCP input. |

Extraction rule: keep the root public npm package stable, compile physical
package sources with `tsconfig.packages.json`, and keep `src/*` compatibility
sources synchronized until the final CLI/runtime switchover replaces them with
thin wrappers.

`check:architecture` also validates the architecture model itself: every
non-ignored domain must declare an allowed dependency list, every allowed target
must be a known or intentionally ignored domain, and every source file must map
to a declared domain owner.

`config/package-export-contracts.json` declares the minimum stable symbols for
each subpath export. `pnpm run verify:exports` runs after `pnpm run build` and
fails when an export target is missing or when a declared symbol is no longer
importable from the built module.

`config/workspace-package-contracts.json` declares the internal package map:
package name, physical source boundary, legacy compatibility source,
architecture domain, private release status, side-effect policy, the root export
that currently exposes the package API, and the `sapMcp.apiContract` pointer to
`config/package-export-contracts.json`.
`pnpm run verify:workspace-packages` fails when a workspace package is missing
metadata, drifts from the root version, lacks README ownership language, points
at a missing source or additional source boundary, marks `physicalSource: true`
without real non-test `.ts` files under `packages/*/src`, maps a legacy source
to an invalid architecture domain, or has a root export without a stable public
symbol contract.

`pnpm run verify:readiness-report` is the aggregate modular readiness gate. It
combines tool module validation, runtime catalogs, MCP Apps Card coverage,
package export contracts, workspace package contracts, tool plugin template
typecheck status, tool execution pipeline adoption, branch prefixes, CI workflow commands, service contracts, and
release personas into one JSON report.
MCP Apps Card coverage is governed by `config/mcp-apps-card-contracts.json`,
which keeps high-value balance, transfer, swap, agent, MagicBlock, and Adrena
tools on specialized cards instead of silently degrading to generic views.

`pnpm run verify:tool-plugin-template` typechecks the private plugin template as
an isolated package so trusted external tool-family examples stay compatible
with the public `./tools` and `./mcp-adapter` subpath contracts.

`pnpm run verify:tool-execution-pipeline` checks the public pipeline exports,
required migrated tool evidence, docs, and adoption count for the shared
input-validation and structured-response path. Current first-party coverage
includes `sap_network_stats`, `sap_quick_context`, `sap_estimate_tool_cost`,
Client SDK compatibility, dynamically loaded AgentKit/Jupiter tools, and
MagicBlock ER Router/private-payments/VRF tools, the read-only `agent-start`
control-plane family, the SAP SDK wrapper family, SNS
availability/resolution/PDA/record validation tools, Adrena data API and
on-chain market reader/snapshot tools, Adrena liquidity/swap/limit-order
builders, commodity builders, and staking builders,
Adrena trading intent, SL/TP, simulation, and modify-position tools,
profile inspection/switching
tools, transaction preview/sign/submit and transfer builders, the premium
plugin/session/webhook/stream control surface, the local
memory/strategy/audit/trade-journal surface, signed agent chat tools, plus
bundled skill discovery, install, repair, and self-update tools. The local
x402/payment bridge paid-call, challenge, receipt, readiness, transaction
finalization, registry-write, and prepaid helpers are also covered by the same
pipeline contract.
Adrena subfamilies share `packages/tools/src/adrena/adrena-pipeline.ts` for structured
success/error responses, optional UI cards, and `responseMode: 'data'`
registration.
Application tool modules have a zero-tolerance legacy registration guard:
`maximumLegacyRegisterToolFiles` is `0`, so new first-party tools and trusted
plugins must register through `registerToolFamilyPipelineTool`,
`registerPipelineTool`, or a typed family adapter.
Only the central MCP compatibility layer may call the lower-level SDK bridge.
The audit also covers `packages/tool-plugin-template/src/index.ts`, so copied
plugin scaffolds inherit the pipeline requirement from day one.
Direct `registerPipelineTool` usage is allow-listed through
`allowedDirectRegisterPipelineToolFiles`; data-mode tool families and plugins
should use `registerToolFamilyPipelineTool` or a typed family adapter.

Tool families use a validated `ToolModuleDefinition`: `id`, `title`,
`description`, `category`, `order`, optional `requires`, optional `when`,
optional `expectedTools`, optional `mode`, and a `register(server, context)`
callback. New first-party tool classes should be added to
`packages/tools/src/builtin-tool-modules.ts`; plugin integrations should use
`createPluginToolModule` with a namespace prefix and pass trusted modules to
`registerToolsWithSummary(server, context, { additionalModules })`.
Plugin modules must carry `packageName` and `version` provenance, declare at
least one `expectedTools` sentinel, and prefix expected tool names with the
namespace converted to snake case.

The public `./tools` export includes:

| Symbol | Purpose |
| --- | --- |
| `ToolModuleManifestSchema` | Data-only Zod manifest contract for first-party and plugin modules. |
| `parseToolModuleManifest` | Strict manifest validation helper for release checks and plugin package tests. |
| `createToolModule` | First-party module factory. |
| `createPluginToolModule` | Namespace-scoped plugin module factory. |
| `PLUGIN_TOOL_MODULE_ORDER_MIN` / `PLUGIN_TOOL_MODULE_ORDER_MAX` | Enforced third-party plugin order range constants. |
| `createToolModuleRegistrationPlan` | Dry-run registration plan with selected/skipped modules, expected tools, and dependency edges. |
| `registerPipelineTool` | Shared input validation, structured success/error envelope, execution metadata, MCP Apps Card attachment, and `responseMode: 'data'` compatibility path for migrated tools. |
| `createToolExecutionResult` | Explicit result wrapper for pipeline tools that need extra execution metadata without confusing legacy payloads that contain a `data` field. |
| `registerToolFamilyPipelineTool` | Reusable data-mode adapter for tool families and trusted plugins that need a typed family helper without calling the MCP compatibility bridge. |
| `createStringToolPipelineResult` | Converts legacy string/JSON tool bodies into explicit pipeline results for migrated families. |
| `registerToolModules` | Low-level ordered registration and expected-tool verification. |
| `registerToolsWithSummary` | Root server registration with optional additional trusted modules. |
| `getToolExecutionMetadata` | Shared pricing, intent, permission, signer-boundary, and hosted-routing metadata for one tool. |
| `buildToolModulePolicyCatalog` | Policy catalog for module `expectedTools` sentinels. |
| `buildToolCatalog` | Wizard/UI/agent read-model for one runtime profile, including selected modules and policy summaries. |
| `buildToolCatalogForRuntimeProfiles` | Release matrix helper for local, hosted, hosted-with-signer, and bridge-only profile catalogs. |
| `summarizeToolCatalog` | Secret-free catalog summary attached to `context.toolCatalog` for bootstrap tools and runtime status. |

`registerToolFamilyPipelineTool` is used by SAP SDK, SNS, transaction, memory,
premium, signed chat, local x402/payment bridge, MagicBlock, and Client SDK
compatibility families.
Those domain files keep small local helper names while delegating the common
data-mode registration path to one primitive.

The public `./ui-cards` export includes rendering-only diagnostics:

| Symbol | Purpose |
| --- | --- |
| `ToolCardRegistry` | Renders MCP Apps Cards for tool result payloads. |
| `buildToolCardCoverageReport` | Builds a release/readiness coverage report for specialized versus generic card adapters. |
| `classifyToolCardCoverage` | Classifies one tool as specialized, generic-read, generic-write, or generic-build. |
| `resolveGenericCardCoverage` | Returns the generic card category that would render an unknown tool. |
