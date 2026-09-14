# Backpack + Sunrise Tool Families for SAP MCP — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add two fully modular tool families — `sap_backpack_*` (Backpack Exchange CeFi API: markets, depth, trades, klines, funding, collateral, borrow/lend, securities, stock RFQ, authenticated trading via Ed25519) and `sap_sunrise_*` (Sunrise asset gateway: canonical tokens, swap quotes, execute) — to SAP MCP, working for BOTH x402-paying hosted agents AND sponsored Steve OS runtime agents, with perfect skills, catalog integration, schema integration, sap_search_tools indexing, and a full release.

**Architecture:** Follow the proven Phoenix pattern exactly: per-protocol client module in `packages/tools/src/<protocol>/` with a shared `<protocol>-pipeline.ts` (allowedDirectRegisterPipelineToolFiles), data/trading/auth tool sub-modules, a `createToolModule` entry in `builtin-tool-modules.ts` with full `expectedTools`, pricing classification in `packages/payments/src/pricing.ts` (FREE reads, BUILDER for swap/order endpoints), permission groups in `packages/security/src/tool-permissions.ts`, hosted accountless eligibility review in `packages/payments/src/hosted-tool-eligibility.ts` (all reads hosted-safe; write/execute endpoints require local signer or x402), contract bumps in `config/tool-execution-pipeline-contracts.json`, skills in `skills/`, and TDD throughout.

**Tech Stack:** TypeScript strict, zod, `@modelcontextprotocol/sdk`, native `fetch` (no new deps — Backpack/Sunrise are plain REST), vitest, pnpm monorepo.

**Key verified facts (from our live research, 2026-09-14):**
- Sunrise API `https://api.sunrise.xyz`: `GET /v1/tokens` (cursor/limit pagination, 76 tokens), `POST /v1/quotes` `{fromToken,toToken,fromAmount,fromAddress?,toAddress?}` (all strings, base units; wallets optional → no unsignedTransaction without them), `POST /v1/execute` `{signedTransaction,quoteId,routeName,providerRequestId}` poll until `status:"CONFIRMED"`. Error envelope `{success:false,error:{code,message,requestId},timestamp}`. No auth. `additionalProperties:false`.
- Backpack API `https://api.backpack.exchange`: public GETs `/api/v1/markets`, `/tickers`, `/ticker?symbol=`, `/depth?symbol=`, `/trades?symbol=`, `/klines?symbol&interval&startTime&endTime` (epoch SECONDS), `/markPrices?symbol=`, `/fundingRates?symbol=`, `/openInterest?symbol=`, `/collateral`, `/assets`, `/securities`, `/market-sessions`, `/market-holidays`, `/borrowLend/markets`, `/status`, `/ping`, `/time`. 404 traps: no `/orderbook/{sym}`, no `/trades/{sym}`, no `/markets/{sym}`. Auth: Ed25519 headers `X-Timestamp`(ms) `X-Window`(5000-60000) `X-API-Key`(b64 pubkey) `X-Signature`(b64 sig over `instruction=<type>&<params alpha>&timestamp=<ts>&window=<w>`). Corrupt sig → 400 `INVALID_CLIENT_REQUEST`; valid-but-unregistered key → 200 with empty account (never 401). WS `wss://ws.backpack.exchange` (streams ticker./depth./trade./markPrice./stockPrice.). Stock trading: RFQ flow (`POST /api/v1/rfq` with `<SEC>_USDC_RFQ` symbol, quoteQuantity NOT supported for stocks) + spot order book for `rwaMarketType:STOCK` markets outside sessions. Speed bump 100ms on takers. Official SDK: Rust `bpx-api-client`; npm community `bpx-api-client`.
- Credentials model for Backpack trading tools: the server NEVER holds Backpack API secrets in plaintext. Tools accept an explicit `apiKeyId` param referencing a profile-local credential entry created via wizard/CLI (or the caller passes nothing and the tool returns `backpack_credentials_required` with setup instructions). Local `sap_payments` bridge owns keypair material — same trust boundary as everything else in SAP MCP.

