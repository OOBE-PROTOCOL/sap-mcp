# 09. Tool Skill Routing Agent Operations

## 09.1 Tool Families

SAP MCP exposes several tool families:

1. SAP SDK registry, discovery, reputation, escrow, memory, capability, SNS, and protocol tools.
2. Synapse AgentKit tools.
3. Solana RPC, token, NFT, DAS, transaction, network, and Jupiter tools.
4. Profile tools such as current profile, switch profile, list profiles, and public key inspection.
5. Skill-pack tools for installing SAP MCP usage context into agent runtimes.
6. x402 tools for estimating, preparing, verifying, and settling paid workflows.
7. Chat tools for signed SAP session-ledger group rooms, discovery manifests, room sealing, and message retrieval.

## 09.2 Agent Context Rules

Agents should:

1. Treat `Start SAP MCP`, `Initialize SAP MCP`, `Load SAP`, and `SAP mode` as activation phrases.
2. Call `sap_agent_start` first when it is exposed, then load `sap_skills_bundle` with `includeContents: true`.
3. Call `sap_agent_runtime_status`, `sap_prepare_action`, and when standards/interoperability matters, `sap_agent_standard_context` before claiming the current network or supported routes.
4. For hosted remote MCP, describe the remote server as accountless and non-custodial; do not call `default` the user's local profile.
5. Use local `sap_payments_wallet_guard`, `sap_payments_profile_current`, and `sap_payments_readiness` when the `sap_payments` bridge is visible.
6. Respect the active profile's `rpcUrl`, `programId`, and `mode`.
7. Prefer SAP SDK docs and skills when explaining SAP Protocol semantics.
8. Answer in the user's language unless the user asks otherwise.
9. Avoid showing internal thinking, keypair bytes, raw request secrets, or private config.
10. Ask for approval before signing or value-moving operations when required by policy.
11. Use low-cost exact/base SAP micro-reads before broad discovery when possible:
    `sap_agent_context`, `sap_get_agent`, `sap_get_agent_profile`,
    `sap_get_agent_stats`, `sap_is_agent_active`, `sap_get_global_state`, and compact
    `sap_list_agents` pages with `limit <= 20`, `view: "compact"`, and
    `includeProtocolIndexes: false`.
12. For paid hosted agent discovery, use targeted `sap_discover_agents` filters
    before broad scans: `query`, `wallet`, `agentPda`, `protocol`,
    `capability`, `capabilities`, `hasX402Endpoint`, small `limit`, then
    `pagination.nextCursor`.
13. If a capability lookup returns zero agents, retry with `query` or `wallet`
    before saying the agent is absent; AgentAccount rows are canonical and
    indexes can lag.
14. Call `sap_agent_next_action` before retrying after `payment_required`,
    `hosted_local_signer_required`, transient RPC errors, missing local bridge
    tools, or submitted signatures that did not confirm.
15. Call `sap_prepare_mandate` before bounded agent-commerce workflows that
    need spend caps, tool/protocol allow-lists, confirmation thresholds,
    expiry, and proof-tape fields. Treat the result as an unsigned planning
    artifact, not a wallet signature or payment authorization.
16. Call `sap_export_agent_oasf` when a known owner wallet needs an
    OASF-style machine-readable identity/capability/pricing export for
    directories or cross-agent discovery.

The intended user command is short:

```text
Start SAP MCP.
```

The agent should then run the startup routine itself instead of asking the user
to paste a long prompt.

For simple status prompts such as "are you connected to SAP MCP?", keep the
answer compact: connected yes/no, endpoint, mode, non-custodial status, local
`sap_payments` readiness only if it was actually checked, and one next action.
Do not list the full tool catalog, protocol families, or category summary
unless the user explicitly asks what tools are available.

## 09.3 Bootstrap Tools And Prompts

SAP MCP exposes a free startup path:

