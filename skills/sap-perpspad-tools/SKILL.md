# PerpsPad Launchpad Tools

Use this skill for `sap_perpspad_*` tools: the PerpsPad permissionless
launchpad where every coin is backed by a live leveraged perp position. The
token is the wrapper — the treasury holds the backing perp for the life of
the token and its PnL + fees drive buybacks and burns. No API key: the
creator wallet is the identity.

## First Steps

1. All reads are FREE — call directly, no x402 challenge. The launch builder
   is BUILDER tier (run `sap_estimate_tool_cost` first for paid runtimes).
2. Check available markets and leverage caps before building a launch:
   `sap_perpspad_get_markets` (e.g. BTC 1-40x, SOL/ETH 1-25x, OIL 1-20x,
   XRP 1-15x, HYPE/ZEC/BNB 1-10x, memecoins 1-3x).
3. Platform health check: `sap_perpspad_get_stats` returns SOL price, live /
   graduated counts, OI, raised USD, burn events, leaderboards.

## Launch Flow (canonical)

1. `sap_perpspad_get_markets` — pick the underlying market, verify its
   leverage cap.
2. `sap_perpspad_build_launch` — returns tokenId, mint, configAddress,
   poolAddress, protocolFeeSol, and the TWO UNSIGNED transactions
   (`config` + `pool`, base64). This tool does NOT broadcast.
3. Sign and send BOTH transactions from the creator wallet — config first,
   then pool. The wallet pays rent, the dev-buy, and the 0.01 SOL protocol
   fee; it is also the dev-buy recipient. Hosted runtimes: pair with
   `sap_payments_finalize_transaction`. Sponsored/Steve-OS runtimes sign
   locally with the user wallet.
4. Poll `sap_perpspad_get_launch_status` with tokenId until `status: live`.
   The launch is promoted server-side when the pool confirms on-chain — no
   callback, and a signed transaction alone does NOT mean the launch is live.

## Tools — full parameter reference

### sap_perpspad_get_markets (FREE)
No parameters. Returns `{markets: [{symbol, minLeverage, maxLeverage}]}` —
60 markets live at integration time (BTC 40x, ETH/SOL 25x, OIL 20x,
XRP 15x, HYPE/ZEC/BNB 10x, ANSEM 3x).

### sap_perpspad_get_tokens (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| sort | enum | no | `newest` (default), `oldest`, `raised` (most SOL raised first) |
| limit | number | no | page size |
| offset | number | no | paging |

Returns tokens with: `id` (UUID), `ticker`, `name`, `description`,
`mint_address`, backing perp (`underlying`, `leverage`, `direction`),
`quote_token`/`quote_mint`/`quote_decimals`, `sol_raised`,
`migration_status`, pool addresses (null until migration), `source`,
`external_mint`/`external_platform`.

### sap_perpspad_get_token (FREE)
| Param | Type | Required |
|---|---|---|
| id | string (token UUID or base58 mint) | yes |

### sap_perpspad_get_token_events (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| id | string (UUID or mint) | yes | |
| kind | string | no | comma-separated subset of: `buyback`, `external_buyback`, `burn`, `claim`, `creator_payout` (default: buyback,external_buyback,burn) |
| limit | number | no | page size |
| offset | number | no | paging |

Returns `{tokenId, totals:{burnedTokens}, kinds, events}`.

### sap_perpspad_get_launch_status (FREE)
| Param | Type | Required |
|---|---|---|
| tokenId | string (UUID from build_launch) | yes |

Returns `{tokenId, ticker, status, migrationStatus, mint, poolAddress,
launchSignature}` — status `live` means the pool confirmed on-chain.

### sap_perpspad_get_stock_pairs (FREE)
No parameters. Returns the pairable stock mints for stock-paired launches.

### sap_perpspad_get_stats (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| include | string | no | comma-separated subset of `kpis`, `distributions`, `series`, `leaderboards` (default: all) |

Returns `{solUsd, kpis, distributions, series, leaderboards}` — kpis include
live/total/graduated token counts, OI USD, collateral USD, fees USD, raised
USD, burn events, buyback USD.

### sap_perpspad_build_launch (BUILDER)
| Param | Type | Required | Notes |
|---|---|---|---|
| ticker | string | yes | A-Z 0-9 only (e.g. MOON) |
| name | string | yes | display name |
| creatorAddress | string | yes | wallet: signer, payer, buyer, dev-buy recipient |
| devBuy | number | yes | quote units: SOL 0.1-5, USDC 5-5000 (priced quotes bounded to $1-$100000 value) |
| underlying | string | cond. | perp market symbol — required unless `legs` |
| leverage | integer | cond. | 1..market cap — required unless `legs` |
| direction | enum | cond. | `long` or `short` — required unless `legs` |
| legs | array | cond. | exactly 2 legs, each `{underlying, leverage, direction}` (e.g. NVDA long + SOL short) |
| quote | enum | no | `SOL` (default), `USDC`, `CUSTOM` |
| quoteMint | string | CUSTOM only | SPL mint to pair against (verified server-side) |
| quoteDecimals | integer | CUSTOM only | hint; server uses on-chain decimals |
| imageUrl | string | no | coin image |
| websiteUrl | string | no | website |
| twitterUrl | string | no | X/Twitter |

Validation errors are structured (`invalid_ticker`, `invalid_devBuy`,
`unknown_underlying`, `invalid_leverage`, `invalid_backing`,
`invalid_quoteMint`) with actionable messages — surface them to the user
instead of retrying blindly.

## Routing

- Hosted x402 agents: reads free; build_launch is BUILDER tier. The unsigned
  transactions must be signed by the user wallet — pair with
  `sap_payments_finalize_transaction` for local-signing runtimes.
- Sponsored/Steve-OS agents: identical flow, no x402 for reads.
- This tool family NEVER signs or broadcasts: both launch transactions must
  come from the user's wallet (the creator is signer, payer, buyer, and
  dev-buy recipient).

## Gotchas

- Signed transaction ≠ live launch: poll
  `sap_perpspad_get_launch_status` until `status: 'live'`.
- Pool addresses (`dlmm_pool_address`, `clmm_pool_address`,
  `graduated_pool_address`) are null until migration;
  `migration_status: 'curve'` = bonding-curve phase, `'graduated'` = migrated.
- `external_mint` / `external_platform` mark tokens imported from other
  platforms (not native perpspad launches).
- Upstream errors: 422 validation error, 429 IP-throttled — back off on 429.
- Response compaction caps arrays at 50 entries and the payload at 30k chars;
  use sort/limit/offset and the stats `include` filter for targeted reads.

## Canonical Sources

- Developer docs: https://perpspad.fun/developers
- OpenAPI: https://perpspad.fun/api/v1/openapi
- Implementation plan: docs/plans/2026-09-14-perpspad-tool-family.md