**Pricing model (matches existing tiers):**
- All Backpack public market-data reads + all Sunrise reads: FREE (like Phoenix data tools — external free APIs).
- `sap_sunrise_get_quote` / `sap_sunrise_execute_swap`: BUILDER tier (returns unsigned tx; x402-paying agents pay the builder fee; sponsored Steve agents run via local signer path).
- Backpack authenticated order tools (`sap_backpack_execute_order`, `cancel`, `withdraw`): BUILDER tier wrappers that call Backpack's signed REST — they do NOT move Solana funds themselves; they mutate Backpack CEFI account state. They are `hostedAccountlessBlocked: false` BUT require Backpack API credentials, so hosted agents without credentials get a structured `backpack_credentials_required` error guiding setup.

---

## Task 1: Backpack API client module (packages/tools/src/backpack/backpack-client.ts)

**Objective:** Pure HTTP client for Backpack public + signed endpoints, fully typed, zero SAP dependencies (mirrors `phoenix-data-api.ts` isolation).

**Files:**
- Create: `packages/tools/src/backpack/backpack-client.ts`
- Test: `packages/tools/src/backpack/backpack-client.test.ts`

**Step 1: Write failing tests** covering: `buildSigningString` alphabetical ordering + instruction prefix + timestamp/window; signature verify round-trip with node crypto ed25519 (generate keypair via `crypto.generateKeyPairSync('ed25519')`, sign, verify against our own string builder); `apiGet` query param handling; 404 `not found` body → typed `BackpackUpstreamError`; corrupt-signature path produces headers identical in shape to docs (X-Timestamp ms string, X-Window '5000', X-API-Key b64, X-Signature b64).

**Step 2: Run** `pnpm vitest run packages/tools/src/backpack/backpack-client.test.ts` → FAIL (module missing).

**Step 3: Implement** `BackpackApiClient` class:
- `constructor(opts?: { baseUrl?: string; apiKey?: { publicKeyB64: string; secretSeedB64: string }; windowMs?: number })`
- Public (no auth): `getMarkets(marketType?)`, `getTicker(symbol)`, `getTickers()`, `getDepth(symbol, limit?)`, `getTrades(symbol, limit?)`, `getKlines(symbol, interval, startTimeSec, endTimeSec)`, `getMarkPrices(symbol)`, `getFundingRates(symbol)`, `getOpenInterest(symbol)`, `getCollateral()`, `getAssets()`, `getSecurities()`, `getMarketSessions()`, `getMarketHolidays()`, `getBorrowLendMarkets()`, `getStatus()`, `getServerTime()`
- Signed: `getBalances()`, `getOpenOrders(symbol?)`, `getOrderHistory(...)`, `getFills(...)`, `getDepositAddress(asset)`, `getMaxOrderQuantity(...)`, `executeOrder(body)`, `cancelOrder(body)`, `requestWithdrawal(body)` — each signs with the correct `instruction` from the docs list.
- Signing: `instruction=${i}&${sorted params}&timestamp=${ms}&window=${w}` — EXACTLY the docs scheme; use `node:crypto` `sign(null, msg, Ed25519PrivateKey)`.
- Amounts stay strings (never parseFloat — precision loss).
- `upstreamError()` compacts JSON error bodies like magicblock.

**Step 4: Run tests** → PASS.

**Step 5: Commit** `feat(backpack): typed Ed25519 API client with signing-string builder`

## Task 2: Sunrise API client module (packages/tools/src/sunrise/sunrise-client.ts)

**Objective:** Pure client for Sunrise core swap API + quote flow state machine.

**Files:**
- Create: `packages/tools/src/sunrise/sunrise-client.ts`
- Test: `packages/tools/src/sunrise/sunrise-client.test.ts`

**Step 1: Failing tests:** token list shape `{success,data:{count,tokens,pagination}}`; quote request body rejects extra fields (`additionalProperties:false` — client strips unknown keys); amount-as-string enforcement (number input → error, never silently stringify decimals); execute poll helper `executeAndWait(signedTx, {maxAttempts, intervalMs})` re-POSTs identical body while `SUBMITTED`, stops on `CONFIRMED`, throws `sunrise_execute_timeout` after maxAttempts with guidance "check wallet activity before retrying — duplicate-swap risk".

