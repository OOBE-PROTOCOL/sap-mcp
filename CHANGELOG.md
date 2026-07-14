# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Added homepage and docs quick-start steppers for the two supported integration
  paths: native desktop download for normal users and CLI wizard for developers,
  with direct references to `/docs` pages for desktop setup, client configs, and
  x402/pay.sh payments.

## 0.8.0 - 2026-07-14

### Changed

- Made the normal wizard path hosted-first: `hosted-api` is now the default
  recommended mode because agents should connect to
  `https://mcp.sap.oobeprotocol.ai/mcp` while signatures and x402 proofs stay
  local through the user SAP MCP profile.
- Promoted the native `sap_payments` MCP bridge from an optional add-on style
  step to the recommended hosted paid/write setup for Claude, Hermes, Codex,
  OpenClaw, and compatible runtimes.
- Updated the desktop wizard default draft to use hosted SAP MCP plus local
  signing, added clearer normie-friendly setup copy, and added runtime actions
  for selecting detected or all supported agent runtimes.
- Updated README and user docs to describe the recommended two-entry runtime
  configuration: hosted `sap` plus local non-custodial `sap_payments`.

### Verification

- `CI=true pnpm run typecheck`
- `CI=true pnpm test -- --run src/payments/pricing.test.ts src/server/create-server.test.ts src/config/mcp-client-injection.test.ts src/wizard-core/desktop-flow.test.ts`
- `CI=true pnpm run lint`
- `CI=true pnpm run build`
- `CI=true pnpm run desktop:renderer:build`

## 0.7.7 - 2026-07-14

### Changed

- Updated hosted profile tools to report the remote server as an explicit
  accountless, non-custodial gateway instead of exposing a misleading
  `default` profile from the VPS runtime.
- Added agent-facing guidance that local user profile, wallet, and signer
  status must be read through the local `sap_payments.sap_profile_current`
  bridge when the caller is connected to hosted remote MCP.
- Moved basic wallet balance reads (`sol_get_balance`,
  `spl-token_getBalance`, and `spl-token_getTokenAccounts`) into the free
  hosted tier so balance checks no longer depend on x402 facilitator
  settlement or blockhash simulation.

### Verification

- `CI=true pnpm run typecheck`
- `CI=true pnpm test -- --run src/payments/pricing.test.ts`

## 0.7.6 - 2026-07-14

### Changed

- Renamed desktop wizard and CLI wizard language from separate x402
  plugin/addon setup to the native local SAP MCP `sap_payments` bridge.
- Updated user docs, runtime snippets, and skills to make
  `sap_payments_call_paid_tool` the default hosted paid-tool path, with the
  standalone `sap-mcp-x402-paid-call` command documented only as a legacy
  terminal/custom-wrapper fallback.
- Prepared desktop release automation for signed macOS and Windows artifacts by
  selecting OS-specific certificate secrets and publishing `SHA256SUMS.txt`
  alongside DMG/ZIP/EXE/tar.gz outputs.

### Verification

- `CI=true pnpm run verify:release`

## 0.7.5 - 2026-07-14

### Added

- Added native SAP MCP x402 challenge tools for agent runtimes:
  `sap_payments_call_paid_tool`, `sap_payments_prepare_challenge`,
  `sap_payments_sign_challenge`, and `sap_payments_verify_receipt`.
- Kept `sap_x402_paid_call` as a backward-compatible alias while making
  `sap_payments_call_paid_tool` the recommended high-level path for hosted
  paid/write tool calls.
- Added local receipt inspection coverage for `PAYMENT-RESPONSE` and
  `X-PAYMENT-RESPONSE` headers.

### Changed

- Updated runtime injection snippets so the local `sap_payments` bridge exposes
  the complete payment challenge toolchain instead of only the legacy helper.
- Updated SAP MCP skills, prompts, and payment docs to teach agents the native
  x402 challenge flow and avoid terminal/direct-RPC bypasses.

### Verification

- `CI=true pnpm run verify:release`

## 0.7.4 - 2026-07-13

### Changed

- Added top-level metadata aliases to `/server.json` and
  `/.well-known/mcp/server-card.json` for registry crawlers that score
  description, homepage, icon, and display name outside nested MCP
  `serverInfo` fields.
- Kept all metadata values derived from the canonical hosted SAP MCP title,
  public description, homepage, and favicon without adding synthetic registry
  data.

### Verification

- `CI=true pnpm run verify:release`

## 0.7.3 - 2026-07-13

### Added

- Added `GET /.well-known/mcp/server-card.json`, a Smithery-compatible static
  MCP server card generated from the real SAP MCP registration store.
- Included public server metadata, hosted Streamable HTTP transport details,
  authentication modes, tools, resources, resource templates, and prompts in
  the static card so registry crawlers can score metadata even when they do not
  consume extended `initialize.serverInfo` fields.
