# Backpack Exchange Tools

Use this skill for `sap_backpack_*` tools: Backpack Exchange CeFi market data,
collateral, securities, borrow/lend, and (with API credentials) account and
trading operations over the Backpack REST API.

## First Steps

1. All market-data tools are FREE — call directly, no x402 challenge. Signed
   account/trading tools are BUILDER tier.
2. Symbols are `BASE_QUOTE` spot (`SOL_USDC`) and `BASE_QUOTE_PERP` perps
   (`SOL_USDC_PERP`). Stock RFQ markets use `<SEC>_USDC_RFQ` (e.g.
   `AAPL.US_USDC_RFQ`); stock spot books appear in /markets with
   `rwaMarketType: "STOCK"`.
3. For stock trading check the session first:
   `sap_backpack_get_market_sessions` (US_EQUITIES_PRE_MARKET / REGULAR /
   POST_MARKET / OVERNIGHT, timezone America/New_York).
4. Signed tools need a Backpack API key in the local SAP MCP profile config
   (`config.backpack.apiKeys`); without credentials they return the
   structured `backpack_credentials_required` error.

## Tools — full parameter reference

### sap_backpack_get_markets (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| marketType | enum | no | `SPOT` or `PERP` filter |

Returns 189+ markets: symbol, base/quote symbols, tickSize, stepSize,
filters, rwaMarketType (STOCK for tokenized-stock order books).

### sap_backpack_get_market (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| symbol | string | yes | exact market symbol, e.g. `SOL_USDC` |

Resolved client-side by filtering the full markets list — the upstream
`/markets/{symbol}` path is a 404 trap and is never called.

### sap_backpack_get_ticker (FREE)
| Param | Type | Required |
|---|---|---|
| symbol | string | yes |

Returns 24h snapshot: `firstPrice`, `lastPrice`, `high`, `low`,
`priceChange`, `priceChangePercent`, `volume`, `quoteVolume`, `trades`.
NOTE: the live ticker has NO bid/ask fields.

### sap_backpack_get_tickers (FREE)
No parameters. Returns 24h tickers for every market (including stock perps
like `SPY.US_USDC_PERP`).

### sap_backpack_get_depth (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| symbol | string | yes | e.g. `SOL_USDC` |
| limit | number | no | levels per side (tool default 20; upstream default 1000, max 5000) |

Returns `asks`/`bids` as `[price, quantity]` string pairs.

### sap_backpack_get_trades (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| symbol | string | yes | |
| limit | number | no | max trades (default 50) |

Trade objects: `{id, isBuyerMaker, price, quantity, quoteQuantity,
timestamp (epoch ms)}`.

### sap_backpack_get_klines (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| symbol | string | yes | |
| interval | enum | yes | `1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M` (case-sensitive: `1M` = monthly) |
| startTime | string/number | yes | ISO-8601 or epoch (converted to epoch SECONDS upstream) |
| endTime | string/number | yes | same |

Returns `[{open, high, low, close, volume, quoteVolume, trades, start, end}]`.

### sap_backpack_get_mark_price (FREE)
| Param | Type | Required |
|---|---|---|
| symbol | string (PERP symbol) | yes |

Returns `markPrice`, `indexPrice`, `fundingRate`, `nextFundingTimestamp`.

### sap_backpack_get_funding_rates (FREE)
| Param | Type | Required |
|---|---|---|
| symbol | string (PERP) | yes |

### sap_backpack_get_open_interest (FREE)
| Param | Type | Required |
|---|---|---|
| symbol | string (PERP) | yes |

Returns open interest in contracts with timestamp.

### sap_backpack_get_collateral (FREE)
No parameters. Returns per-asset haircut/IMF/MMF functions (`sqrt` /
`inverseSqrt` curves) and weights.

### sap_backpack_get_assets (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| symbol | string | no | filter to one asset (the raw response is ~2.1MB — always filter when possible) |