**Step 2: Run** → FAIL. **Step 3: Implement** `SunriseApiClient` with `listTokens({cursor,limit})`, `getQuote({fromToken,toToken,fromAmount,fromAddress?,toAddress?})`, `execute({signedTransaction,quoteId,routeName,providerRequestId})`, `executeAndWait(...)`. Base URL constant `https://api.sunrise.xyz`, error envelope parser. **Step 4:** PASS. **Step 5:** commit.

## Task 3: Backpack data tools (packages/tools/src/backpack/backpack-data-tools.ts)

**Objective:** ~14 free read tools via pipeline pattern.

**Files:** Create `backpack-data-tools.ts` + shared `backpack-pipeline.ts`.

**`backpack-pipeline.ts`** (mirrors phoenix-pipeline.ts): `registerBackpackPipelineTool`, `backpackPipelineOk`, `backpackPipelineException`, `compactBackpackResponse` (30k char cap, 50-entry array cap, preserve base64 tx strings via deserialization check, BigInt→string). Add `packages/tools/src/backpack/backpack-pipeline.ts` to `allowedDirectRegisterPipelineToolFiles` in `config/tool-execution-pipeline-contracts.json`.

**Tools (all `sap_backpack_` prefix, all FREE):**
- `sap_backpack_get_markets` {marketType?: 'SPOT'|'PERP'} — 189 markets; compacted
- `sap_backpack_get_market` {symbol} — uses `/api/v1/markets?` filtered client-side (no /markets/{sym} endpoint — 404 trap!)
- `sap_backpack_get_ticker` {symbol}
- `sap_backpack_get_tickers` {}
- `sap_backpack_get_depth` {symbol, limit?} — top N levels both sides
- `sap_backpack_get_trades` {symbol, limit?}
- `sap_backpack_get_klines` {symbol, interval, startTime, endTime} — converts ISO or epoch to SECONDS; validates interval enum (1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M)
- `sap_backpack_get_mark_price` {symbol} — markPrice + indexPrice + fundingRate
- `sap_backpack_get_funding_rates` {symbol}
- `sap_backpack_get_open_interest` {symbol}
- `sap_backpack_get_collateral` {}
- `sap_backpack_get_assets` {symbol?} — optional filter, default compact list
- `sap_backpack_get_securities` {asset?} — stock sessions/limits
- `sap_backpack_get_market_sessions` {}
- `sap_backpack_get_borrow_lend_markets` {asset?}
- `sap_backpack_get_status` {}

TDD: schema validation tests + one live-API integration test marked `describe.skipIf(!process.env.SAP_LIVE_TESTS)`.

## Task 4: Sunrise data + quote tools (packages/tools/src/sunrise/sunrise-data-tools.ts)

**Objective:** Reads + quote flow builders.

**Files:** `sunrise-pipeline.ts` (same pattern, add to contracts allowlist), `sunrise-data-tools.ts`.

**Tools:**
- `sap_sunrise_list_tokens` {assetClass?, symbol?, limit?, cursor?} — FREE; client-side filter on assetClass/symbol over the full page; returns canonical mints with tokenProgram info
- `sap_sunrise_resolve_token` {symbolOrMint} — exact symbol match → canonical mint; explicitly warns about spoofed tokens in description ("Always resolve via this tool, never type mints from social media")
- `sap_sunrise_get_quote` {fromToken, toToken, fromAmount, fromAddress?, toAddress?} — BUILDER tier; validates mints against `/v1/tokens` + core-asset constant mints (USDC/USDT/WETH/WBTC are NOT in the list — use hardcoded verified constants); amounts in base units as strings; returns quotes array; includes `nextStep` guidance field ("sign the unsignedTransaction locally, then sap_sunrise_execute_quote")
- `sap_sunrise_execute_quote` {signedTransaction, quoteId, routeName, providerRequestId?} — BUILDER tier; hostedAccountlessBlocked=true (requires signed tx from user wallet); returns `{txHash, status}`; when status=SUBMITTED instructs to re-call with identical args
- `sap_sunrise_swap_intent` {fromSymbol, toSymbol, fromAmount, fromAddress, toAddress} — convenience: resolve symbols → get quote with wallet → returns unsignedTransaction + next steps (no execution)

## Task 5: Backpack trading tools (packages/tools/src/backpack/backpack-trading-tools.ts)

**Objective:** Signed account + trading wrappers with credentials guard.