- Added the static server-card URL to `/server.json` endpoint metadata.

### Verification

- `CI=true pnpm run verify:release`

## 0.7.2 - 2026-07-13

### Changed

- Improved MCP registry and Smithery metadata by exposing a stable server title,
  public description, homepage URL, and hosted icon directly through MCP
  `serverInfo` metadata.
- Added MCP tool `outputSchema` metadata for every registered tool using the
  normalized tool result shape returned by the compatibility layer.
- Added conservative MCP tool annotations for read-only, destructive,
  idempotent, and open-world hints without changing tool names or runtime
  behavior.
- Added human-readable tool titles for discovery clients and registries while
  preserving every existing public tool name for backward compatibility.
- Enriched missing third-party input parameter descriptions at registration
  time so imported SDK tools expose reviewable JSON Schema metadata.
- Aligned `server.json` with the hosted SAP MCP identity and npm package
  version for MCP Registry distribution.

### Verification

- `CI=true pnpm run typecheck`
- `CI=true pnpm test -- --run src/server/create-server.test.ts`
- `CI=true pnpm run build`

## 0.7.1 - 2026-07-13

### Highlights

Publishes SAP MCP as a registry-ready MCP server with official metadata for
the Model Context Protocol Registry, while shipping the MagicBlock tool suite
that was previously staged under `Unreleased`.

### Added — MCP Registry

- Added `mcpName: ai.oobeprotocol.sap.mcp/sap-mcp` to package metadata so
  the npm package can be verified by the MCP Registry through OOBE Protocol's
  domain ownership.
- Added root `server.json` using the official MCP Registry server schema,
  with hosted `streamable-http` remote metadata for
  `https://mcp.sap.oobeprotocol.ai/mcp` and local npm stdio package metadata.
- Added `GET /.well-known/mcp-registry-auth` support for MCP Registry
  HTTP domain authentication via `SAP_MCP_REGISTRY_AUTH_RECORD` or
  `SAP_MCP_REGISTRY_AUTH_FILE`.
- Added repository, homepage, bugs, and packaged `server.json` metadata to
  the npm package for registry and client discovery.

### Added — MagicBlock Tools (20 tools, 3 protocols)

New `magicblock-tools.ts` module registering 20 MagicBlock tools with the
MCP server, covering ER Router (JSON-RPC), Private Payment API (REST),
and Solana VRF (on-chain via @solana/web3.js).

**Tools added:**

- `src/tools/magicblock-tools.ts` — 20 tools with JSON Schema input
  definitions, stateless HTTP client (global `fetch`, zero external deps),
  error handling with structured responses, and per-tool pricing metadata.
- `src/tools/__tests__/magicblock-tools.test.ts` — 10 smoke tests
  verifying tool registration, schema shapes, pricing, and handler
  presence.

**Files modified:**

- `src/tools/index.ts` — export `registerMagicBlockTools`
- `src/tools/register-tools.ts` — call `registerMagicBlockTools` during
  server initialization

**Pricing:**

| Tier | Price | Tools |
|------|-------|-------|
| READ | $0.01 | `getRoutes`, `getIdentity`, `getDelegationStatus`, `getAccountInfo`, `getBlockhashForAccounts`, `getSignatureStatuses`, `health`, `challenge`, `login`, `balance`, `privateBalance`, `swapQuote`, `isMintInitialized`, `getRandomnessResult` (14) |
| WRITE | $0.05 | `deposit`, `transfer`, `withdraw`, `swap`, `initializeMint`, `requestRandomness` (6) |

Every tool description includes its price ($0.01 or $0.05). Every
successful response includes `priceUsd` and `priceBaseUnits` fields for
SAP escrow settlement.

**Validation:**

- `tsc --noEmit` passed (0 errors).
- `eslint` passed.
- `vitest` 10/10 passed.

## 0.6.0 - 2026-07-04

### Highlights

Introduces the SAP MCP Desktop Wizard: a guided GUI/TUI-style installer for non-technical users who need hosted SAP MCP, a local signer profile, and the x402 paid-call bridge configured without editing TOML or JSON by hand.

### Added

- Added a desktop Electron wizard under `apps/desktop` with an accessible aqua-themed setup flow for profile naming, wallet boundary, policy limits, runtime detection, and final review.
- Added shared desktop setup core in `src/wizard-core/desktop-flow.ts` so the GUI persists the same production profile format as the CLI/TUI wizard instead of maintaining a separate installer path.
- Added automatic Codex hosted MCP + local `sap_payments` bridge configuration from the desktop flow.
- Added x402 paid-call addon installation from the desktop flow, writing runtime snippets under `~/.config/mcp-sap/addons/x402-paid-call`.
- Added Electron Builder packaging config for macOS DMG/ZIP, Windows NSIS, and Linux tar.gz release artifacts.
- Added macOS signing entitlements, notarization hook, and CI preflight for tagged release builds.
- Added desktop wizard documentation in `apps/desktop/README.md`.
- Added GitHub Actions desktop release workflow for native macOS, Windows, and Linux wizard artifacts on tagged releases or manual dispatch.

