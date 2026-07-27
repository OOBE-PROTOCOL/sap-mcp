# SAP DeFi

Use this skill for Jupiter swaps, DCA, limit orders, perps planning, chart
analysis, Lulo, Raydium, Orca, Meteora, OpenBook, Manifest, Pump.fun, Jito,
bridges, and staking protocols.

## Jupiter

- `jupiter_getQuote`
- `jupiter_smartSwap`
- `jupiter_swap`
- `jupiter_swapInstructions`
- `jupiter_getOrder`
- `jupiter_executeOrder`
- `jupiter_createLimitOrder`
- `jupiter_executeTrigger`
- `jupiter_cancelLimitOrder`
- `jupiter_cancelLimitOrders`
- `jupiter_getLimitOrders`
- `jupiter_createDCA`
- `jupiter_executeDCA`
- `jupiter_cancelDCA`
- `jupiter_getDCAOrders`

## Protocol Tools

- `sap_perp_trade_plan`
- `sap_perp_markets`
- `sap_perp_position_info`
- `sap_perp_funding_history`
- `sap_perp_liquidation_zones`
- `sap_perp_builder_status`
- `sap_chart_ohlc`
- `sap_chart_long_term`
- `sap_chart_volume_profile`
- `lulo_*`
- `raydium-pools_*`
- `orca_*`
- `meteora_*`
- `openbook_*`
- `manifest_*`
- `pump_*`
- `jito_*`
- `bridging_*`
- `staking_*`

## Adrena Perps Protocol (32 tools)

SAP MCP 0.9.38+ includes a full native Adrena integration: local unsigned
transaction builders for every Adrena operation plus a REST Data API client.
All builders use the vendored official Adrena IDL (release/39) via
`@coral-xyz/anchor` and produce unsigned base64 transactions for local
signing via `sap_payments_finalize_transaction`.

### Trading Builders

- `sap_adrena_build_open_long` — Open/increase a long perp position
- `sap_adrena_build_open_short` — Open/increase a short perp position
- `sap_adrena_build_close_long` — Close a long perp position
- `sap_adrena_build_close_short` — Close a short perp position
- `sap_adrena_build_set_stop_loss` — Set stop loss on a position
- `sap_adrena_build_set_take_profit` — Set take profit on a position
- `sap_adrena_build_cancel_stop_loss` — Cancel stop loss
- `sap_adrena_build_cancel_take_profit` — Cancel take profit
- `sap_adrena_build_add_limit_order` — Place a limit order
- `sap_adrena_build_cancel_limit_order` — Cancel a limit order

### Commodity Builders (synthetic perps: XAU, XAG, WTI)

- `sap_adrena_build_open_commodity_long`
- `sap_adrena_build_open_commodity_short`
- `sap_adrena_build_close_commodity_long`
- `sap_adrena_build_close_commodity_short`

### Liquidity & Swap

- `sap_adrena_build_add_liquidity` — Add liquidity to a pool
- `sap_adrena_build_remove_liquidity` — Remove liquidity from a pool
- `sap_adrena_build_swap` — Swap tokens through a pool

### Staking

- `sap_adrena_build_init_user_staking` — Initialize user staking account
- `sap_adrena_build_add_liquid_stake` — Add liquid stake
- `sap_adrena_build_remove_liquid_stake` — Remove liquid stake
- `sap_adrena_build_add_locked_stake` — Add locked stake
- `sap_adrena_build_claim_stakes` — Claim staking rewards

### Data API (market data from datapi.adrena.trade)

- `sap_adrena_get_positions` — Position history for a wallet
- `sap_adrena_get_pool_info` — Latest pool statistics
- `sap_adrena_get_custody_info` — Per-asset custody statistics
- `sap_adrena_get_trader_info` — Trader performance metrics
- `sap_adrena_get_trader_leaderboard` — Trader leaderboard
- `sap_adrena_get_mutagen` — Mutagen points for a wallet
- `sap_adrena_get_mutagen_leaderboard` — Mutagen leaderboard
- `sap_adrena_get_prices` — ADX and ALP token prices
- `sap_adrena_get_trading_prices` — Latest oracle prices for all assets
- `sap_adrena_get_position_status` — Live position P&L

## Flow

1. Use quote/read tools first.
2. In hosted mode, prefer quote/read tools and unsigned builders such as
   `jupiter_getOrder`, `jupiter_swapInstructions`, or supported private swap
   builders. Direct signer tools such as `jupiter_swap`, `jupiter_smartSwap`,
   and `jupiter_executeOrder` require a local SAP MCP profile or external
   signer and are rejected before x402 payment on hosted accountless servers.
3. Explain slippage, route, token mints, amount units, and expected output.
4. Preview and policy-check before signing.
5. For any unsigned or partially signed transaction returned by hosted SAP MCP,
   use `sap_payments_finalize_transaction`. For local SAP MCP stdio builders,
   use `sap_preview_transaction`, `sap_sign_transaction`, and
   `sap_submit_signed_transaction`. Do not write ad-hoc signing scripts.

## Professional Perps Flow

For perps or leveraged trading tasks, start with Adrena market data and
planning tools before any value-moving action:

1. Call `sap_adrena_get_pool_info` or `sap_perp_markets` to inspect Adrena
   markets: supported custody, pool, oracle labels, funding state, leverage
   caps, open interest, and cumulative volume.
2. Call `sap_adrena_get_trading_prices` for live oracle prices across all
   traded assets (JITOSOL, WBTC, BONK, XAU, XAG, WTI).
3. Call `sap_adrena_get_positions` or `sap_perp_position_info` when the user
   has an existing wallet position.
4. Call `sap_chart_ohlc`, `sap_chart_long_term`, or
   `sap_chart_volume_profile` for trend, timeframe, and liquidity context.
5. Call `sap_perp_liquidation_zones` to understand liquidation distance.
6. Call `sap_perp_trade_plan` with market, side, collateral amount, leverage,
   entry price, stop loss, take profit, max slippage, and max account-risk
   policy.
7. Call `sap_perp_builder_status` to confirm which Adrena operations are
   available. As of 0.9.38, all 22 builder operations and 10 Data API tools
   are available natively.

### Execution Flow (Adrena)

1. Call `sap_adrena_build_open_long` (or short) with the owner wallet,
   principal token, collateral token, amount, and leverage.
2. The builder returns `transactionBase64` — an unsigned Solana transaction
   constructed from the vendored Adrena IDL via `@coral-xyz/anchor`.
3. Call `sap_payments_finalize_transaction` with `transactionBase64` and
   `submit: true` (after user confirmation) to sign and submit locally.
4. SAP MCP never signs user-owned Adrena transactions. All signing is local.

### Collateral Rules

- **Longs**: collateral token must match principal token (e.g. a JITOSOL
  long requires JITOSOL collateral).
- **Shorts**: collateral must be USDC.
- **Commodities** (XAU, XAG, WTI): collateral is always USDC.

### Supported Assets

| Pool | Assets | Collateral |
|------|--------|------------|
| main-pool | JITOSOL, WBTC, BONK | USDC, JITOSOL, WBTC, BONK |
| commodities-pool | XAU (Gold), XAG (Silver), WTI (Crude Oil) | USDC |

## Safety

DeFi execution can lose funds through slippage, MEV, wrong decimals, or bad
mints. Do not proceed from ticker symbols alone when mint addresses are needed.
Never read, print, export, or pass keypair bytes through shell commands,
environment variables, temporary scripts, screenshots, prompts, or MCP client
config. If a transaction cannot be decoded by SAP MCP transaction tools, stop
and report the unsupported transaction format instead of manually signing raw
message bytes.
