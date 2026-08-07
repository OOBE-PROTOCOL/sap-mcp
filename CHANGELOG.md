# Changelog

All notable changes to this project are documented in this file.

## 0.9.69 - 2026-08-07

### Fixed

- Resolved stale npx cache path bug in `resolveGlobalBinaryPath`: `which sap-mcp-server`
  could return a path inside `~/.npm/_npx/` (the npx cache) that becomes invalid
  after npm cache cleanup or version update. The function now uses `which -a` and
  filters out any path containing `/.npm/` or `/_npx/`, falling back to
  `npm bin -g` to find the authoritative global install path.
- Added validation detection for `args: null` in MCP bridge configs, which crashes
  the Hermes stdio bridge with `TypeError: Value after * must be an iterable, not
  NoneType` (upstream issue NousResearch/hermes-agent#80652). The repair now
  detects and normalizes this to `args: []` on the next repair run.
- Added validation detection for stale npx cache paths in existing configs, with
  automatic normalization during repair.

### Added

- MCP Apps UI card templates with real protocol brand logos (Solana, Jupiter, Orca,
  Raydium, Meteora, Adrena, MagicBlock, Metaplex, USDC, USDT) as inline base64 data
  URIs. Card headers show an avatar group (SAP + OOBE Protocol logos). Card footer
  version is sourced from `MCP_SERVER_VERSION` at module load time, never hardcoded.
- High-resolution SVG brand assets replaced low-res `.ico` files on the public
  dashboard protocol logo rail.

## 0.9.68 - 2026-08-06

### Fixed

- Resolved the bare command name bug in `sap-mcp-config repair` where the
  generated MCP client config wrote `"command": "sap-mcp-server"` (bare name)
  instead of the absolute filesystem path of the globally installed binary.
  Runtime MCP clients (Hermes, Claude Desktop, Codex, OpenClaw) resolved the
  bare name via `npx`, which pointed to a stale cached version in
  `~/.npm/_npx/` instead of the global install at
  `/Users/<user>/.local/bin/sap-mcp-server`. This caused the `sap_payments`
  stdio bridge to start but fail to register tools correctly, leaving the
  bridge in an unusable state.

- `resolveBridgeCommand()` now calls `resolveGlobalBinaryPath()` which uses
  `which` (Unix) or `where` (Windows) to resolve the absolute path of the
  global binary. The repair writes this absolute path as the `command` value,
  eliminating any ambiguity in runtime resolution.

- Updated config validators to accept any absolute path containing
  `sap-mcp-server` as a valid global binary command, not just the bare name.

## 0.9.67 - 2026-08-06

### Fixed

- Resolved a bridge startup failure affecting macOS users with npm 10/11 where
  `npx --package X -- Y` does not add the package's `.bin` directory to PATH,
  causing `sh: sap-mcp-server: command not found` and preventing the local
  `sap_payments` stdio bridge from connecting to agent runtimes (Hermes, Claude,
  Codex, OpenClaw). The repair now detects whether the `sap-mcp-server` binary
  is globally available and, when it is, writes MCP client configs that invoke
  the global binary directly (`command: "sap-mcp-server"`) instead of relying
  on `npx --package`. When the binary is not globally installed, the repair
  installs the package globally as a fallback before writing configs. This
  eliminates the npx PATH resolution bug without requiring users to manually
  install or configure anything.

### Changed

- `resolveBridgeCommand()` in `mcp-client-injection.ts` now prefers the global
  binary and falls back to `npx --package` for both Codex and `sap_payments`
  bridge configs across all supported platforms (darwin, linux, win32).
- The config validator accepts both forms: `npx` with a pinned package version
  or the global `sap-mcp-server` binary.
- Updated `mcp-client-injection.test.ts` to be agnostic to the bridge command
  form (global binary vs npx) so tests pass in both environments.

## 0.9.66 - 2026-08-05

### Security

- Enforced the configured SOL spending policy on every local-signer SDK write.
  A new `PolicyEnforcingWallet` wraps the SAP client signer so all on-chain
  writes (agent register/update/close, escrow V2, staking, swaps) are checked
  against `maxTxValueSol` / `requireApprovalAboveSol` before signing, closing a
  gap where only raw `sign_transaction` calls were previously gated.

### Added

- Prometheus metrics exporter, opt-in via `enableMetrics` (VPS deployments).
  Exposes `/metrics` (tool call totals, duration histogram, in-flight gauge,
  request totals, uptime) and is wired into the central `tools/call` handler.
  Disabled by default so local user deployments stay opt-in only.
- `sap_skills_check_updates` tool: compares the bundled skill version with the
  latest published npm package and reports stale local agent skill directories.
- `sap_skills_self_update` tool: refreshes local agent skill files from the
  latest published package via `npm pack` + `tar` extraction (local mode only,
  hosted MCP cannot write to the caller machine, requires `confirm: true`).

### Fixed

- Replaced blocking Redis `KEYS` with incremental `SCAN` across session store
  admin paths to avoid stalling production Redis on large key spaces.
- Corrected stale upstream skill reference (`v1.0.2` -> `v${MCP_SERVER_VERSION}`).
- Resolved two unused-variable lint warnings in test files.

### Changed

- Added `scripts/bump-version.mjs` for single-source version bumps across
  `package.json`, `server.json`, `constants.ts`, `logger.ts`, and `README.md`.

## 0.9.65 - 2026-08-05

### Fixed

- Removed the direct dependency on the unavailable
  `@bonfida/spl-name-service` npm package, which caused clean
  `npm exec @oobe-protocol-labs/sap-mcp-server@0.9.64 -- sap-mcp-config repair`
  installs to fail with npm 404.
- Reworked SAP SNS read tools to derive SNS PDAs, ownership, availability, and
  records through local Solana Name Service helpers backed by `@solana/web3.js`.
- Disabled SNS registration and record-write builders with a fail-fast message
  before payment or signing until a current installable SNS write SDK path is
  migrated and covered by end-to-end tests.

### Changed

- Updated SNS skills and identity pipeline docs so agents do not promise hosted
  SNS write builders while the write path is intentionally unavailable.
- Bumped the SAP SDK dependency target to `@oobe-protocol-labs/synapse-sap-sdk`
  `^1.0.3`, which must be published before the SAP MCP 0.9.65 package is
  published.

### Tests

- Added release-readiness coverage preventing known unavailable public npm
  packages from re-entering the package dependency surface.

## 0.9.64 - 2026-08-01

### Added

- Added the free local `sap_payments_wallet_guard` tool. It exposes the active
  SAP profile, signer public key, wallet storage class, permission hints,
  allowed local signing capabilities, and forbidden agent actions without
  returning wallet paths, keypair bytes, seed phrases, or private config.
- Added a reusable signer wallet-guard module so local signing is presented to
  agents as a capability surface, not filesystem keypair access.

### Changed

- `sap_payments_profile_current` now returns redacted wallet status and
  `walletGuard` metadata instead of a raw local wallet path.
- `sap_payments_readiness`, `sap_agent_runtime_status`,
  `sap_agent_standard_context`, and mandate planners now route agents through
  `sap_payments_wallet_guard` before paid/write flows.
- Reworded local signer logs from scary hot-key warnings to capability-only
  local signer status while preserving the non-custodial security boundary.
- Updated docs and skills so agents use `sap_payments` tools for local signing,
  never inspect keypair files, and never create temporary signing scripts.
- Hardened the local `sap_payments` bridge singleton guard. Runtime configs
  still use `SAP_MCP_RUNTIME_ID`, but stale configs now fall back to a stable
  `default-runtime` lock instead of `parent-<pid>`, which prevents retry loops
  from spawning duplicate bridge processes.
- Bridge-only processes now treat live locks with dead parent runtimes as stale
  and exit automatically when their own parent runtime disappears, reducing
  orphaned/zombie Node processes after Hermes, Codex, Claude, or OpenClaw
  restarts.

### Tests

- Added coverage proving local payment profile/guard outputs do not leak local
  keypair paths or filenames.
- Added pricing coverage proving `sap_payments_wallet_guard` is always free.
- Added process-lock coverage for stable runtime fallback, duplicate bridge
  blocking, and stale parent-runtime replacement.

## 0.9.63 - 2026-07-30

### Added

- Added a runtime-scoped `sap_payments` process lock keyed by active SAP
  profile and agent runtime id. This prevents duplicate local payment bridges
  inside the same runtime/profile while still allowing Codex, Hermes, Claude,
  and OpenClaw to run their own bridges safely.
- Added the free `sap_payments_process_status` diagnostic tool. Agents can now
  inspect local bridge PID, runtime/profile scope, stale locks, and possible
  duplicate SAP MCP processes before retrying stuck x402/write flows.

### Fixed

- Hardened stdio shutdown handling for local payment bridges. The bridge now
  releases local caches and runtime locks on stdin close/end, process
  disconnect, SIGINT, SIGTERM, uncaught exceptions, and unhandled rejections.
- Updated runtime repair output, desktop wizard next steps, and x402 skills so
  agents diagnose bridge process issues instead of killing node/npx processes
  mid-session.

## 0.9.62 - 2026-07-30

### Fixed

- Fixed the remaining Adrena open-position account-meta blocker. Live Anchor
  instructions can leave a trailing optional-referrer placeholder, so the
  filtered account list no longer aligns 1:1 with the vendored IDL. For
  `open_or_increase_position_long` and `open_or_increase_position_short`,
  SAP MCP now treats any remaining `Dhz8Ta79...` key as the Adrena `cortex`
  PDA and marks it writable, matching the on-chain CPI requirement instead of
  trusting the stale readonly IDL flag. Local simulation now passes the
  `PrivilegeEscalation` stage and reaches real Adrena validation errors such
  as `InsufficientCollateral`.

### Tests

- Updated Adrena builder regressions for the concrete account-list shape seen
  in hosted simulations: duplicate default-referrer removal plus writable
  `cortex` preservation when the same public key has both roles.

## 0.9.61 - 2026-07-30

### Fixed

- Normalized Adrena unsigned-builder account metas against the vendored IDL
  after optional referrer cleanup. This keeps `cortex` readonly for
  `open_or_increase_position_short` while still removing duplicated null
  `referrerProfile` metas, preventing the `Dhz8Ta79... writable privilege
  escalated` failure that remained after v0.9.60.

### Tests

- Added regression coverage for the exact live case where `Dhz8Ta79...` is the
  only remaining default-referrer pubkey and must be treated as Adrena `cortex`
  with `isWritable: false`.

## 0.9.60 - 2026-07-30

### Fixed

- Fixed Adrena open-position account sanitization for the `cortex` PDA. Adrena
  uses the same public key for the `cortex` PDA and its default referrer
  profile, so removing every matching default-referrer pubkey corrupted the
  instruction account order and surfaced Anchor `AccountDiscriminatorMismatch`
  on `cortex`. SAP MCP now keeps the first occurrence as `cortex` and removes
  only the duplicated optional referrer meta when agents request
  `referrerProfile: null`.

### Tests

- Added regression coverage proving Adrena builders preserve the `cortex`
  account while removing only the duplicated default-referrer optional account.

## 0.9.59 - 2026-07-29

### Fixed

- Hardened Adrena open-position builders against Anchor-materialized default
  referrer profile metas. When agents request no referrer
  (`referrerProfile: null`), SAP MCP now removes both the optional IDL
  `referrer_profile` meta and the observed Adrena default referrer profile
  account before simulation or serialization, preventing the BONK open-short
  `PrivilegeEscalation` failure class.
- Made the local `sap_payments_call_paid_tool` bridge tolerant of free hosted
  tools. If the hosted SAP MCP returns `200 OK` before issuing an x402
  challenge, the bridge now returns the tool response with
  `paymentCharged:false` and `freeToolBypass:true` instead of failing with
  `Invalid payment required response`.

### Tests

- Added regression coverage for Adrena default referrer profile removal when
  optional `user_profile` and `referrer_profile` accounts are materialized in
  open-position instructions.

## 0.9.58 - 2026-07-29

### Fixed

- Hardened Adrena open-position builders by removing any materialized null
  `referrerProfile` optional account from the final instruction before
  simulation or serialization. This applies the same no-referrer behavior to
  open long/short flows that already made close-position flows safe.
- Added a Codex repair regression test proving stale SAP `mcp-remote` blocks
  and stale `sap_payments` allow-lists are replaced without touching
  third-party MCP servers.

### Tests

- Added targeted coverage for Adrena optional referrer account sanitization and
  Codex namespace repair safety.

## 0.9.57 - 2026-07-29

### Fixed

- Made hosted prepaid sessions reliable across MCP runtimes by resolving payment and prepaid headers case-insensitively, including `X-SAP-Prepaid-Session` and x402 payment aliases.
- Restored Adrena simulation compatibility when optional accounts such as `referrerProfile` are omitted by retrying with explicit null optional accounts only when the IDL builder requires them.
- Centralized Adrena leverage encoding with explicit `adrena_bps_1e4` audit metadata so agents can distinguish requested leverage from protocol-side effective leverage.
- Updated `sap_perp_signal_score` funding reads to use the shared Adrena custody decoder instead of stale binary offsets.
- Prevented tiny-token ATR values from rounding to zero by using significant-digit rounding in signal scoring.

### Tests

- Added coverage for case-insensitive prepaid session headers, prepaid gate bypass behavior, Adrena leverage encoding, and optional-account instruction building.
- Verified with typecheck, lint, build, targeted regression tests, and the full Vitest suite.

## 0.9.56 - 2026-07-29

### Fixed

- Corrected hosted prepaid funding monetization: `sap_payments_fund_prepaid` is now exact-priced from `amountUsd`, so the x402 settlement amount matches the hosted prepaid credit granted to the session.
- Kept `sap_payments_start_prepaid` and `sap_payments_prepaid_balance` free on the local bridge, while exposing only the hosted prepaid fund/balance tools on accountless hosted servers.
- Made prepaid session parsing robust for MCP text-content responses, structured content, and direct JSON results.
- Restored Adrena optional account handling so nullable accounts are omitted instead of being sent as `PublicKey.default`.
- Removed unsupported numeric performance claims from prepaid guidance; prompts now describe the real x402 lifecycle-hook benefit: fewer repeated challenge round-trips with hosted ledger accounting preserved.

### Tests

- Added coverage for exact prepaid funding prices and hosted/local prepaid tool exposure.
- Verified with typecheck, lint, build, targeted prepaid/server tests, and the full Vitest suite.

## 0.9.55 - 2026-07-28

### Added - Sprint 1-3: Risk Engine, Signal Score, Advanced Builders, Market Intelligence

- **6 new perps tools** for professional autonomous trading:
  - `sap_perp_risk_check` - Pre-trade dynamic risk gate. Reads the trade journal to compute daily P&L, drawdown, cooldown status. Returns risk score (0-1) with PROCEED/WAIT/BLOCK recommendation.
  - `sap_perp_signal_score` - Aggregate technical signal score (0-1) from RSI, EMA, MACD, Bollinger Bands, price action, and on-chain funding rate. Returns LONG/SHORT/WAIT with confidence. Replaces 5-7 individual indicator calls with 1.
  - `sap_adrena_build_trailing_stop` - Trailing stop loss builder. Reads the current oracle price and computes the stop at a specified percentage distance. For longs: SL below price. For shorts: SL above price.
  - `sap_adrena_build_modify_position` - Add collateral to an existing position via openOrIncreasePosition. Optionally change leverage to adjust position risk.
  - `sap_perp_fear_greed` - Crypto Fear & Greed Index from alternative.me (free, no API key). Returns current value (0-100), classification, historical values, and risk_on/risk_off recommendation.
  - `sap_perp_portfolio_risk` - Aggregate portfolio risk score from open positions. Returns total exposure, weighted leverage, diversification score, and SAFE/MODERATE/HIGH/CRITICAL recommendation.

- Extended `TradingPolicy` interface with `dailyLossLimitUsd`, `maxDrawdownPct`, `cooldownMinutes` (all optional, typed defaults: $10, 30%, 15 min).
- Extended `SapMcpConfig` with the same three optional fields for profile-level configuration.

### Changed

- Professional Perps Flow updated to include `sap_perp_signal_score` (step 6) and `sap_perp_risk_check` (step 7) before `sap_perp_trade_plan`.
- `sap-agent-context.prompt.ts` updated with Risk and signal table row, trailing_stop and modify_position in Adrena perps trading table, and Risk gate + Signal score steps in the Adrena Perps Trading Flow.
- All skills, TOOL_REFERENCE, and prompts updated to version 0.9.55.
- All npm package references in USER_DOCS and docs updated to 0.9.55.

### Documentation

- Removed informal language ("no mocks", "no placeholders", "real indicator math", "bypasses the broken endpoint") from tool descriptions and module comments.
- `sap-defi/SKILL.md` updated with Advanced Builders, Risk Engine, Signal Engine, and Market Intelligence sections.
- `TOOL_REFERENCE.md` updated with all 6 new tools, tool count 38.

## 0.9.54 - 2026-07-28

### Fixed

- **Adrena close builder error 3007** - `buildInstruction` was passing `null` for optional accounts (referrerProfile) to Anchor. Anchor v0.30 resolves `null` for optional accounts without PDA seeds to a wrong address, causing on-chain error 3007 (account owned by different program). Fix: strip `null` entries from the accounts object before passing to Anchor, so optional accounts are omitted entirely from the instruction. This affected `closePositionShort`, `closePositionLong`, and all builders that pass `referrerProfile = null`.

## 0.9.52 - 2026-07-28

### Added - ClawPump Runtime Partnership

- **ClawPump Agent** is now a natively supported runtime in SAP MCP, alongside Hermes, Codex, Claude, and OpenClaw.
  - `McpClientId` type extended with `'clawpump'`.
  - `AgentTarget` type extended with `'clawpump'`.
  - Skill directory `~/.clawpump/skills/` added to `getDefaultTargetDir` and `getAgentTargetDirs`.
  - Wizard `runtimeIds` array includes `'clawpump'`.
  - Config target `~/.clawpump/config.yaml` (YAML, same format as Hermes) added to `getKnownClientTargets`.
  - Manual snippets for hosted SAP MCP + local payment bridge added to `createManualMcpJsonSnippets`.
- **sap-clawpump-bridge** bundled skill with dual-payment model documentation (x402 Classic vs Escrow V2 vs Subscription) and decision matrix.
- Integration files for external PR to Clawpump/claw-agent:
  - `integration/clawpump/optional-mcps/sap-mcp/manifest.yaml` - MCP catalog entry.
  - `integration/clawpump/scripts/sap-mcp-setup.sh` - Setup wizard helper.

### Fixed

- **PolicyViolation: stop_loss_required** - `stopLossRequired` default changed from `true` to `false` in `policy-engine.ts`. The previous default blocked all Adrena trades because `open_long` and `open_short` passed `hasStopLoss = false` hardcoded. Now `hasStopLoss` is computed dynamically from `stopLossPriceUsd !== null`, and `stopLossPriceUsd` is an optional field in both builder schemas.
- **Adrena Data API error logging** - `fetchJson` in `adrena-data-api.ts` now logs HTTP status and response body when the API fails, instead of silently returning `null`. Agents can diagnose API failures via `pm2 logs`.
- **sap_perp_trade_plan entryPrice** - Tool description and schema field description now explicitly state that `entryPrice` is required and should be fetched from `sap_adrena_get_trading_prices` or `sap_adrena_get_prices` first.

## 0.9.50 - 2026-07-27

### Added

- **Policy engine** with 3 guard rails: `collateral_exceeded`, `leverage_exceeded`, `market_not_allowed`. Enforced at the builder level before constructing Adrena transactions.
- **Mandatory pre-submit simulation** in `submitSignedTransactionWithLifecycle`. Simulates the signed transaction before submitting. If simulation fails, returns logs without submitting.
- **Priority fee** support via `SAP_MCP_PRIORITY_FEE_MICRO_LAMPORTS` env var. Prepended to Adrena perps transactions.
- **Market snapshot** with 30s TTL cache. Reduces polling costs 20x for repeated market data reads.
- **Multi-chart** OHLC batch tool `sap_chart_multi_ohlc` - fetch OHLC for multiple resolutions in a single DexScreener call.
- **Technical indicators** tool `sap_chart_indicators` - RSI, EMA-20, EMA-50, MACD, Bollinger Bands, ATR from DexScreener price data.
- **Strategy execute** tool `sap_strategy_execute` - load a saved strategy and build a ready-to-sign transaction.
- **Trade journal** - `sap_trade_journal` (append) and `sap_trade_journal_query` (query) for automatic trade tracking.

### Fixed

- **Adrena builder improvements**: pre-flight balance check on all builders, real on-chain mint addresses replacing placeholder values, leverage pre-validation against custody maxInitialLeverage.
- **Blockhash refresh** before signing in `finalizeTransactionWithLocalSigner` and sign tools.
- **Jupiter Ultra API** default to `lite-api.jup.ag` for Ultra API endpoints.
- **SPL transfer** correct ATA seed derivation (removed incorrect 'AssociatedTokenAddress' prefix).
- **On-chain pool info** reads directly from the Pool account instead of the broken Data API endpoint.
- **Transaction retry** for heavy Adrena transactions (17+ accounts) that expire on public RPC.
- **Simulation logs** returned in builder responses for debugging.
- **Commodity builders** fixed (XAU, XAG, WTI now work with USDC collateral).
- **Batch position builder** `sap_adrena_build_position_package` - open + set SL + set TP atomically in 1 transaction.
- **Intent-level trading API** `sap_adrena_trade_intent` - resolves mint, decimals, max leverage, collateral token automatically. Reduces 5 tool calls to 1.
- **Prepaid session** payment via x402 Lifecycle Hooks `grantAccess`. 6x faster, 6x cheaper than per-call payment.
- **Dry-run simulation** `sap_adrena_simulate_position` - test leverage/collateral combinations without paying.

## 0.9.38 - 2026-07-27

### Added — Native Adrena Perps Builder + Data API

- **32 new Adrena tools** that let agents trade, manage liquidity, stake, and
  read market data from the Adrena protocol entirely on-chain:
  - **Trading builders (10):** `sap_adrena_build_open_long`,
    `sap_adrena_build_open_short`, `sap_adrena_build_close_long`,
    `sap_adrena_build_close_short`, `sap_adrena_build_set_stop_loss`,
    `sap_adrena_build_set_take_profit`, `sap_adrena_build_cancel_stop_loss`,
    `sap_adrena_build_cancel_take_profit`, `sap_adrena_build_add_limit_order`,
    `sap_adrena_build_cancel_limit_order`.
  - **Commodity builders (4):** `sap_adrena_build_open_commodity_long`,
    `sap_adrena_build_open_commodity_short`,
    `sap_adrena_build_close_commodity_long`,
    `sap_adrena_build_close_commodity_short` for synthetic perps (XAU, XAG,
    WTI).
  - **Liquidity & Swap (3):** `sap_adrena_build_add_liquidity`,
    `sap_adrena_build_remove_liquidity`, `sap_adrena_build_swap`.
  - **Staking (5):** `sap_adrena_build_init_user_staking`,
    `sap_adrena_build_add_liquid_stake`,
    `sap_adrena_build_remove_liquid_stake`,
    `sap_adrena_build_add_locked_stake`, `sap_adrena_build_claim_stakes`.
  - **Data API (10):** `sap_adrena_get_positions`,
    `sap_adrena_get_pool_info`, `sap_adrena_get_custody_info`,
    `sap_adrena_get_trader_info`, `sap_adrena_get_trader_leaderboard`,
    `sap_adrena_get_mutagen`, `sap_adrena_get_mutagen_leaderboard`,
    `sap_adrena_get_prices`, `sap_adrena_get_trading_prices`,
    `sap_adrena_get_position_status`.

- All builder tools construct **unsigned Solana transactions locally** using
  the vendored Adrena Anchor IDL (release/39) via `@coral-xyz/anchor`. The
  agent signs locally via `sap_payments_finalize_transaction` — SAP MCP never
  signs user-owned Adrena transactions. No external builder URL is required.

- Vendored the official Adrena IDL (`adrena-idl.json`, 131 instructions) from
  `AdrenaFoundation/adrena-abi` at `src/perps/adrena/`.

- New module `src/perps/adrena/` with:
  - `adrena-constants.ts` — program ID, PDA seeds, custody addresses, token
    mints, pool addresses.
  - `adrena-pda.ts` — 20 PDA derivation helpers (Cortex, Pool, Custody,
    Position, UserProfile, LimitOrderBook, CollateralEscrow, Staking, etc.).
  - `adrena-builder.ts` — 22 builder functions that produce unsigned base64
    transactions for every Adrena operation.
  - `adrena-data-api.ts` — REST client for `datapi.adrena.trade` (positions,
    pool/custody stats, trader leaderboards, mutagen points, oracle prices).

- The `adrena-sdk@beta` npm package was inspected and found to ship only
  `.d.ts` files without runtime `.js` — the package is broken on npm. We
  therefore used the official IDL directly with `@coral-xyz/anchor` instead
  of depending on the SDK.

- `sap_perp_builder_status` now reports `nativeAdrenaBuilder.available: true`
  for all local builder operations. No `SAP_MCP_PERPS_BUILDER_URL` is needed.

- Tool count updated from 329 to 361. Server metadata categories updated.

## 0.9.37 - 2026-07-27

### Fixed — Hosted Gateway Pricing And Transport Friction

- Kept MCP session cleanup out of the x402 gate. `DELETE`, `OPTIONS`, and
  `HEAD` requests now bypass monetization so Streamable HTTP clients can close
  or probe sessions without receiving a misleading `402` challenge.
- Made `sap_estimate_tool_cost` use the same canonical pricing engine as the
  hosted x402 challenge path. Estimates now include configured minimum prices
  such as `$0.005` micro-read floors, avoiding the old `$0.001` estimate versus
  `$0.005` challenge mismatch.
- Added Jupiter price alias normalization before SDK schema validation.
  `jupiter_getPrice` now accepts common agent inputs like `mint`, `id`,
  `token`, or `address` and maps them to canonical `ids[]`, while preserving
  canonical schemas and not overriding explicit `ids`.
- Normalized configured Jupiter base URLs back to the API root when operators
  paste product endpoints such as `/swap/v1`, `/swap/v1/quote`, `/price/v3`,
  or `/ultra/v1`. The hosted gateway now works with server-side Jupiter keys
  without accidentally double-appending SDK routes.
- Added explicit perps readiness. `sap_perp_markets` now decodes Adrena
  Pool/Custody accounts directly from Solana RPC when no enrichment provider is
  configured, and `sap_perp_builder_status` tells agents whether perps
  execution is available before any paid execution attempt.
- Fixed the on-chain perps account scan to encode Anchor discriminators as raw
  8-byte base58 values instead of coercing them into Solana public keys. This
  fixes false-empty Adrena market scans on indexed/full-history RPCs.
- Replaced heuristic Adrena offset scanning with native release/39 ABI decoders
  for Pool, Custody, and Position accounts, including the correct Position owner
  memcmp offset (`16`) and explicit `markPrice: null` when custody data does not
  contain a live mark price.
- Added `SAP_MCP_PERPS_ADRENA_PROGRAM_ID` so hosted operators can update the
  scanned perps program without changing client/runtime configs.
- Added an optional hosted unsigned perps builder surface,
  `sap_perp_build_order_transaction`, registered only when
  `SAP_MCP_PERPS_BUILDER_URL` is configured. Until then, agents are instructed
  to stop at analysis and avoid temporary signing scripts or direct wallet
  reads.
- Documented why Adrena execution builders remain disabled by default:
  inspected `adrena-sdk@beta` / `adrena-sdk-ts@beta` npm tarballs expose type
  declarations but lack the JavaScript runtime files needed by their package
  entrypoints, so SAP MCP will wait for a verified runtime SDK, vendored codegen,
  or signed-off unsigned builder provider before exposing perps execution.

## 0.9.36 - 2026-07-27

### Changed — Agent Readiness And Runtime Repair

- Made wallet/payment readiness genuinely free for hosted agents: native SOL
  balance, SPL token accounts/balances, x402 balance, MagicBlock balance, and
  single-asset price snapshots no longer require x402. Agents can now check
  whether the owner must top up SOL or USDC before spending.
- Kept broad discovery, enriched indexes, quotes, historical market data, and
  value-moving builders monetized so hosted SAP MCP remains usable as a paid
  gateway without blocking basic wallet health checks.
- Hardened Hermes repair against dirty mixed configs: the repair flow removes
  only legacy SAP/SAP payments entries from nested `mcpServers` maps, preserves
  unrelated third-party MCP servers, and rewrites canonical flat Hermes entries.
- Added profile hygiene diagnostics for active profile, missing wallet files,
  public mainnet RPC usage, and plaintext dedicated wallet risk.
- Added a repair-time profile summary so users can see local profile issues
  immediately after running the wizard or `sap-mcp-config repair`.
- Added local JSONL audit logging for successful local x402 bridge calls at
  `~/.config/mcp-sap/sap-payments-audit.jsonl`.
- Updated SAP MCP startup guidance, payment docs, and skills so agents call free
  readiness tools directly and reserve `sap_payments_call_paid_tool` for hosted
  paid tools.

## 0.9.35 - 2026-07-26

### Changed — Protocol Safety And Perps Readiness

- Removed the disabled perp protocol family from the public SAP MCP surface while
  it is under active exploit review. Public docs, skills, landing-page copy,
  logo carousels, and dynamic AgentKit registration now exclude those tools.
- Replaced incomplete Adrena transaction builders with `sap_perp_trade_plan`,
  a free trader-grade planning tool that returns notional sizing, liquidation
  estimate, stop risk, reward/risk, risk flags, and the exact read tools an
  agent should call before any external perps execution route.
- Kept perps analytics free and fast: markets, positions, funding, OHLC,
  long-term charts, volume profile, liquidation zones, and trade planning.
- Moved local memory and strategy stores onto the canonical SAP MCP profile
  directory: `~/.config/mcp-sap/`.
- Updated release metadata, hosted server card, desktop wizard references, and
  npm/client snippets to `0.9.35`.

### Added — Local Agent Memory Subsystem (SQLite FTS5)

### Added — Local Agent Memory Subsystem (SQLite FTS5)

A complete serverless local-memory subsystem built on SQLite FTS5, using
inverted full-text indexes and relevance-ranked retrieval to recover historical
agent interactions. All data is stored locally at
`~/.config/mcp-sap/memory/agent-memory.db` — no data leaves the user's machine.

**10 module files:**
- `src/memory/types.ts` — 11 TypeScript interfaces with strict typing
- `src/memory/database.ts` — Singleton SQLite connection (WAL mode, FTS5, schema versioning, prepared statements, graceful degradation)
- `src/memory/tool-call-store.ts` — Records + FTS5 search with BM25 ranking
- `src/memory/memory-store.ts` — Agent memories with relevance decay + recall
- `src/memory/stream-buffer-store.ts` — FIFO event buffering with dedup + replay
- `src/memory/async-processor.ts` — Non-blocking background maintenance (decay, evict, archive, prune, WAL checkpoint)
- `src/memory/auto-record.ts` — Automatic tool call recording hook
- `src/memory/hermes-bridge.ts` — Cross-session Hermes Agent integration (read-only)
- `src/memory/utils.ts` — truncate, decayRelevance, isExpired
- `src/strategies/strategy-store.ts` — File-based JSON strategy store with versioning + path traversal protection

**17 FREE MCP memory tools (tool surface now 327 total after risk-policy removals, all local, no x402):**

| Category | Tool | Function |
|---|---|---|
| Memory | `sap_memory_record` | Record a tool call in the DB |
| | `sap_memory_search` | FTS5 search across tool call history |
| | `sap_memory_summarize` | Create an LLM-compressed memory (lesson/pattern/failure/success) |
| | `sap_memory_recall` | Top N memories for a category (prompt injection) |
| | `sap_memory_prune` | Remove expired + low-relevance memories |
| Strategy | `sap_strategy_save` | Save/update a strategy JSON |
| | `sap_strategy_load` | Load a strategy by category+name |
| | `sap_strategy_list` | List strategies (filterable) |
| | `sap_strategy_activate` | Activate/deactivate a strategy |
| Stream | `sap_stream_buffer` | Buffer a stream event (dedup by eventId) |
| | `sap_stream_consume` | Consume events FIFO (mark consumed) |
| | `sap_stream_replay` | Replay all events for backtest |
| Audit | `sap_audit_query` | Query audit trail via FTS5 |
| | `sap_audit_record` | Record a manual audit entry |
| | `sap_audit_stats` | Aggregate stats (counts, breakdowns, DB size) |
| Hermes | `sap_hermes_search` | Search Hermes session history |
| | `sap_hermes_recent` | Recent Hermes sessions for context injection |

**Key engineering features:**
- SQLite FTS5 with BM25 relevance ranking
- WAL mode for concurrent read access (crash-safe)
- Thread-safe singleton with cached prepared statements
- Graceful degradation (if DB can't open, tools return empty results)
- Async processor: decay (1h), evict (5m), archive (1h), prune (6h), WAL checkpoint (10m)
- Relevance decay: 1%/day, auto-prune below 0.05
- Stream dedup: (streamType, eventId) unique index
- Strategy versioning: auto-increment on update
- Path traversal protection: sanitized path segments (alphanumeric + dash/underscore/dot only)
- Hermes bridge: auto-detected, read-only, FTS5 with LIKE fallback
- Server lifecycle: init+start on boot, stop+close on shutdown

### Added — Quick Context Auto-Update

`sap_quick_context` now accepts `agentKnownVersion`:
- When omitted (first bootstrap): `skillsUpdateRequired=true`, `skillsContents` populated with full SKILL.md inline
- When ≠ server version: `skillsUpdateRequired=true`, skills contents included
- When == server version: `skillsUpdateRequired=false` (token savings)

Also returns `serverCommit` (git short hash), `environment` (network, mode, authType, rateLimitPerMinute), and `recommendedFlow` (mode-specific workflow guidance).

### Added — Wizard Directory Creation

`ensureConfigDirectories()` now creates `~/.config/mcp-sap/memory/` and `~/.config/mcp-sap/strategies/` with private permissions (mode 0o700) alongside the existing config, keypair, data, log, and cache directories.

### Security

- Path traversal protection on all strategy store operations (`sanitizePathSegment`)
- All SQL queries use parameterized prepared statements (no string interpolation)
- Hermes bridge opens read-only connections only
- Memory database is local-only — no network access
- No secrets, private keys, or keypair bytes stored in the memory DB
- 0 dependency vulnerabilities (`pnpm audit`)
- `createRequire` used instead of `require()` to satisfy ESLint

## 0.9.22 - 2026-07-25

### Added

- **`signerProfile` per-call parameter** on `sap_payments_finalize_transaction`.
  Agents can now sign with a specific profile without switching `.active-profile`
  manually. Multiple profiles coexist in the same session. Eliminates the #1
  source of agent friction: profile-switch juggling + stale signer cache.
- **`sap_build_sol_transfer`** — Hosted unsigned builder for native SOL transfers
  using `SystemProgram.transfer`. Fills the gap left by `spl-token_transferSol`
  (local-signer-only). Returns base64 unsigned transaction for local signing.
- **`sap_build_spl_transfer`** — Hosted unsigned builder for SPL token transfers
  with idempotent ATA creation. Uses raw `@solana/web3.js` `TransactionInstruction`
  (no `@solana/spl-token` dependency). Returns base64 unsigned transaction.
- **x402 idempotency cache** in `McpMonetizationGate` — prevents double-charge on
  retry. Successful settlements are cached by `requestHash` for 5 minutes
  (max 10,000 entries, LRU eviction, opportunistic pruning). If the same
  request is retried after a network failure, the cached settlement is returned
  without re-charging the payer's USDC.
- **x402 nonce + TTL strict validation** — `validatePaymentRequirementsForDecision`
  now enforces `maxTimeoutSeconds ≤ 120` and rejects invalid/missing TTL values.
  Prevents stale challenge replay attacks.
- **Challenge-signature parameter** on `sap_profile_switch` — optional Ed25519
  signature proving ownership of the target profile keypair. Prevents
  impersonation via manual `.active-profile` file edits.
- **`preloadPremiumProviders`** at server startup — providers are eagerly loaded
  and connected when the server boots, not lazily on first request. The
  `providerHealth` response now reflects real provider status immediately.
- **3 new free meme-radar providers** (DexScreener + Solana RPC, no API keys):
  - `meme.newlisting.alert` — detects newly listed tokens via DexScreener
    `pairCreatedAt` with honeypot/dev-wallet risk flags.
  - `meme.rugpull.detector` — on-chain mint/freeze authority checks via Solana
  RPC + DexScreener liquidity drain detection. Risk score 0-1 with
    exit/monitor/caution actions.
  - `meme.social.sentiment` — bull/bear scores from DexScreener price momentum
  (1h/6h/24h weighted) with volume acceleration confidence.
- **Multi-feed Pyth** — `pyth.price.tick` and `pyth.volatility.watch` now poll
  5 feeds by default (SOL/USD, WBTC/USD, WETH/USD, JUP/USD, USDC/USD) instead
  of 1. All Pyth providers converted from WebSocket to HTTP polling
  (`hermes.pyth.network/v2/updates/price/latest`).
- **`signalConfidence` field** on Pyth price tick events — normalized 0-1
  confidence score derived from `1 - (confidenceInterval / price)`, separate
  from the raw Pyth `confidenceIntervalUsd`.
- **ATR-based SL/TP** for volatility breakout signals — `stopLoss = entry ∓
  2×ATR`, `takeProfit = entry ± 3×ATR`, with `minSpreadPct` filter (0.1%)
  to discard signals too tight for on-chain execution. `action` changed from
  `sell` to `swap` for spot-only agents.
- **Applied filters in webhook relay response** — `sap_premium_webhook_relay`
  now returns `subscribedEvents` and `appliedFilters` in the subscription
  response for agent verification.
- **`sap-mcp-optimization` skill** (devops category) — documents pre-estimate,
  profile routing, build→sign→submit, x402 payment rules, readiness checks,
  budget management, and premium stream consumption patterns.
- Tool count: 317 → 319. Test count: 603 (unchanged, all updated).

### Changed

- **Premium capability prices halved** — all 13 premium capabilities now cost
  50% less per unit/event:
  - `jupiter.quote.delta`: $0.02 → $0.01/min
  - `pyth.price.tick`: $0.015 → $0.0075/min
  - `price.threshold.crossed`: $0.001 → $0.0005/event
  - `jupiter.arbitrage.scan`: $0.05 → $0.025/min
  - `pyth.volatility.watch`: $0.03 → $0.015/min
  - `jupiter.route.optimized`: $0.025 → $0.0125/min
  - `meme.newlisting.alert`: $0.003 → $0.0015/event
  - `meme.social.sentiment`: $0.02 → $0.01/min
  - `meme.rugpull.detector`: $0.04 → $0.02/min
  - `meme.volume.spike`: $0.025 → $0.0125/min
  - `tech.github.activity`: $0.002 → $0.001/event
  - `tech.tvl.change`: $0.02 → $0.01/min
  - `tech.tokenomics.analysis`: $0.004 → $0.002/event
- **Heavy value-action price**: $0.15 → $0.05 (max accepted x402 for
  value-action tier tools).
- **Auto-pay threshold**: $0.02 → $0.05 (`SAP_MCP_X402_AUTO_PAY_MAX_USD`).
  Read-premium ($0.001) and builder ($0.008) calls now auto-pay without
  confirmation.
- **Premium poll/flush/metrics FREE** — `sap_premium_stream_poll`,
  `sap_premium_stream_flush`, `sap_premium_webhook_relay_status`,
  `sap_premium_metrics`, `sap_premium_session_status`, `sap_premium_close_session`
  moved to FREE_TOOLS + STRICT_FREE_TOOLS. No x402 charge for consumption
  or diagnostics.
- **Birdeye dependency removed** — all meme-radar capabilities now use
  DexScreener + Solana RPC (both free, no API key). `SAP_MCP_PREMIUM_BIRDEYE_API_URL`
  removed from all capability definitions and test fixtures.
- **Builder tool descriptions** now mention `sap_payments_finalize_transaction`
  as the 1-call alternative to the 3-step preview→sign→submit flow.
- **`sap_estimate_tool_cost`** description now explicitly says "dry-run — no
  charge, no x402 challenge" and includes `maxPriceUsd = estimate × 1.25`
  guidance.
- **`sap_quick_context` nextAction** now includes explicit routing guidance:
  accountless hosted → use `sap_payments_profile_current`, `signerProfile`
  per-call, `sap_build_sol_transfer`/`sap_build_spl_transfer`, no signing scripts.

### Fixed

- **Bridge cache coherence** — `sap_payments_profile_current` now re-reads
  `.active-profile` and re-resolves the signer on every call. No more stale
  signer after manual profile switch.
- **`sap_profile_switch` guidance** — when the hosted server is accountless,
  the response now provides 3 concrete options (local bridge, manual edit,
  CLI command) instead of a bare "Profile does not exist" error. Includes
  stale cache warning.
- **Provider preload at startup** — providers are loaded and connected when
  the server boots, not on first request. `providerHealth` is populated
  immediately, not empty `{}`.
- **Provider delivery loop logging** — all `catch` blocks in provider-bridge,
  webhook-engine, premium-tools, and premium-routes now log errors to stderr
  instead of swallowing silently.
- **Meme volume spike provider** — replaced nonexistent DexScreener
  `/v1/solana/volume` endpoint with real API (`/latest/dex/tokens/{mint}` and
  `/latest/dex/search`). Added `activeMints` tracking, EMA baseline spike
  detection, `MAX_MINTS_PER_POLL` limit.
- **Pyth providers** — converted from WebSocket (`wss://hermes.pyth.network/v2/ws`,
  rejects bare connections) to HTTP polling (`/v2/updates/price/latest`).
- **All 12 provider import paths** — fixed `../../types.js` → `../types.js`.
- **`onchain.solana.ts`** — imported `ConfirmedSignatureInfo` from
  `@solana/web3.js` to fix `blockTime: number | null | undefined` type mismatch.
- **Stale config references** — cleaned up all `0.02` auto-pay and `0.15`
  heavy value refs in `.env.example`, `config.example.json`,
  `config.secure-example.json`, `schema.json`, `mcp-client-injection.ts`, and
  `explain-x402-settlement.prompt.ts`.

### Security

- x402 idempotency cache prevents double-charge on retry (point 2c).
- x402 nonce + TTL strict validation caps challenge lifetime at 120s (point 5b).
- Challenge-signature parameter on profile switch prevents impersonation (point 5a).
- `secretMaterial: keypair-bytes-never-returned` guarantee maintained across
  all signing tools.
- No secrets, private keys, or keypair bytes in source code (security audit clean).
- 0 dependency vulnerabilities (`pnpm audit`).

## 0.9.21 - 2026-07-25

### Added

- Added 5 new MCP tools addressing agent feedback on premium stream usability:
  - `sap_premium_stream_poll` — Long-poll buffered premium stream events with
    `sinceEventId` cursor. MCP-compatible alternative to SSE connections.
  - `sap_premium_stream_flush` — Bulk flush buffered events with cursor pagination
    for catch-up after disconnection.
  - `sap_quick_context` — Single-call bootstrap aggregator (version, tools, pricing,
    premium, skills, nextAction) reducing agent bootstrap from 5+ calls to 1.
  - `sap_premium_webhook_relay` — Buffer-only webhook subscription for local agents
    without a public HTTPS endpoint. Events stored server-side, consumed via poll/flush.
  - `sap_premium_webhook_relay_status` — Relay config and buffered event count lookup.
- All 5 tools are free (no x402 charge) and transport-agnostic (work with SSE,
  WebSocket, and any MCP transport).
- Pricing tiers in `sap_quick_context` now include actual USD amounts inline.

### Improved

- `sap_skills_bundle` description now documents the existing `skills[]` filter +
  `includeContents:false` metadata-only pattern for efficient selective loading.
- `sap_premium_stream_poll` description clarifies it is transport-agnostic.
- Tool count: 312 → 317. Premium category: 13 → 17. New category: quickContext: 1.
- Test count: 601 → 603 (2 new webhook relay tests).

### Fixed

- GitHub Actions CI: added `pnpm config set minimumReleaseAge 0` step to
  `desktop-release.yml` to fix `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`.
- Removed `package-lock=false` from `.npmrc` (prevented pnpm from reading
  `pnpm-lock.yaml` on local dev).
- Regenerated `pnpm-lock.yaml` with pnpm 11.7.0 to fix
  `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` on CI overrides.
- Changed `postcss` override from `8.5.18` to `^8.5.18` (range, not exact).
- Renamed tag `v0.9.20` → `0.9.20` (consistent with all prior tags).
- Updated all `0.9.18` references to `0.9.20` across docs, server.json, README,
  USER_DOCS, and desktop wizard renderer.

## 0.9.20 - 2026-07-25

### Added

- Added MCP tools for perpetual futures market analytics and chart analysis:
  - `sap_perp_markets` — List Adrena perp markets with mark price, funding, OI.
  - `sap_perp_position_info` — Read on-chain Adrena perp positions for a wallet.
  - `sap_perp_funding_history` — Historical funding rates from Adrena API.
  - `sap_chart_ohlc` — OHLC candlestick data for any Solana token (DexScreener).
  - `sap_chart_long_term` — Long-term price history + protocol TVL (DexScreener + DeFiLlama).
  - `sap_chart_volume_profile` — Volume profile analysis with POC, VAH, VAL.
  - `sap_perp_liquidation_zones` — Compute liquidation zones for open positions.
- Execution builders were later removed from the public surface until IDL-backed, locally finalizable
  perps transactions can meet the SAP MCP signing and safety bar.

### Removed

- Removed `sap-premium-agent-events` plugin (depended on REGISTRY_STREAM_URL — internal).
- Removed `sap-premium-x402-ledger` plugin (depended on X402_STREAM_URL — internal).
- Removed `sap-premium-trading-signals` plugin (depended on SIGNAL_PROVIDER_URL — not built).
- Removed `sap-premium-lowcap-discovery` plugin (depended on BIRDEYE_API_URL — paid).
- Removed `meme.social.sentiment` capability (depended on BIRDEYE_API_URL — paid).
- Removed `tech.github.activity` and `tech.tokenomics.analysis` capabilities (GITHUB_API_URL — rate limited).
- Removed `mempool.whale.alert` capability and provider.
- Removed all env vars for paid/internal services: REGISTRY_STREAM_URL, X402_STREAM_URL,
  SIGNAL_PROVIDER_URL, BIRDEYE_API_URL, GITHUB_API_URL, MEMPOOL_STREAM_URL.
- Deleted 4 manifest JSON files, 11 provider TS files, 2 provider directories.

### Improved

- Hardened `webhook-engine.ts`: `signDelivery()` now throws if
  `SAP_MCP_PREMIUM_WEBHOOK_SIGNER` is not set (was using 'fallback-dev-key').
- Zero signing keys exposed in premium provider code — all providers are read-only
  data streams + webhook delivery. No sendTransaction, Keypair.from, or secretKey.
- Premium capabilities reduced from 23 to 10 — all now use only free APIs.
- Updated `server-metadata.ts` tool count from 302 to 312.
- Updated `builtin-plugins.test.ts` plugin count from 8 to 4.
- Updated `trading-capabilities.ts` from 6 to 3 capabilities.
- Updated pnpm overrides for Dependabot vulnerability fixes (postcss, langsmith,
  @hono/node-server, uuid).
- Bumped package, server metadata, and runtime version to `0.9.20`.

## 0.9.19 - 2026-07-25

### Added

- Added 5 new premium plugin definitions with 15 additional capabilities:
  - `sap-premium-trading-streams` — 4 WebSocket stream capabilities (arbitrage,
    volatility, whale, route optimization) powered by Jupiter, Pyth, and Helius.
  - `sap-premium-trading-signals` — 3 webhook signal capabilities (breakout,
    liquidation cascade, funding rate) via the signal provider rail.
  - `sap-premium-meme-radar` — 4 capabilities (new listing alert, social
    sentiment, rugpull detector, volume spike) using Birdeye + DexScreener.
  - `sap-premium-lowcap-discovery` — 3 capabilities (gem scan, early entry,
    holder analysis) using Birdeye API for low-cap token discovery.
  - `sap-premium-tech-fundamentals` — 3 capabilities (GitHub activity, TVL
    change, tokenomics analysis) using GitHub + DeFiLlama APIs.
- Added real provider implementations for all 3 core premium plugins
  (market-data, agent-events, x402-ledger) with WebSocket connections,
  exponential backoff reconnection, queue-based async generators, and graceful
  disconnect. Replaced all stub/skeletal placeholders.
- Added 17 provider adapter files in the private subrepo
  (`sap-mcp-premium-private/providers/`) covering trading streams, trading
  signals, meme radar, lowcap discovery, and tech fundamentals with real
  WebSocket and HTTP polling implementations against free API endpoints.
- Added OHLC candlestick and on-chain Solana data providers using
  `@solana/web3.js` Connection and Birdeye OHLC endpoint.
- Added 5 pure-function technical indicators (Bollinger Bands, ATR, RSI,
  Volume Profile, Holder Concentration) and 5 stateless strategy engines
  (Scalping, Arbitrage, Momentum, Mean-Reversion, Meme-Sniper).
- Added 5 manifest JSON files for the new premium plugins in the private
  subrepo, bringing the total to 8 manifests with 24 capabilities.
- Added `src/remote/premium-routes.ts` and `src/remote/premium-memory.ts` for
  HTTP premium delivery rails.
- Added full TSDoc documentation (`@name`, `@description`, `@flow`, `@env`,
  `@module`) across all premium source files and private subrepo providers.

### Improved

- Updated `builtin-plugins.ts` to merge `TRADING_PREMIUM_PLUGINS`,
  `MEME_RADAR_PREMIUM_PLUGINS`, `LOWCAP_DISCOVERY_PREMIUM_PLUGINS`, and
  `TECH_FUNDAMENTALS_PREMIUM_PLUGINS` into `listPremiumPlugins()`.
- Updated premium env templates (production, staging, trading) with 6 new
  provider env vars for Birdeye, DexScreener, GitHub, DeFiLlama, mempool, and
  signal provider endpoints.
- Rewrote private subrepo README with complete structure documentation and
  zero references to stubs or placeholders.
- Bumped package, server metadata, and runtime version to `0.9.19`.

## Unreleased

### Added

- Added a typed SAP MCP premium plugin runtime foundation with free discovery
  and planning tools for stream, webhook, and premium plugin contracts.
- Added `sap_premium_plugin_catalog`, `sap_stream_catalog`,
  `sap_webhook_catalog`, `sap_premium_validate_plugin_manifest`,
  `sap_premium_plugin_template`, `sap_premium_session_start`, and
  `sap_premium_session_status`.
- Added premium manifest validation for ids, semver, descriptions, JSON
  Schemas, pricing policies, and delivery contracts.
- Added built-in contract manifests for premium market data, SAP agent events,
  and x402 ledger telemetry without returning fake live data when providers are
  not configured.
- Added public machine-readable premium discovery endpoints at
  `/premium/catalog.json`, `/premium/streams.json`, and
  `/premium/webhooks.json`.
- Added a manifest-only private plugin loader for controlled deployments using
  `SAP_MCP_ENABLE_PREMIUM_PLUGINS`, `SAP_MCP_PLUGIN_DIR`, and
  `SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY`.

### Improved

- Kept premium discovery/session planning free in both default and strict
  monetization modes so agents can validate provider readiness before paid
  stream/webhook activation.
- Documented the private enterprise plugin loader contract and the rule that
  live premium data must only be promised when provider readiness is true.
- Added capability-level `providerReady` signals to premium catalog responses,
  strict root schema validation for premium plugin manifests, and bounded
  in-memory premium session pruning.
- Hardened premium manifests against unknown fields and unsafe provider env
  values so private provider secrets or executable code cannot leak through
  public discovery.

## 0.9.18 - 2026-07-23

### Improved

- Strengthened MCP tool metadata so every registered tool carries fluent
  intent-level guidance covering pricing, routing, and signer boundaries.
- Extended JSON Schema enrichment to nested object, array, `oneOf`, `anyOf`,
  and `allOf` branches so agents receive contextual descriptions for complex
  parameters instead of guessing field names.
- Added release-blocking regression coverage that fails if any tool has a thin
  description, lacks exact-field guidance, or exposes an undescribed nested
  input parameter.
- Bumped package, public server metadata, desktop wizard, docs, and runtime
  snippets to `0.9.18` for a coherent release surface across hosted MCP,
  npm, registries, and client setup flows.

## 0.9.17 - 2026-07-23

### Added

- Added the `sap-agent-intent-router` prompt, a compact MCP prompt that maps
  user goals and common SAP/x402/MCP errors to the correct hosted read,
  paid-call, local-signing, unsigned-builder, escrow, registry-write, or repair
  flow.

### Improved

- Updated MCP initialize instructions so runtimes that support prompts can use
  `sap-agent-intent-router` before paid calls, registry writes, escrow flows,
  identity updates, and troubleshooting.
- Bumped public metadata, npm/package manifests, desktop wizard references, and
  client config snippets to `0.9.17` so users, registries, and agent runtimes
  receive a single coherent release identity.
- Moved supply-chain overrides to `pnpm-workspace.yaml` for pnpm 11 and pinned
  patched `fast-uri`, `hono`, and `@hono/node-server` versions so desktop
  release jobs pass the moderate-level audit gate.
- Removed the duplicate npm `package-lock.json` from the pnpm-managed source
  tree and disabled package-lock generation, preventing stale npm lock alerts
  from diverging from the verified `pnpm-lock.yaml` dependency graph.
- Hardened MCP client config validation and resource-template matching against
  CodeQL-reported URL substring bypasses and regex-based template matching.
- Hardened MCP tool-call normalization so explicit output schemas no longer
  receive synthetic `structuredContent` for text/error responses, preventing
  strict runtimes from rejecting otherwise-readable SAP tool errors.
- Taught `sap_agent_next_action`, initialize instructions, prompts, skills, and
  identity docs to classify Anchor 3012 / `AccountNotInitialized` /
  `pricing_menu` as SAP on-chain registry lifecycle issues rather than missing
  `sap_payments` runtime configuration.
- Kept the `0.9.16` hardening set intact: intent-level tool schemas, payment
  funnel telemetry, cost estimation, local MCP session reuse, hosted submit
  relay guidance, and no-key-material safety tests.

## 0.9.16 - 2026-07-21

### Added

- Added free `sap_agent_context`, a compact hosted orientation tool for exact
  wallet/agent lookups and first-page agent discovery. It gives agents a
  low-friction way to understand SAP state before running paid/broad calls.
- Added free `sap_agent_next_action`, a routing resolver for common SAP MCP
  errors and partial results. It tells agents whether to use hosted reads,
  `sap_payments_*`, `sap_runtime_repair_plan`, unsigned transaction
  finalization, or signature verification before retrying.
- Added free `sap_estimate_tool_cost`, a pre-call estimator that gives agents
  the pricing tier, expected USD cost, and recommended `maxPriceUsd` before
  using `sap_payments_call_paid_tool`.
- Added hosted payment-funnel telemetry for returned challenges, verification
  failures, and hosted-local-signer blocks so dashboard/operator metrics
  separate demand from successful settlements.
- Added a short-lived MCP session cache for local paid-call retries. It reuses
  initialized MCP sessions without caching live chain data, x402 challenges, or
  signed payment payloads.

### Improved

- Made exact base SAP registry reads free by default:
  `sap_get_agent`, `sap_get_agent_profile`, `sap_get_agent_stats`,
  `sap_get_global_state`, and `sap_is_agent_active`.
- Made `sap_list_agents` free for compact orientation calls while keeping
  broad, hydrated, full, and protocol-indexed directory scans paid.
- Added cache and singleflight protection around compact directory reads so
  hosted discovery remains faster under repeated agent/runtime probes.
- Updated agent bootstrap guidance, SAP skills, payment docs, and tool
  reference files so agents start with context, resolve routing before retrying,
  avoid temporary signing scripts, and use local `sap_payments_*` tools for
  user-signed writes.
- Expanded pricing tests and server metadata tests to cover the new free
  context/resolver tools and conditional-free discovery behavior.
- Enriched every registered tool description and root input schema with
  intent-level routing, pricing, signer-boundary, and exact-field guidance so
  agents stop guessing aliases, avoid hosted writes that require local signing,
  and route user-signed transactions through supported `sap_payments_*` flows.
- Hardened already-signed transaction submission through the hosted
  `/tx/submit` relay with explicit retry-safety, confirmation-state, and
  no-key-material audit fields.
- Added release safety coverage for root input parameter descriptions,
  hosted-local-signer ledger events, private-key guard behavior, unsafe-action
  guard behavior, and updated public metadata version examples.

## 0.9.15 - 2026-07-20

### Added

- Added free hosted `sap_agent_runtime_status`, a single runtime truth tool for
  connection checks, hosted/accountless status, local `sap_payments` bridge
  expectations, write routing, forbidden actions, and exact next tool calls.
- Added free hosted `sap_pricing_catalog` and public `GET /pricing.json`, both
  generated from the same monetization registry used by hosted x402/pay.sh
  gating.

### Improved

- Strengthened initialize instructions, SAP MCP skills, and user docs so agents
  use hosted tools for reads, `sap_payments_*` for local payment/signing,
  hosted unsigned builders plus `sap_payments_finalize_transaction` for
  user-signed transactions, and `sap_runtime_repair_plan` when the bridge is
  missing.
- Made pricing guidance explicit: `/pricing.json` and `sap_pricing_catalog`
  are for planning and UI copy; the actual x402 challenge remains the payment
  source of truth.
- Added release-readiness coverage so the shipped skills/docs keep the runtime
  status, pricing catalog, hosted builder finalization, and no-temporary-script
  guidance visible to agents.

## 0.9.13 - 2026-07-19

### Added

- Added a hosted submit-only relay at `POST /tx/submit` for already-signed
  Solana transactions. The relay never signs, never receives keypair bytes, and
  returns confirmation status, explorer URL, and retry guidance.

### Improved

- Upgraded transaction finalization from "signature returned" to a bounded
  lifecycle result: `confirmed` / `finalized` / `failed` /
  `expired_or_not_landed`, plus `retrySafe` for agent-guided retries.
- Hardened SAP agent registration into a fail-closed lifecycle: production
  agents must use `sap_payments_register_agent`, and `success:true` now means
  the agent account is confirmed and the 0.1 SOL source-level protocol treasury
  fee invariant was verified. If the account exists but the protocol fee is
  missing, underpaid, or unverifiable, the bridge returns
  `success:false`, `agentRegistered:true`, and `protocolComplete:false`.
- Deprecated the raw `sap_register_agent` wrapper for production registration
  and added `sap_protocol_invariants` / `sap_agent_identity_plan` guidance so
  agents can plan SAP + Metaplex + optional SNS identity flows before writes.
- Made `sap_payments_finalize_transaction` submit through the hosted relay by
  default when `submit:true`, while preserving `submitViaRelay:false` for fully
  local RPC submission.
- Updated `sap_submit_signed_transaction`, agent bootstrap instructions,
  Smithery config schema, public metadata, and the hosted dashboard so agents
  stop creating temporary signing scripts and use the supported local-signer +
  relay flow.

## 0.9.12 - 2026-07-19

### Improved

- Hardened `sap_payments_register_agent` so local SAP agent registration no
  longer reports a bare submitted signature as success. The bridge now waits
  for the signature/account to appear on-chain, returns the derived agent PDA,
  and clearly distinguishes confirmed registration from expired/not-landed
  transactions.
- Added agent-readable retry guidance for local registration submissions that
  do not land inside the confirmation window. Agents should ask the user before
  retrying once with the same fields, and must not fall back to hosted
  `sap_register_agent`.

## 0.9.11 - 2026-07-19

### Added

- Added `sap_payments_register_agent`, a local `sap_payments` bridge tool for
  non-custodial SAP agent registration from hosted-user setups. Agents should
  call it when hosted `sap_register_agent` returns
  `hosted_local_signer_required`, using the same registration fields plus
  `confirm: true`. The write is submitted by the user's local SAP profile
  signer and does not charge a hosted x402 access fee.

### Improved

- Updated the wizard repair manifest, bundled skills, and user docs so Codex,
  Hermes, Claude, OpenClaw, and compatible runtimes can verify that the local
  `sap_payments` bridge exposes profile, readiness, hosted paid-call, external
  x402, local registration, and transaction finalization tools after restart.
- Added agent-readable local registry error output that tells agents not to
  retry impossible hosted accountless registry writes or create temporary
  signing scripts.

## 0.9.10 - 2026-07-18

### Added

- Added `sap_payments_call_external_x402`, a local free `sap_payments` bridge
  tool for generic HTTP x402 endpoints discovered through SAP registry
  metadata. The helper performs the standard unpaid request, parses the 402
  challenge, signs locally with the user's SAP MCP profile, retries with
  `PAYMENT-SIGNATURE`, and returns the provider response plus receipt/audit
  data without exposing keypair bytes.

### Improved

- Updated agent startup guidance, bundled x402 skills, client config reference
  bundles, and user docs so agents use `sap_payments_call_paid_tool` for hosted
  SAP MCP tools and `sap_payments_call_external_x402` for external x402 agents
  instead of hand-rolling temporary HTTP/sign/retry scripts.
- Added guardrails to the generic external x402 bridge: sensitive caller
  headers are rejected, local/private/link-local targets are blocked, and
  request bodies are capped to keep the tool safe for agent runtimes.

## 0.9.9 - 2026-07-18

### Improved

- Reworked paid hosted SAP agent discovery so `sap_discover_agents`,
  `sap_list_agents`, and `sap_list_all_agents` enumerate the canonical
  on-chain `AgentAccount` directory and then apply server-side filters. This
  avoids stale capability/protocol index false negatives for agents such as
  XONA while preserving paid hosted monetization.
- Added first-class hosted directory filters for `query`, `wallet`, `agentPda`,
  `protocol`, `capability`, `capabilities`, `capabilityMode`,
  `hasX402Endpoint`, `view`, `limit`, `offset`, and opaque
  `pagination.nextCursor`.
- Kept legacy response aliases (`count`, `returned`, `offset`, `limit`,
  `truncated`, `totalEnumerated`) and the deprecated `hydrate` input so older
  agent recipes continue to work while newer agents use the paginated response.
- Updated bundled skills, startup guidance, and user docs so agents prefer
  targeted paid discovery, follow cursors, and retry with `query` or `wallet`
  before claiming an on-chain SAP agent is absent.

## 0.9.8 - 2026-07-18

### Fixed

- Added a hosted-accountless execution guard so direct write tools that require
  a user-owned signer are rejected before x402 verification or settlement. Tools
  such as `sap_register_agent`, `sap_sns_register_agent_domain`,
  `sap_sign_transaction`, direct swaps, token transfers, NFT mints, and bridge
  writes now return `hosted_local_signer_required` with
  `paymentNotCharged: true` when called against the non-custodial hosted
  server.
- Made single-domain SNS availability checks free with
  `sap_sns_check_domain`, so agents can discover whether a `.sol` name is
  available before routing the user into a local signer flow.
- Updated prompts, bundled skills, and payment docs so agents use local
  `sap_payments_call_paid_tool` for paid hosted calls and
  `sap_payments_finalize_transaction` for unsigned hosted builders, instead of
  retrying impossible hosted signer writes or creating temporary signing
  scripts.

## 0.9.7 - 2026-07-17

### Fixed

- Fixed Hermes/OpenClaw YAML generation for hosted SAP MCP plus local
  `sap_payments` bridge configs. The wizard and repair flow now double-quote
  YAML scalar values such as scoped npm package names
  (`@oobe-protocol-labs/sap-mcp-server@...`) and indent `args` list items with
  parser-safe YAML.
- Updated user docs and generated manual snippets so copied Hermes YAML no
  longer fails on reserved leading characters such as `@`.
- Clarified local keypair signer logs: hosted SAP MCP never receives keypair
  bytes, while production/value funds should prefer external signer, hardware
  wallet, delegated session, or a capped local profile.

## 0.9.6 - 2026-07-17

### Added

- Added free hosted maintenance tools:
  - `sap_skills_upgrade_plan` returns latest-release skill upgrade commands,
    target directories, and next tool calls without pretending hosted MCP can
    write local files.
  - `sap_runtime_repair_plan` returns the pinned repair command, OS command
    aliases, expected `sap_payments` bridge tools, and runtime restart guidance.

### Fixed

- Fixed structured MCP output for tools with explicit output schemas. Tools such
  as `sap_agent_start` now return schema-valid `structuredContent` instead of a
  nested MCP `content` wrapper, avoiding strict runtime errors like
  `success is a required property`.
- Updated the agent startup playbook so stale skills and missing
  `sap_payments` bridge issues route through free maintenance tools before paid
  or write workflows.
- Updated user docs and bundled skills to teach `sap_skills_upgrade_plan` and
  `sap_runtime_repair_plan` as the canonical recovery path.

## 0.9.5 - 2026-07-17

### Added

- Added a first-step setup path menu to the CLI wizard so users can choose
  **Full hosted SAP MCP setup**, **Repair hosted runtime + sap_payments bridge
  only**, or manual snippets before any profile/wallet prompts.
- Added `sap-mcp-config repair` plus `repair-payments` and `repair-bridge`
  aliases for users who already have a local SAP MCP profile and only need to
  repair hosted `sap` plus local `sap_payments` runtime entries.

### Fixed

- Made the repair-only path use the same auto-resolver as the full wizard,
  preserving unrelated MCP servers while updating only OOBE SAP MCP entries,
  stale `mcp-remote` wrappers, SAP allow-list issues, and the local x402
  reference bundle.
- Updated user docs, README, and the hosted dashboard so normal users can find
  the repair path without rerunning full profile/wallet setup.

## 0.9.4 - 2026-07-17

### Added

- Added `sap_payments_finalize_transaction`, a free local `sap_payments` bridge
  tool that previews, policy-checks, signs, and optionally submits unsigned
  transactions returned by hosted SAP MCP builders.
- Added regression coverage proving the bridge-only process exposes the local
  finalizer and can sign a hosted-style transaction without temporary scripts or
  keypair-byte exposure.

### Fixed

- Updated agent prompts, skills, docs, wizard copy, and public dashboard
  guidance so hosted builders route transaction finalization through the local
  bridge instead of hosted `sap_sign_transaction` or ad-hoc `.js`/`.mjs`
  signing scripts.
- Tightened the bridge-only tool list in docs to match the actual
  `sap_payments` surface.

## 0.9.3 - 2026-07-17

### Changed

- Rebalanced hosted x402 pricing for agent commerce UX: premium reads now
  default to `$0.001`, builder/preflight calls default to `$0.008`, and
  value-moving actions stay on the value-action tier.
- Classified `jupiter_getQuote` and `magicblock_swapQuote` as lightweight
  read-premium calls instead of builder calls, so agents can quote and preview
  without paying value-action style fees.
- Kept SAP payment readiness, x402 estimates, transaction decode, and
  transaction preview free so agents can choose tools, check limits, and prepare
  safe execution without bottlenecks.

### Fixed

- Strengthened SAP MCP initialize instructions, `sap_agent_start`, transaction
  tool descriptions, and MagicBlock tool descriptions so agents use the official
  `sap_preview_transaction` -> `sap_sign_transaction` ->
  `sap_submit_signed_transaction` path instead of creating temporary local
  signing scripts or reading keypair files.
- Removed hard-coded MagicBlock `$0.01`/`$0.05` pricing text from tool
  descriptions; hosted prices now resolve from the central pricing registry.

## 0.9.2 - 2026-07-17

### Added

- Added the free `sap_agent_start` tool and matching `sap-agent-start` prompt so
  users can tell an agent "Start SAP MCP" instead of pasting a long operations
  prompt. The bootstrap points agents to `sap_skills_bundle`,
  `sap_payments_readiness`, and `sap_payments_call_paid_tool` while preserving
  hosted accountless/non-custodial behavior.

### Fixed

- Tightened SAP MCP agent bootstrap behavior so simple connection checks stay
  concise instead of dumping the full tool catalog or protocol category list.
- Added AgentKit SPL token input alias normalization for common wallet-owner
  fields, reducing schema-discovery retries in agent runtimes.

## 0.9.1 - 2026-07-16

Hotfix for hosted SAP MCP users whose agent runtime connected to the remote
`sap` server but could not start the local non-custodial `sap_payments` bridge
from an `npx`/`npm exec` install.

### Fixed

- Fixed `sap-mcp-server` startup when launched by Hermes, Codex, Claude,
  OpenClaw, or another MCP runtime through `npx` outside the repository. The
  CLI bootstrap now adds both package-local and npm/npx parent `node_modules`
  paths before loading the server, so SAP SDK assets such as
  `@oobe-protocol-labs/synapse-sap-sdk/idl/synapse_agent_sap.json` resolve
  correctly.
- Made the runtime module resolver find the actual package root from any
  compiled `dist/*` entrypoint instead of assuming a fixed folder depth.
- Updated generated runtime config examples and wizard tests to pin the local
  `sap_payments` bridge to `@oobe-protocol-labs/sap-mcp-server@0.9.1`.

### Verification

- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm test -- --run src/runtime/module-resolution.test.ts src/payments/pricing.test.ts src/payments/monetization-gate.test.ts src/remote/server.test.ts`
- `pnpm run build`
- Real packaged install smoke test from a temporary directory using the generated
  npm tarball and `SAP_MCP_PAYMENTS_BRIDGE_ONLY=true`.

## 0.9.0 - 2026-07-16

Release-candidate quality pass for the hosted-first SAP MCP wizard, desktop
installer, public dashboard, and local non-custodial payment bridge before the
official 1.0.0 line.

### Added

- Added homepage and docs quick-start steppers for the two supported integration
  paths: native desktop download for normal users and CLI wizard for developers,
  with direct references to `/docs` pages for desktop setup, client configs, and
  x402/pay.sh payments.
- Redesigned the hosted landing page navigation and integration path as a
  server-rendered glass navigation bar plus shadcn-inspired setup cards with
  native Windows, macOS, and Linux download actions.

### Fixed

- Fixed the packaged Windows desktop wizard startup by converting the internal
  `dist/wizard-core` module path to a `file://` URL before dynamic ESM import.
  This prevents `ERR_UNSUPPORTED_ESM_URL_SCHEME` when the app is installed under
  a `C:\...` path.
- Fixed desktop wizard responsiveness on narrower macOS and Windows windows by
  removing page-level horizontal overflow, collapsing the setup chooser before
  it clips, and constraining long paths/URLs inside cards.
- Added a persistent Home action to the desktop wizard sidebar so users can
  return to the initial setup choice after finishing a repair or full setup.
- Fixed landing page setup-step layout on desktop and mobile by moving long CLI
  commands out of numbered steps, making command blocks horizontally scrollable,
  and preventing equal-height cards from stretching the stepper content.
- Refined the public install and native download cards so the release badge,
  platform cards, and direct installer links clearly target the current 0.9.0
  desktop wizard assets.
- Added the missing OpenAPI description for generic JSON-RPC `params` so
  x402/pay.sh catalog validators and agent indexers can explain every required
  request-body field.
- Removed MagicBlock `mock` authentication switches from public MCP tool schemas
  and request forwarding so production tools expose only real API flows.
- Made hosted `sap` plus local `sap_payments` runtime injection platform-aware
  end to end, with Windows tests proving that Codex, Claude, Hermes, and
  OpenClaw payment bridge configs use `npx.cmd` where required.

### Verification

- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm test -- --run`
- `pnpm run desktop:renderer:build`
- `npm pack --dry-run --cache ./.npm-cache`

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