### Changed

- Bumped package metadata to `0.6.0`.
- Added `react-dom`, Electron, Electron Builder, and Vite React tooling for the desktop installer surface.
- Ignored generated desktop renderer and installer artifacts so release outputs are built intentionally and never committed as source.
- Tagged macOS release jobs now report whether they are building signed/notarized or unsigned macOS artifacts.
- Added a first-screen setup mode selector for full SAP MCP setup vs x402 payment-client-only repair, so users who already have `~/.config/mcp-sap` can install only the local payment bridge.
- Expanded runtime-native config injection for Codex, Claude Desktop, Hermes global/profile configs, and OpenClaw instead of relying on one generic MCP JSON shape.
- Added platform-aware Claude config paths for macOS, Windows, and Linux.
- Improved Step 1 desktop wizard layout with a clearer hosted MCP/local trust-boundary explanation.
- Added guarded desktop startup diagnostics so Windows users no longer get an infinite loading screen when preload/runtime detection fails; the wizard now times out with actionable fallback instructions and writes a desktop log.
- Corrected OpenClaw hosted MCP and payment-bridge injection to use the documented `mcp.servers` configuration shape instead of a generic root `mcpServers` map.
- Added hosted native wizard download metadata at `/wizard/downloads.json` and direct Windows, macOS, and Linux download cards on the public dashboard.
- Published x402scan-compatible discovery metadata through `/.well-known/x402` and aligned the OpenAPI payment metadata with x402 resource discovery expectations.
- Fixed the shared public server version constant so `/server.json`, `/openapi.json`, and release download links report `0.6.0` instead of stale metadata.
- Hardened desktop release CI so Windows, macOS, and Linux jobs fail correctly when verification fails.
- Added packaged `app.asar` verification to prevent blank renderer builds, absolute `/assets` paths, and missing Electron entrypoints from shipping.

### Security

- The desktop renderer never receives keypair bytes.
- Hosted MCP config generated by the desktop flow contains only public remote endpoint metadata; local signing remains under `~/.config/mcp-sap` or an external signer.
- The desktop flow rejects ambiguous `default` profile creation and requires named SAP MCP profiles.
- Ad-hoc signed macOS artifacts are supported with explicit Gatekeeper/quarantine instructions; zero-warning macOS installers still require Developer ID signing and notarization.
- Windows facilitator file-mode checks now skip POSIX-only chmod assertions while keeping Unix keypair mode enforcement intact.
- Remote docs path resolution now uses POSIX URL normalization so Windows release runners do not produce platform-specific route mismatches.

### Verification

- `CI=true pnpm run typecheck`
- `CI=true pnpm run test:run`
- `CI=true pnpm run build`
- `CI=true pnpm run desktop:renderer:build`
- `CI=true pnpm run desktop:build`
- `CI=true pnpm run desktop:verify-artifact`
- `npm pack --dry-run --cache ./.npm-cache`
- `pnpm audit --audit-level moderate`

## 0.5.0 - 2026-07-03

### Highlights

First production-grade x402 monetized MCP server on Solana. This release delivers the full
non-custodial payment flow — hosted server, client-side signing, facilitator verify+settle —
with real MCP session management and a standalone client addon for AI agents.

**Verified on-chain**: 5 successful USDC settlements on mainnet from wallet
`28VEsvJpLodUaUReU6t2NFD2uWnqydi2vx2AMfa1HCQP` during testing.

### Added

- **x402 Payment-Signature fast path** (`src/payments/monetization-gate.ts`):
  - Server parses `Payment-Signature` header (base64 JSON with `x402Version`, `accepted`,
    `payload`, and `resource`), validates requirements against the original decision, and
    calls facilitator `/verify` → execute tool → `/settle` in a single pass.
  - 402 responses are returned as HTTP 200 JSON-RPC errors (`-32001 payment_required`) for
    MCP SDK `streamable_http_client` compatibility (the SDK hangs for 55s on raw HTTP 402).
  - `PAYMENT-REQUIRED` response header forwarded so client-side plugins can extract the
    full x402 challenge including `accepts[]` with `extra.feePayer`.

- **x402 V1/V2 compatibility** (`patchV1Compatibility()`):
  - V2 `buildPaymentRequirements()` emits `amount` but no `maxAmountRequired`; V1 verifier
    checks `maxAmountRequired`. The gate patches every 402/response body to add the alias,
    so both V1 and V2 clients work without modification.

