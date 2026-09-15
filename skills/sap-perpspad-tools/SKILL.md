# PerpsPad Launchpad Tools

Use this skill for `sap_perpspad_*` tools: the PerpsPad permissionless
launchpad where every coin is backed by a live leveraged perp position. The
token is the wrapper — the treasury holds the backing perp for the life of
the token and its PnL + fees drive buybacks and burns.

## First Steps

1. All reads are FREE. The launch builder is BUILDER tier.
2. No API key: the creator wallet is the identity.
3. Check available markets and leverage caps first:
   `sap_perpspad_get_markets` (e.g. BTC 1-40x, SOL/ETH 1-25x, OIL 1-20x,
   memecoins 1-3x).

## Launch Flow (canonical)

1. `sap_perpspad_get_markets` — pick the underlying and verify leverage cap.
2. `sap_perpspad_build_launch` — returns UNSIGNED `config` + `pool`
   transactions. This tool does NOT broadcast.
3. Sign and send BOTH transactions from the creator wallet (pays rent,
   dev-buy, and the 0.01 SOL fee). For hosted runtimes pair with
   `sap_payments_finalize_transaction`; sponsored/Steve-OS runtimes sign
   locally.
4. Poll `sap_perpspad_get_launch_status` with the returned tokenId until the
   launch is `live` (the pool confirming on-chain promotes it — no callback).

## Tools

Reads (free):

- `sap_perpspad_get_markets` — underlying markets + leverage caps.
- `sap_perpspad_get_tokens` {sort?: newest|oldest|raised, limit?, offset?} —
  launched tokens with their backing perp, quote token, SOL raised,
  migration status, pool addresses.
- `sap_perpspad_get_token` {id: UUID-or-mint} — single token.
- `sap_perpspad_get_token_events` {id, kind?, limit?, offset?} —
  buyback / external_buyback / burn / claim / creator_fee transactions.
- `sap_perpspad_get_launch_status` {tokenId} — poll until live.
- `sap_perpspad_get_stock_pairs` — pairable stock mints.
- `sap_perpspad_get_stats` {include?: kpis,distributions,series,leaderboards}
  — SOL price, live/graduated counts, OI, raised USD, burn events.

Builder (BUILDER tier):

- `sap_perpspad_build_launch` {ticker, name, creatorAddress, devBuy,
  underlying+leverage+direction OR legs[2], quote?: SOL|USDC|CUSTOM,
  quoteMint?, imageUrl?, websiteUrl?, twitterUrl?}

## Validation Rules (enforced client-side, upstream-verified)

- `ticker`: A-Z 0-9 only.
- `devBuy`: SOL 0.1-5, USDC 5-5000 (in quote units).
- `leverage`: within the market's min/max cap.
- `direction`: 'long' or 'short'.
- Baskets: exactly 2 legs, each independently validated.
- `quote: CUSTOM` requires `quoteMint` (verified server-side).
- The 0.01 SOL launch fee is paid inside the transactions.

## Routing

- Hosted x402 agents: reads free; the launch builder is BUILDER tier. The
  unsigned transactions must be signed by the user wallet — pair with
  `sap_payments_finalize_transaction` for local signing runtimes.
- Sponsored/Steve-OS agents: identical flow, no x402 for reads.
- This tool family NEVER signs or broadcasts: both launch transactions must
  come from the user's wallet (the creator is signer, payer, buyer, and
  dev-buy recipient).

## Gotchas

- The launch is recorded server-side and promoted to `live` only when the
  pool confirms on-chain — poll `sap_perpspad_get_launch_status`, do not
  assume success from a signed transaction.
- Pool addresses (`dlmm_pool_address`, `clmm_pool_address`,
  `graduated_pool_address`) are null until migration; `migration_status`
  tracks the lifecycle ('curve' = bonding curve phase).
- `external_mint` / `external_platform` mark tokens imported from other
  platforms.
- Stats `include` filter takes a comma-separated subset
  (kpis, distributions, series, leaderboards).

## Canonical Sources

- Developer docs: https://perpspad.fun/developers
- OpenAPI: https://perpspad.fun/api/v1/openapi
- Implementation plan: docs/plans/2026-09-14-perpspad-tool-family.md