**Tools (BUILDER tier, all require Backpack API credentials in context):**
- `sap_backpack_get_balances` (instruction balanceQuery)
- `sap_backpack_get_open_orders` {symbol?} (orderQueryAll)
- `sap_backpack_get_order_history` {symbol?, limit?} (orderHistoryQueryAll)
- `sap_backpack_get_fills` {symbol?, limit?} (fillHistoryQueryAll)
- `sap_backpack_get_max_order_quantity` {symbol, side, price?, leverage?} (maxOrderQuantity)
- `sap_backpack_execute_order` {symbol, side: 'Bid'|'Ask', orderType: 'Market'|'Limit'|..., quantity, price?, postOnly?, clientOrderId?} (orderExecute) — structured pre-trade validation: min quantity/stepSize from getMarkets cache, price required for Limit, `postOnly` hint about 100ms taker speed bump
- `sap_backpack_cancel_order` {symbol, orderId} (orderCancel)
- `sap_backpack_cancel_all_orders` {symbol?} (orderCancelAll)
- `sap_backpack_get_deposit_address` {asset} (depositAddressQuery)
- `sap_backpack_request_withdrawal` {asset, address, quantity} (withdraw) — REQUIRES explicit confirm flag like other value tools

**Credentials resolution:** `BackpackCredentialsResolver` reads from context config (`config.backpack?: { apiKeys: Record<profileId, {publicKeyB64, secretSeedB64}> }`) — local profiles only. On hosted with no credentials → structured error `{error:'backpack_credentials_required', setup:'create an API key at backpack.exchange/settings/api-keys and add it to your local SAP MCP profile config', note:'hosted agents can still use all public market-data tools'}`. Seed NEVER logged, never in error messages.

**RFQ tools (stock markets):**
- `sap_backpack_get_rfq_markets` — derives from /securities + sessions
- `sap_backpack_submit_rfq` {symbol (RFQ form), side, quantity, executionMode?, price?} (rfqSubmit)
- `sap_backpack_get_open_rfqs` (rfqQuery)
- `sap_backpack_accept_quote` {rfqId, quoteId?} (quoteAccept) — with binding-settlement warning in description
- `sap_backpack_cancel_rfq` {rfqId} (rfqCancel)

**Config schema:** add `backpack` optional key to `config.schema.json` + `packages/config-runtime/src/env.ts` parsing + `config.example.json` example with placeholder.

## Task 6: Registration, catalog, permissions, pricing, eligibility (wiring)

**Objective:** Wire both families into every integration surface.

**Files (modify):**
1. `packages/tools/src/builtin-tool-modules.ts` — two new modules:
   - `{id:'backpack', title:'Backpack Exchange', category:'integration', order:245, expectedTools:[all sap_backpack_*], register:registerBackpackTools}`
   - `{id:'sunrise', title:'Sunrise Gateway', category:'integration', order:246, expectedTools:[all sap_sunrise_*], register:registerSunriseTools}`
