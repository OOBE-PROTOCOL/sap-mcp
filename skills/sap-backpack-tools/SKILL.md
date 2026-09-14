# Backpack Exchange Tools

Use this skill for `sap_backpack_*` tools: Backpack Exchange CeFi market data,
collateral, securities, borrow/lend, and (with API credentials) account and
trading operations over the Backpack REST API.

## First Steps

1. All market-data tools are FREE — call directly, no x402 challenge.
2. Symbols are `BASE_QUOTE` spot (`SOL_USDC`) and `BASE_QUOTE_PERP` perps
   (`SOL_USDC_PERP`). Stock RFQ markets use `<SEC>_USDC_RFQ` (e.g.
   `AAPL.US_USDC_RFQ`) and stock spot books appear in `/markets` with
   `rwaMarketType: "STOCK"`.
3. For stock trading check the session first:
   `sap_backpack_get_market_sessions` (US_EQUITIES_PRE_MARKET / REGULAR /
   POST_MARKET / OVERNIGHT, America/New_York).
4. For authenticated tools you need a Backpack API key in the SAP MCP local
   profile config (`config.backpack.apiKeys`). Without credentials the signed
   tools return `backpack_credentials_required`.

## Tools

Market data (all free):

- `sap_backpack_get_markets` — all markets, optional `marketType` SPOT|PERP.
- `sap_backpack_get_market` — one market by symbol (client-side filter).
- `sap_backpack_get_ticker` / `sap_backpack_get_tickers` — 24h stats.
- `sap_backpack_get_depth` — order book, default top 20 levels each side.
- `sap_backpack_get_trades` — recent public trades.
- `sap_backpack_get_klines` — candles; `startTime`/`endTime` accept ISO or
  epoch ms, upstream is epoch seconds. Interval enum:
  `1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M`.
- `sap_backpack_get_mark_price` — mark + index + funding (perps).
- `sap_backpack_get_funding_rates` — funding history per symbol.
- `sap_backpack_get_open_interest` — OI in contracts.
- `sap_backpack_get_assets` — asset metadata, deposit/withdraw flags + fees
  (compacted; optional `symbol` filter).
- `sap_backpack_get_securities` — tokenized stocks with CUSIP and per-session
  min/max quantity + step size; optional `asset` filter (e.g. `AAPL.US`).
- `sap_backpack_get_market_sessions` — stock session hours.
- `sap_backpack_get_collateral` — haircut/IMF/MMF collateral parameters.
- `sap_backpack_get_borrow_lend_markets` — borrow/lend rates + utilization.

Account + trading (BUILDER tier; require local Backpack API credentials):

- `sap_backpack_get_balances` — instruction `balanceQuery`.
- `sap_backpack_get_open_orders` / `get_order_history` / `get_fills`.
- `sap_backpack_get_max_order_quantity` — preflight sizing.
- `sap_backpack_execute_order` — `side: 'Bid'|'Ask'`,
  `orderType: 'Market'|'Limit'`, `quantity`, optional `price`,
  optional `postOnly`.
- `sap_backpack_cancel_order` / `cancel_all_orders`.
- `sap_backpack_get_deposit_address`, `sap_backpack_request_withdrawal`
  (withdrawal requires explicit `confirm: true`).

## Routing

- Hosted accountless agents CAN use every `sap_backpack_*` tool. Market data
  needs no credentials. Signed tools need the user's Backpack API key stored in
  the LOCAL SAP MCP profile config — hosted servers never receive key material;
  a hosted call to a signed tool without credentials returns
  `backpack_credentials_required` with setup instructions.
- Backpack credentials are SEPARATE from the user's Solana wallet. The signed
  tools mutate Backpack CEFI account state, never on-chain Solana funds.
- Sponsored/Steve-OS agents with a configured local profile behave identically
  to x402 agents for these tools: reads are free for everyone.

## Critical Mechanics

- **Taker speed bump: 100 ms** on every non-`postOnly` order (spot + futures).
  Market and IOC orders are delayed by design; `postOnly` and cancels are not.
- **Signature behavior (live-verified 2026-09-14):** a corrupted signature gets
  `400 INVALID_CLIENT_REQUEST`; a VALID signature from an unregistered key gets
  `200` with an empty account — never interpret a 200-empty balance as proof
  the key is correct. Verify the key id against Backpack settings.
- Signing string: `instruction=<TYPE>&<params sorted alphabetically>&
  timestamp=<ms>&window=<ms>`; `X-Window` default 5000 (max 60000). If the
  header is omitted the signature must still use `window=5000`.
- `/klines` takes epoch SECONDS (not ms). `interval` is lowercase.
- Depth and trades use query parameters — path-style URLs 404.
- RFQ accept on stock markets is BINDING with deferred settlement: funds lock
  on accept; settlement follows at the quoted (or better) price. Monitor the
  position after acceptance; the RFQ cannot be cancelled once accepted.
- Response compaction: arrays cap at 50 entries, strings at 500 chars, total
  30k chars with `_truncated` markers. Large endpoints (`get_assets`,
  `get_securities`) are compacted server-side; use filters to target rows.

## Verification Checklist

After any signed write (order, cancel, withdrawal) verify the returned state:
re-read balances/orders via the matching read tool before reporting success.
An HTTP 200 from a signed endpoint means the request was accepted — confirm
the effect (e.g. open order present) before telling the user it succeeded.

## Canonical Sources

- API docs: https://docs.backpack.exchange (OpenAPI downloadable there)
- Support/technical docs: https://support.backpack.exchange
- Status: `sap_backpack_get_status` (or GET /api/v1/status)
- Full verified reference with live response examples: profile skill
  `backpack-exchange-api` → `references/api.md`.