1. `sap_agent_start` returns the machine-readable agent playbook.
2. `sap_agent_runtime_status` returns the hosted/accountless/local-bridge routing table.
3. `sap_prepare_action` returns the intent-level route, fresh-data requirements, confirmation policy, retry rules, and proof-tape fields before paid calls, swaps, registry writes, Escrow V2, external x402 agents, premium streams, or transaction finalization.
4. `sap_agent_standard_context` returns conservative MCP/x402/pay.sh, A2A-style, OASF-style, AP2-style, UI/runtime, and public-claim boundaries.
5. `sap_prepare_mandate` returns an unsigned AP2-style mandate draft with constraints and proof-tape fields.
6. `sap_agent_context` returns compact micro-read SAP agent context before broad discovery.
7. `sap_export_agent_oasf` exports a known owner-wallet SAP profile into an OASF-style shape.
8. `sap_agent_next_action` classifies SAP MCP errors and tells the agent whether a retry is safe.
9. `sap-agent-start` is the matching MCP prompt for runtimes that prefer prompts.
10. `sap_skills_bundle` returns the bundled SAP MCP skills so the agent can load tool routing, x402, SNS, registry, chat, and Solana protocol guidance.
11. `sap_payments_wallet_guard` returns capability-only local signer guardrails without exposing wallet paths or keypair bytes.
12. `sap_payments_readiness` checks the local non-custodial payment bridge before paid/write hosted calls.

These calls are free. Paid tools should only start after the agent has loaded
skills and, when needed, verified the local `sap_payments` bridge.

Session memory may store operational context such as active profile names,
public wallet keys, runtime namespace availability, receipts, submitted
signatures, final statuses, and error classifications. It must not be treated
as cached truth for prices, quotes, balances, blockhashes, simulations,
liquidity/routes, SNS ownership, or SAP account state; fetch those fresh before
payment, signing, and user-facing claims.

## 09.4 Skills Directory

The repo may include a `skills/` directory for client-installable SAP MCP operating instructions.

Recommended skill topics:

1. SAP MCP overview and safety rules.
2. Solana protocol tool routing.
3. SAP registry and discovery workflows.
4. SNS identity workflows.
5. x402 payment and settlement workflows.
6. Transaction signing and approval workflows.
7. Troubleshooting network/profile mismatch.
8. On-chain agent chat workflows using SAP session ledgers.

## 09.5 Upstream SDK References

Use upstream SAP SDK docs and skills as the source of protocol behavior:

1. `https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs`
2. `https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/skills`
3. `https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/v1.0.2/skills`

SAP MCP wrappers should map to real SDK imports and types from:

1. `@oobe-protocol-labs/synapse-sap-sdk`
2. `@oobe-protocol-labs/synapse-client-sdk`
3. `@modelcontextprotocol/sdk`

## 09.6 Tool Documentation Standard

Each exported tool should include:

1. Stable tool name.
2. Clear title.
3. Operational description.
4. JSON schema or Zod schema that serializes correctly through MCP `tools/list`.
5. Typed handler input.
6. Typed handler output.
7. Policy metadata.
8. Payment tier when hosted monetization is enabled.
9. Error behavior.

Avoid stubs, fake compatibility wrappers, `any`, TODO-only handlers, and undocumented low-code glue.

## 09.7 Tool Module Integration Standard

Tool registration is module-driven. First-party tool families live in
`packages/tools/src/builtin-tool-modules.ts` and are registered through the shared
registry in `packages/tools/src/module-registry.ts`.

Each module must declare:

1. `id`: lowercase kebab-case, stable across releases.
2. `title`: short operator-facing name.
3. `description`: concrete runtime purpose, not marketing copy.
4. `category`: one of the exported `TOOL_MODULE_CATEGORIES`.
5. `order`: deterministic registration position.
6. `register(server, context)`: the only executable registration callback.
7. `expectedTools`: at least one stable tool name for smoke verification when the module registers public tools.
8. `requires`: explicit module dependencies when ordering alone is not enough.
9. `when(context)`: trust-boundary filter for hosted/local/wallet-specific modules.
10. `mode`: use `payments-bridge-only` only for the isolated local payment bridge surface.
11. `lifecycle`: optional `beforeRegister`, `afterRegister`, and `onRegisterError`
    hooks for plugin telemetry, operator traces, and integration diagnostics.

The manifest contract is exported from
`@oobe-protocol-labs/sap-mcp-server/tools` as `ToolModuleManifestSchema` and
`parseToolModuleManifest`. Plugin integrations should use
`createPluginToolModule` with a namespace prefix, for example
`acme-price-feed`, so third-party modules cannot collide with first-party ids.
The plugin factory also requires package/version provenance, at least one
`expectedTools` sentinel, and expected tool names prefixed with the namespace
converted to snake case, for example namespace `acme-market` uses
`acme_market_*`.

Minimal plugin module shape:

```ts
import {
  createPluginToolModule,
  registerToolFamilyPipelineTool,
  type ToolModuleDefinition,
} from '@oobe-protocol-labs/sap-mcp-server/tools';

export const acmePriceFeedModule: ToolModuleDefinition = createPluginToolModule({
  id: 'acme-price-feed',
  title: 'ACME Price Feed',
  description: 'Registers ACME market data tools for SAP MCP agents.',
  category: 'integration',
  order: 5_000,
  expectedTools: ['acme_price_feed'],
  register: (server, context) => {
    registerToolFamilyPipelineTool(server, context, 'acme_price_feed', {
      description: 'Return the latest ACME market price feed snapshot.',
      inputSchema: acmePriceFeedSchema,
    }, async (input) => getAcmePriceFeed(input));
  },
}, {
  namespace: 'acme',
  packageName: '@acme/sap-mcp-tools',
  version: '1.0.0',
});
```

Do not load executable plugin code from MCP input or public JSON manifests.
Private deployments may import trusted packages and pass them through
`registerToolsWithSummary(server, context, { additionalModules })`.

Before registering a first-party or trusted plugin catalog, generate a dry-run
plan with `createToolModuleRegistrationPlan(modules, context)`. The plan reports
the requested runtime mode, selected modules, skipped modules, expected tool
sentinels, and dependency edges without executing registration callbacks. Use it
for CI assertions, branch review, wizard previews, and operator debugging when a
tool family appears missing in hosted or local bridge mode.

Registration lifecycle hooks are for observability only. They may record
telemetry, attach diagnostics, or enrich operator logs, but they must not bypass
manifest validation, mutate public tool schemas, or load executable code from
remote descriptors.

The workspace template in `packages/tool-plugin-template` provides a concrete
package shape for trusted external modules. Copy that structure for new
tool-family packages, then replace the namespace, package metadata,
`expectedTools`, and registration callback.

For new first-party tools and trusted plugin tools, prefer
`registerPipelineTool` from `@oobe-protocol-labs/sap-mcp-server/tools`. It
keeps input parsing, structured success/error envelopes, and execution metadata
in one reusable path while the MCP adapter continues to enforce allow-lists,
private-key guards, policy checks, aliases, and metrics.
Tool families that intentionally preserve stable data-mode payloads across many
tools can use `registerToolFamilyPipelineTool`, `createToolFamilyPipelineResult`,
or `createStringToolPipelineResult` as the family-level primitive before adding
domain-specific helpers.
Production tool modules must not call `registerTool` directly. The
`maximumLegacyRegisterToolFiles` contract is zero for application tool sources;
only the central compatibility layer may bridge the pipeline to the MCP SDK.
Direct `registerPipelineTool` usage is also allow-listed: new data-mode tool
families should use `registerToolFamilyPipelineTool` or a typed family helper,
while direct core registration is reserved for envelope-native tools and
shared family adapters listed in `allowedDirectRegisterPipelineToolFiles`.
Use the default envelope response for new tools. When migrating an existing
tool with stable client/UI consumers, set `responseMode: 'data'` to keep the
legacy structured payload unchanged while still using the shared execution
pipeline for parsing, metadata, and error normalization.
When adding execution metadata, return `createToolExecutionResult(data,
metadata)` instead of a bare `{ data, metadata }` object so direct legacy
payloads with their own `data` field are not misclassified.
When a tool needs MCP Apps UI, attach a `uiCard` builder to the pipeline
definition so the JSON payload and embedded `ui://` resource are produced from
the same typed result.

