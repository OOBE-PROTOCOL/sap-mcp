# Changelog

All notable changes to this project are documented in this file.

## 0.3.0 - 2026-07-02

### Fixed

- Fixed hosted wizard onboarding so `hosted-api` connects users to `https://mcp.sap.oobeprotocol.ai/mcp` without asking them to start a local HTTP server.
- Fixed hosted MCP client snippets for Hermes by emitting flat `~/.hermes/mcp.json` JSON and flat `mcp_servers.sap` profile YAML instead of nested `mcpServers` blocks.
- Fixed hosted signing resolution so hosted user profiles can use either a dedicated local wallet path or an external signer while the hosted server remains non-custodial.
- Added x402 SVM V1/V2 compatibility normalization for facilitator verification and settlement by mapping V2 `amount` to the legacy `maxAmountRequired` alias.
- Added a public bento-grid landing page for `/` and browser previews of `/mcp`, including aggregate facilitator volume, settlement counts, wizard install commands, endpoint guidance, and x402/pay.sh payment explanation.
- Updated SAP MCP skills, prompts, and user docs to consistently reference the canonical hosted endpoint, public metadata routes, x402 fast path, and user-controlled signing boundary.
- Clarified hosted non-custodial signing context so agents treat `signerConfigured: false` on the remote server as expected and do not silently fall back to local stdio to bypass x402.
- Clarified CLI and TUI wizard mode selection so `hosted-api` is visibly the OOBE SAP MCP Server at `https://mcp.sap.oobeprotocol.ai/mcp`, not a prompt to run a local HTTP server.
- Added explicit hosted-agent guidance to `sap_profile_current` and `sap://config/current` so clients do not summarize non-custodial hosted mode as "signer not configured", "read-only only", or "writes unavailable".
- Fixed x402 signed retry handling by verifying the client-supplied `Payment-Signature.accepted` requirements instead of rebuilding requirements with a fresh facilitator fee payer.
- Forwarded the `PAYMENT-REQUIRED` header on JSON-RPC `payment_required` responses so MCP clients can keep HTTP 200 compatibility while local payment plugins still receive the complete x402 challenge.
- Bound x402 hosted receipts to the canonical MCP method-and-params hash instead of raw JSON-RPC bytes, preventing valid paid retries from failing when an agent changes only the JSON-RPC `id`.

### Verification

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run test:run -- src/config/mcp-client-injection.test.ts src/config/setup.test.ts src/payments/oobe-facilitator-server.test.ts src/payments/pricing.test.ts`
- `pnpm run build`
- `npm pack --dry-run --cache ./.npm-cache`

## 0.2.0 - 2026-07-02

### Security

- Removed all known npm audit findings in the pnpm dependency graph; `pnpm audit --audit-level moderate` now exits cleanly.
- Upgraded the test/runtime toolchain to patched `vitest@4.1.9`, `vite@8.1.3`, and `esbuild@0.28.1`.
- Forced transitive `ws` resolution to `8.21.0` to avoid the memory-exhaustion DoS advisory.
- Vendored a pure JavaScript `bigint-buffer@1.1.6` compatibility package because the public package has a native binding advisory and no patched `1.1.6` release is published on npm.
- Raised the supported runtime to Node.js `>=22.12.0` and pnpm `11.7.0`, matching the Ink-based wizard and release lockfile behavior.

### Changed

- Bumped package and server metadata to `0.2.0`.
- Added explicit pnpm workspace security policy for dependency overrides and approved native build scripts.

### Verification

- `pnpm audit --audit-level moderate`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test -- --run`
- `pnpm run build`
- `pnpm run verify:release`

## 0.1.1 - 2026-06-29

### Added

- Added SAP session-ledger chat tools for deterministic public rooms, signed thematic group chats, chunked message writes, latest/all history reads, room status, and ledger sealing.
- Added `sap_chat_publish_manifest` so agents can publish signed room/group manifests for discovery indexers and policy-aware clients.
- Added on-chain agent chat documentation covering signed write proofs, room manifests, message envelopes, history fetching, IPFS/link sharing, privacy boundaries, and SDK-native `ChatManager` roadmap.
- Added a bundled `sap-agent-chat` skill so MCP clients can load correct group-room, manifest discovery, link sharing, history, and privacy instructions.