Returns per asset: tokens with `blockchain`, `contractAddress`,
`depositEnabled`, `withdrawEnabled`, `minimumDeposit`, `minimumWithdrawal`,
`nativeDecimals`, `withdrawalFee`.

### sap_backpack_get_securities (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| asset | string | no | prefix filter, e.g. `AAPL.US` (raw response ~500KB) |

Returns per security: `cusip`, `name`, and per-session
`{name, maxQuantity, minQuantity, stepSize}` (sessions:
US_EQUITIES_PRE_MARKET / REGULAR / POST_MARKET / OVERNIGHT).

### sap_backpack_get_market_sessions (FREE)
No parameters. Session hours in `America/New_York` (pre 4:00-9:30, regular
9:30-16:00, post 16:00-20:00, overnight 20:00-04:00 ET).

### sap_backpack_get_borrow_lend_markets (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| symbol | string | no | filter to one asset (bare symbol like `SOL`, `BTC`) |

Returns `assetMarkPrice`, `borrowInterestRate`, `lendInterestRate`,
`utilization`, `optimalUtilization` (0.7), `fee` (0.15), `state`.

### sap_backpack_get_status (FREE)
No parameters. Returns system status.

## Signed tools (BUILDER tier — require local Backpack API credentials)

Credentials live in the LOCAL SAP MCP profile config
(`config.backpack.apiKeys`); hosted servers never receive key material and a
hosted call without credentials returns `backpack_credentials_required` with
setup instructions. Signed tools mutate Backpack CEFI account state, never
on-chain Solana funds.

| Tool | instruction | Key params |
|---|---|---|
| `sap_backpack_get_balances` | balanceQuery | — |
| `sap_backpack_get_open_orders` | orderQueryAll | symbol? |
| `sap_backpack_get_order_history` | orderHistoryQueryAll | symbol?, limit? |
| `sap_backpack_get_fills` | fillHistoryQueryAll | symbol?, limit? |
| `sap_backpack_get_max_order_quantity` | maxOrderQuantity | symbol, side (Bid/Ask), price?, leverage? |
| `sap_backpack_execute_order` | orderExecute | symbol, side, orderType (Market/Limit), quantity, price?, postOnly?, clientOrderId? |
| `sap_backpack_cancel_order` | orderCancel | symbol, orderId |
| `sap_backpack_cancel_all_orders` | orderCancelAll | symbol? |
| `sap_backpack_get_deposit_address` | depositAddressQuery | asset |
| `sap_backpack_request_withdrawal` | withdraw | asset/address(blockchain)/quantity — requires explicit `confirm: true` |

## Critical Mechanics

- **Taker speed bump: 100 ms** on every non-`postOnly` order (spot + futures).
  Market and IOC orders are delayed by design; `postOnly` and cancels are not.
- **Signature behavior (live-verified 2026-09-14):** a corrupted signature
  gets `400 INVALID_CLIENT_REQUEST`; a VALID signature from an unregistered
  key gets `200` with an empty account — never interpret a 200-empty balance
  as proof the key is correct. Verify the key id against Backpack settings.
- Signing string: `instruction=<TYPE>&<params sorted alphabetically>&
  timestamp=<ms>&window=<ms>`; `X-Window` default 5000 (max 60000). If the
  header is omitted the signature must still use `window=5000`.
- `/klines` takes epoch SECONDS (not ms); `interval` lowercase except `1M`.
- Depth and trades use query parameters — path-style URLs 404.
- RFQ accept on stock markets is BINDING with deferred settlement: funds lock
  on accept; settlement follows at the quoted (or better) price. Monitor the
  position after acceptance; the RFQ cannot be cancelled once accepted.
- Stock RFQ: `quoteQuantity` is NOT supported for stock RFQs (use quantity).
- Response compaction caps arrays at 50 entries, strings at 500 chars, total
  30k chars with `_truncated` markers.

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