Current first-party pipeline coverage includes read-only SAP network stats,
quick context bootstrap, hosted cost estimation with pricing cards, Client SDK
compatibility, dynamically loaded AgentKit/Jupiter tools, and MagicBlock ER
Router/private-payments/VRF tools on `registerToolFamilyPipelineTool`. The
agent-control family (`sap_agent_start`, runtime status, preparation planners,
mandate planner, pricing catalog, and next-action resolver), and profile
inspection/switching tools. The SAP SDK wrapper family uses the family pipeline
primitive for its registry, discovery, escrow, x402, memory, feedback,
attestation, stake, and subscription surfaces. SNS availability, resolution,
PDA derivation, record validation, and currently-disabled write-builder
placeholders also use the same primitive, so unavailable paths fail through the
same structured MCP error contract as working read paths. Adrena data API and
on-chain market reader tools use the pipeline for positions, pool/custody
state, trader/mutagen leaderboards, prices, position status, and market
metadata, including the cached market snapshot. Adrena liquidity, swap, and
limit-order builders, commodity perps builders, and staking builders also use
the pipeline while preserving unsigned transaction outputs for local
preview/sign/submit. Adrena open/close, SL/TP, simulation, position package,
trade-intent, trailing-stop, and modify-position tools use the same pipeline
and keep policy violations as structured MCP errors. New Adrena tool families
should use the shared `packages/tools/src/adrena/adrena-pipeline.ts` helper instead of
creating per-file response wrappers. Transaction decode, preview, signing, signed
submission, and hosted-safe SOL/SPL transfer builders use
`registerToolFamilyPipelineTool` while preserving the existing policy checks
and signer boundary. Premium runtime discovery, manifest validation, session
planning, activation status, webhook relay/status, metrics, and stream
poll/flush tools use the same family primitive while preserving their stable
structured payloads. Local memory, strategy, stream buffer, audit, Hermes
context, and trade-journal tools use `createStringToolPipelineResult` so
previous JSON-text responses become structured MCP payloads without rewriting
the storage layer. Signed agent chat room derivation, manifests, message
writes, reads, status, and sealing also use the family primitive so chat
protocol responses share the same structured MCP contract. Client SDK
compatibility and dynamically loaded AgentKit/Jupiter tools keep MCP Apps Card
metadata on top of the same primitive.
Skill discovery, bundle, install dry-run, upgrade-plan, repair-plan,
update-check, and self-update tools also use the pipeline so agent onboarding,
repair flows, memory recall, transaction safety, chat history, and plugin-like
premium surfaces return consistent structured content. The local x402/payment
bridge also uses the family primitive for paid hosted calls, external x402 calls,
readiness/process diagnostics, local profile and wallet guard checks,
challenge preparation/signing/receipt inspection, local transaction
finalization, local SAP agent registry writes, and prepaid balance/funding
helpers. New read-only control-plane tools should follow this pattern before
lower-level protocol write surfaces are migrated.

Tool execution policy metadata is centralized in
`packages/tools/src/tool-execution-metadata.ts` and exported through
`@oobe-protocol-labs/sap-mcp-server/tools`. Use
`getToolExecutionMetadata` and `buildToolModulePolicyCatalog` for wizard,
plugin, UI, and CI surfaces instead of duplicating pricing, hosted/local
eligibility, signer-boundary, or route guidance.

Runtime catalog generation is centralized in `packages/tools/src/tool-catalog.ts`.
Use `buildToolCatalog` for a single local/hosted/bridge profile and
`buildToolCatalogForRuntimeProfiles` for release or wizard matrices. The
catalog combines selected modules, expected tool sentinels, category counts,
payment tiers, local-signer tools, and hosted-accountless blocked tools in one
read-only shape. UI and onboarding code should consume that catalog instead of
calling `selectToolModulesForContext` and policy helpers independently.

During server startup, `registerToolsWithSummary` builds a secret-free summary
with `summarizeToolCatalog` and attaches it to `context.toolCatalog`.
Bootstrap tools such as `sap_agent_runtime_status` and `sap_quick_context`
read that context field, so agents receive the same module and policy view that
the public hosted catalog and CI validators use. `sap_agent_runtime_status`
also includes `runtimeDoctor`, the same secret-free local profile readiness
shape used by `sap-mcp-config doctor`; it is a fast preflight for mode, signer,
wallet path presence, policy limits, RPC, and paid/write readiness. For live
local bridge balances and signer capability, agents must still call
`sap_payments_readiness` when the `sap_payments` namespace is available. Tool
handlers must not import `BUILTIN_TOOL_MODULES` directly from bootstrap modules
because the built-in catalog imports those bootstrap registrations.

Required checks for each new module:

1. Unit test manifest validation, registration plan selection, and expected tool registration.
2. Runtime selection test for hosted/local/bridge-only behavior when relevant.
3. Lifecycle failure test when the module owns external dependencies or private package code.
4. Policy metadata check for every `expectedTools` sentinel.
5. `pnpm run verify:tool-modules`
6. `pnpm run typecheck`
7. `pnpm exec vitest run packages/tools/src/module-registry.test.ts packages/tools/src/tool-execution-metadata.test.ts packages/tools/src/tool-catalog.test.ts`
8. `pnpm run verify:exports` after `pnpm run build` when public exports change.

## 09.8 Language Behavior

If a user asks in English, the agent should answer in English. If a user asks in Italian, the agent should answer in Italian. SAP MCP prompts and skills should reinforce this behavior because tool output may contain multilingual metadata.