### Fixed

- Fixed `npx`/`npm exec` startup for the default `sap-mcp-server` and `sap-mcp-remote` binaries by adding resolver-safe bootstrap entrypoints.
- Fixed hosted package execution when the SAP SDK resolves its bundled IDL assets from outside the package working directory.

## 0.1.0 - 2026-06-29

### Added

- Added production local and remote MCP launch documentation.
- Added profile-managed configuration docs for `~/.config/mcp-sap`.
- Added bundled SAP MCP skills and SAP SDK tool-routing documentation.
- Added profile inspection and switching tools for MCP clients.
- Added transaction decode, preview, signing, and submission tools with policy checks.
- Added SNS tool coverage for `synapse-sap-sdk` 0.21.x.
- Added MCP client config injection support for Claude, Hermes, OpenClaw, and Codex.
- Added optional remote-only x402 v2/pay.sh monetization gate for hosted MCP `tools/call` requests.
- Added hosted MCP pricing registry, payment usage ledger, and monetization documentation.
- Added `sap-mcp-facilitator` for OOBE-operated x402 SVM `/supported`, `/verify`, and `/settle` facilitation.
- Added `sap-mcp-pay-sh-spec` to generate a pay.sh provider YAML for hosted SAP MCP proxy monetization.
- Added a code quality audit document with release gates, engineering rules, and residual risk tracking.

### Changed

- Runtime profile configuration now protects profile-owned RPC, mode, program, and wallet values from stale MCP client environment variables unless `SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE=true`.
- The wizard creates named profiles and dedicated keypairs under `~/.config/mcp-sap`.
- The wizard UI now uses an aqua-first visual system, clearer step descriptions, and no-color accessibility support for terminal environments.
- The wizard MCP client setup step can now print manual JSON snippets for hosted `https://mcp.sap.oobeprotocol.ai/mcp` and local active-profile setups.
- The wizard now exposes hosted `https://mcp.sap.oobeprotocol.ai/mcp` as the recommended MCP client connection path and keeps it separate from local profile injection.
- Hosted MCP onboarding now states that users connect to the hosted URL while x402/pay.sh payments and value-moving tool transactions still require a wizard-created user SAP profile and user-controlled signer.
- Remote hosted deployments now publish `/.well-known/sap-mcp-wizard.json` and `/wizard/install.sh` so agents can direct users to the wizard when local SAP MCP config is missing or inaccessible.
- Agent context prompts now instruct agents to preserve the user's request language and avoid exposing keypair material.
- Tool documentation now reflects the current runtime registry and requires verification through `tools/list` because upstream SDK tool counts evolve.
- Remote HTTP transports can now gate paid tool calls before execution and settle x402 payments after successful MCP responses.
- Monetization now requires an explicit facilitator URL and documents OOBE hosted/self-hosted facilitator deployment.
- Hybrid policy logging now uses the structured runtime logger instead of direct console output.

### Fixed

- Fixed ESM-safe Solana balance support through `sol_get_balance`.
- Fixed stale permission mappings with an alignment test against the registered MCP tool surface.
- Fixed Bento policy integration tests and fail-open/fail-closed behavior.
- Fixed package release hygiene with a real MIT license, public docs, examples, schema, and changelog.
- Fixed TypeScript ESLint setup for open-source CI readiness.
- Fixed profile reloads to use the canonical runtime config pipeline, including new monetization defaults.
- Fixed signing proxy startup so env-only deployments do not require a default `config.json`.
- Removed legacy root-level documentation that conflicted with the numbered public docs.
- Removed generated macOS metadata from the source tree.

### Security

- Local keypair signing is isolated to the SAP MCP profile wallet and does not touch the Solana CLI keypair.
- MCP client injection no longer pins wallet paths or RPC overrides by default.
- Private key and transaction policy guards run before MCP tool execution/signing paths.
- Payment audit logs store request hashes and settlement metadata, not keypair bytes, raw arguments, or x402 payment signatures.
- Paid x402 virtual resource paths are bound to the SHA-256 hash of the exact JSON-RPC request body.