- **Standalone x402 client addon** (`src/payments/x402-paid-call.ts`):
  - New npm binary `sap-mcp-x402-paid-call` — initializes a real MCP session, receives the
    x402 challenge, signs locally with the user's SAP profile keypair, and retries with
    `Payment-Signature`.
  - Local MCP tool `sap_x402_paid_call` (`src/tools/x402-paid-call-tool.ts`) — available
    only when the process has a local wallet profile; not advertised by the non-custodial
    hosted server.

- **MCP session registry** (`src/remote/server.ts`):
  - Replaced the global singleton `StreamableHTTPServerTransport` with a per-session
    `Map<sessionId, transport>` architecture. Each client `initialize` creates a real
    session; paid calls without a valid session are rejected before facilitator contact.
  - Eliminates "Server already initialized" and "Session not found" errors that made the
    hosted server unusable for multiple concurrent clients.

- **Receipt binding to method + params** (`src/payments/usage-ledger.ts`):
  - Payment receipts are now bound to the canonical MCP method-and-params hash, not the
    raw JSON-RPC body including `id`. This lets agents retry with a different `id` without
    invalidating the payment proof.

- **Wizard addon flow** (`src/config/wizard.ts`, `src/config/mcp-client-injection.ts`):
  - After client config, the wizard proposes optional installation of the `x402-paid-call`
    addon into `~/.config/mcp-sap/addons/x402-paid-call`.
  - Emits config snippets for Hermes, Claude Code, Codex, OpenClaw, and custom runtimes.

- **Log rotation** (`scripts/setup-logrotate.sh`):
  - PM2 logrotate config: 50MB max, 7 retained, compressed, daily rotation.

- **x402 protocol spec** (`docs/x402-protocol-spec.md`):
  - 984-line reference document covering V1/V2 schemas, header encoding, amount conversion,
    facilitator endpoints, and Solana transaction structure.

### Changed

- Updated skills (`skills/sap-payments-x402/SKILL.md`, `skills/sap-mcp/SKILL.md`) to
  document the `initialize → tools/call unpaid → tools/call paid retry` flow and the
  non-custodial signing boundary.
- Updated user docs (`USER_DOCS/03_PAYMENTS_X402_PAYSH.md`, `USER_DOCS/04_CLIENT_CONFIGS.md`)
  to clarify that retries must preserve `mcp-session-id`, bind to `method + params`, and
  must not fall back to free local stdio to bypass x402.
- Updated landing page and wizard descriptor to surface `npx sap-mcp-x402-paid-call`.
- Added explicit `/favicon.ico` compatibility metadata and route coverage for API-root browser previews.
- Added crawler-safe `HEAD /favicon.ico` support and consolidated public logo handling for
  `/favicon.ico`, `/favicon.png`, `/apple-touch-icon.png`, and `/og.png`.

### Security

- Keypair bytes are never printed, logged, or written to config files.
- The non-custodial hosted server does not advertise `sap_x402_paid_call` when no wallet
  is present — the tool only exists when a local signer is configured.
- Paid calls with client-generated (fake) `mcp-session-id` values are rejected before
  facilitator verification, preventing wasted on-chain settlements for doomed sessions.

### Verification

```
CI=true pnpm run typecheck
CI=true pnpm run lint
CI=true pnpm run test:run        # 74 tests passed, 17 passed (suites)
CI=true pnpm run build
CI=true pnpm run verify:release
node dist/payments/x402-paid-call.js --help
npm pack --dry-run                # includes new binary
```

On-chain verification: 5/5 USDC settlements confirmed on Solana mainnet.

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
- Reworked hosted stateful MCP routing to create one official Streamable HTTP transport per initialized session instead of sharing a single global transport, and reject paid calls with missing or client-generated `mcp-session-id` before facilitator verification.
- Added the local `sap-mcp-x402-paid-call` helper plus optional wizard-installed `x402_paid_call` addon snippets for Hermes, Claude, Codex, OpenClaw, and custom runtimes.
- Added the local MCP helper tool `sap_x402_paid_call` for signed hosted x402 retries when a user-controlled SAP MCP wallet profile is present, while keeping the non-custodial hosted server from advertising it without a wallet.
- Updated payment docs and skills so agents retry hosted paid calls with the same MCP method and params, preserve `mcp-session-id`, and do not fall back to free local stdio just because the hosted server has no signer.
- Added `x402_paid_call` agent plugin install guidance and the `npx sap-mcp-x402-paid-call` command to the public hosted landing page and wizard descriptor.

### Verification

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test -- --run`
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
- Paid x402 virtual resource paths are bound to the SHA-256 hash of canonical MCP method and params, so JSON-RPC `id` changes do not invalidate a valid paid retry.