2. `config/tool-execution-pipeline-contracts.json` — bump `minimumPipelineToolFiles` 23→25, `minimumPipelineToolRegistrations` 193→~212 (exact count after implementation), add both pipeline files to `allowedDirectRegisterPipelineToolFiles`.
3. `packages/payments/src/pricing.ts` — FREE_TOOLS += all data reads; BUILDER_TOOLS += sunrise_get_quote/execute_quote/swap_intent + backpack trading wrappers (they proxy signed REST calls, they don't build Solana txs — builder not value-action; zero Solana funds movement).
4. `packages/payments/src/hosted-tool-eligibility.ts` — add `sap_backpack_` + `sap_sunrise_` reads to HOSTED_SAFE_PREFIXES (they're pure external-HTTP reads, no signing); sunrise_execute_quote is already safe (takes a PRE-signed tx); backpack trading tools are also safe (they use Backpack API keys, not the user's Solana keypair — different trust domain, guarded by credentials presence). Verify with the existing test harness.
5. `packages/security/src/tool-permissions.ts` — no new SapPermission needed: Backpack trading mutates CeFi state not Solana; map trading tools to `payments:write`-adjacent? NO — keep them unmapped (default allow) since they're credential-gated, and add ONLY the two withdrawal/order tools to a new explicit group if the test harness requires it. Decide from `isWriteOperation` prefix list: add `sap_backpack_` write tools explicitly to avoid accidental readonly-mode writes.
6. `packages/tools/src/index.ts` — export register functions.
7. `src/tools/` mirror re-exports (check how adrena-tools.ts mirrors).

**Tests:** extend `src/tools/module-registry.test.ts` patterns — module ids valid, expectedTools non-empty, both runtime profiles select the modules, no duplicate tool names (CRITICAL: check no collision with existing catalog), permission map has no duplicates.

## Task 7: sap_search_tools indexing + estimate-tool-cost pricing (verify-only)

**Objective:** Confirm zero-code integration works, add tests proving it.

`sap_search_tools` BM25 indexes registered tools dynamically (tool-catalog) — new tools appear automatically. `sap_estimate_tool_cost` reads pricing.ts tiers — automatic. Tests:
- search "backpack depth" returns sap_backpack_get_depth in top 5
- search "sunrise swap quote" returns sap_sunrise_get_quote
- estimate returns 'free' tier for sap_backpack_get_markets

## Task 8: Skills (private, per user standard)

**Files:** Update existing profile skills `~/.hermes/profiles/software-engineer/skills/solana/sunrise-protocol` + `backpack-exchange-api` with SAP MCP tool mapping sections; add in-repo skills for agents:
- `skills/sap-backpack-tools/SKILL.md` — every tool with schema, example call, pricing tier, hosted vs local routing, credentials setup, speed bump, RFQ lifecycle, symbol conventions, gotchas (klines seconds, query-param symbols, 200-{}-unregistered-key trap)
- `skills/sap-sunrise-tools/SKILL.md` — swap flow, canonical mint verification, string amounts, execute poll pattern, no-quote soft declines, equities solver note
- Both must follow existing skills/ conventions (see skills/sap-agent-registry/SKILL.md style)

## Task 9: Docs + schemas + changelog

- `docs/` new integration doc: Backpack + Sunrise tool families (routing, pricing, credentials, examples)
- `USER_DOCS/04_MCP_CLIENT_CONFIGURATION_MATRIX.md` — add new tools to matrix
- `CHANGELOG.md` entry under next version
- `server.json` + README tool count updates (386 → ~425)
- Zod/JSON schemas: tool input schemas are inline (pattern-consistent) — nothing external needed beyond config schema from Task 5

## Task 10: Full verification + release (skill: sap-mcp-server-release SOP)

1. `pnpm run test` (all new tests + full suite green)
2. `pnpm run lint` + `pnpm run typecheck`
3. `pnpm run verify:tool-modules` (expectedTools sentinels + runtime profiles)
4. `pnpm run verify:tool-execution-pipeline` (contract bumps)
5. `pnpm run verify:release:offline` (full gate)
6. `pnpm run version:bump <next>` + manual fixes (packages/*/package.json, core constants, logger, runbook line, README table)
7. CHANGELOG entry
8. `pnpm run verify:release` (offline + audit)
9. Commit `Release SAP MCP <version>: Backpack Exchange + Sunrise tool families`
10. Tag no-v, push, `gh release create`, verify CI + desktop-release
11. npm publish (manual), VPS deploy runbook (both start scripts paths), post-deploy live smoke: call sap_backpack_get_ticker + sap_sunrise_list_tokens against the hosted server

**Live verification requirement (user rule: 100% verified):** every data tool gets ONE live integration test (skipped by default, run with SAP_LIVE_TESTS=1) hitting the real public endpoints and asserting response shape, so regressions in upstream APIs surface in CI-with-live-flag runs.

---

## Risks & mitigations

- **Backpack rate limits unknown** — single shared client with in-memory 60s cache for markets/securities/assets (large payloads); compact responses.
- **`/assets` is 2.1MB** — must compact server-side (top-level fields only + filter param), never ship raw.
- **RFQ accept is binding** — description must carry the warning; withdrawal tool requires explicit `confirm: true` input.
- **Hosted x402 charging for free reads** — classify ALL data reads as free in pricing.ts AND verify with a pricing unit test per tool (pattern exists for phoenix/adrena).
- **Corrupted-session risk on subagents** — this plan is the single source of truth; subagents get only their task section plus the shared verified-facts block.