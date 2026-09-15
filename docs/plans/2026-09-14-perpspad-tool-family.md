# PerpsPad Tool Family — Implementation Plan

> **For Hermes:** implement directly following the Backpack/Sunrise pattern (single session, no subagents — they timed out twice; the orchestrator implements directly with TDD).

**Goal:** Add 8 `sap_perpspad_*` tools to SAP MCP exposing the PerpsPad permissionless launchpad (tokens backed by leveraged perp positions), working for both x402 hosted agents and sponsored Steve OS agents.

**Architecture:** Copy the Sunrise family structure exactly: one client (`perpspad-client.ts`), one pipeline (`perpspad-pipeline.ts`), one tools module (`perpspad-tools.ts`), one index, module entry in `builtin-tool-modules.ts` (order 247, category `integration`), pricing in `pricing.ts`, contracts in `tool-execution-pipeline-contracts.json` (25→26 files, registrations +8), skill in-repo + contract declaration + README row.

**Verified upstream facts (live 2026-09-14):**
- Base: `https://perpspad.fun` — no auth, `{ok:true, data:{...}}` envelope, CORS open.
- `GET /api/v1/markets` → `{markets:[{symbol, minLeverage, maxLeverage}]}` (60 markets: BTC 40x, ETH/SOL 25x, OIL 20x, XRP 15x, HYPE/ZEC/BNB 10x, memecoins 3x).
- `GET /api/v1/tokens?sort=newest|oldest|raised&limit=&offset=` → `{tokens:[...]}`; token fields: id (UUID), ticker, name, description, image_url, mint_address, dbc_pool_address, dlmm/clmm/graduated pool addresses (null until migration), migration_status ('curve'), underlying, leverage, direction ('long'|'short'), quote_token/quote_mint/quote_decimals, sol_raised, source, external_mint/external_platform, created_at, twitter_url, website_url.
- `GET /api/v1/tokens/{id}` → single token (id = UUID or mint). `GET /api/v1/tokens/{id}/events?kind=buyback,external_buyback,burn,claim,creator_&limit=&offset=` → `{tokenId, totals:{burnedTokens}, kinds, events}`.
- `GET /api/v1/launch/{tokenId}` → launch status (poll until `live`).
- `GET /api/v1/launch/stock/pairs` → `{pairs:[...]}` pairable stock mints.
- `GET /api/v1/stats?include=kpis,distributions,series,leaderboards` → `{solUsd, kpis:{live,total,graduated,oiUsd,collUsd,feesUsd,raisedUsd,burnEvents,buybackUsd,...}, distributions, series, leaderboards}` (live: 186 live, $162M raised).
- `POST /api/v1/launch` body `{ticker, name, creatorAddress, devBuy, underlying?, leverage?, direction?, legs?, quote?, quoteMint?, quoteDecimals?, imageUrl?, websiteUrl?, twitterUrl?}` → returns UNSIGNED `config` + `pool` transactions. Dev-buy bounds: SOL 0.1–5, USDC 5–5000. The caller signs + sends both txs; launch goes `live` when the pool confirms. NEVER called server-side in tools (moves funds) — exposed as BUILDER tool returning the unsigned txs.
- `POST /api/v1/launch/stock/prepare` `{creatorWallet, stockMint, name, symbol, underlying?, leverage?, direction?, legs?, marketCapUsd?}` → prepare payload. `POST /api/v1/launch/stock/submit` `{signedQuote, signedTransaction}` → completes stock-paired launch.

## Tasks

1. **Client** (`packages/tools/src/perpspad/perpspad-client.ts` + test): typed methods for all 9 GETs + launch/prepare/submit body validation (ticker A–Z0–9, devBuy bounds per quote token, underlying must exist in cached markets, leverage within market cap, direction enum, legs 2-element validation). Error parser for `{ok:false}` envelope. Compaction identical to backpack.
2. **Tools** (`perpspad-tools.ts`): FREE reads — `get_markets`, `get_tokens` {sort?, limit?, offset?}, `get_token` {id}, `get_token_events` {id, kind?, limit?, offset?}, `get_launch_status` {tokenId}, `get_stock_pairs`, `get_stats` {include?}. BUILDER — `build_launch` {ticker, name, creatorAddress, devBuy, underlying?, leverage?, direction?, legs?, quote?, quoteMint?, imageUrl?, websiteUrl?, twitterUrl?} (returns unsigned config+pool txs + next-step guidance: sign + send both, poll sap_perpspad_get_launch_status; explicit "this tool does NOT broadcast"). NOTE per user rule: never auto-execute launch submit with a server-side signer.
3. **Wiring**: builtin-tool-modules entry (order 250, category 'integration'), pricing FREE/BUILDER sets, contracts bump (26 files, registrations +7 reads +1 builder = +8), tool-catalog tests 23→24 modules / 202→210 local / 189→196 hosted, skill-workflow-contracts + skills/README entry.
4. **Skill** `skills/sap-perpspad-tools/SKILL.md`: flow (launch → sign both txs → poll live), leverage/direction semantics, basket legs, stock-paired variant, dev-buy bounds, quote options (SOL/USDC/CUSTOM).
5. **Live tests** (SAP_LIVE_TESTS=1): markets, tokens list, token by id, stats shape.
6. Release: changelog, verify:release, version align (0.9.85), tag, gh release.