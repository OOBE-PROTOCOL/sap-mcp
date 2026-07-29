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

SAP MCP 0.9.55+ includes a full native Adrena integration: local unsigned
transaction builders for every Adrena operation plus a REST Data API client.
All builders use the vendored official Adrena IDL (release/39) via
`@coral-xyz/anchor` and produce unsigned base64 transactions for local
signing via `sap_payments_finalize_transaction`.

### Trading Builders

- `sap_adrena_build_open_long` — Open/increase a long perp position. Optional `stopLossPriceUsd` for policy compliance
- `sap_adrena_build_open_short` — Open/increase a short perp position. Optional `stopLossPriceUsd` for policy compliance
- `sap_adrena_build_position_package` — Open + set SL + set TP atomically in one transaction (1 payment, 1 signing, 1 submit). Preferred over separate open + SL + TP calls
- `sap_adrena_build_close_long` — Close a long perp position
- `sap_adrena_build_close_short` — Close a short perp position
- `sap_adrena_build_set_stop_loss` — Set stop loss on an existing position
- `sap_adrena_build_set_take_profit` — Set take profit on an existing position
- `sap_adrena_build_cancel_stop_loss` — Cancel stop loss
- `sap_adrena_build_cancel_take_profit` — Cancel take profit
- `sap_adrena_build_add_limit_order` — Place a limit order
- `sap_adrena_build_cancel_limit_order` — Cancel a limit order

### Advanced Builders

- `sap_adrena_build_trailing_stop` — Set a trailing stop loss that follows the oracle price. Reads the current oracle price and computes the stop at a specified percentage distance. For longs: SL below price. For shorts: SL above price. Call repeatedly to keep the stop trailing
- `sap_adrena_build_modify_position` — Add collateral to an existing position via openOrIncreasePosition. Optionally change leverage to adjust position risk

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
- `sap_adrena_get_position_status` — Live position P&L from Adrena Data API. If the Data API is unavailable, fall back to `sap_perp_position_info` which reads the on-chain Position account directly via Solana RPC

### Risk Engine

- `sap_perp_risk_check` — Pre-trade dynamic risk gate. Reads the trade journal to compute daily P&L, drawdown, and cooldown status. Returns a risk score (0-1) with PROCEED/WAIT/BLOCK recommendation. Call this before `sap_adrena_build_open_long` or `sap_adrena_build_open_short`
- `sap_perp_portfolio_risk` — Aggregate portfolio risk score from open positions. Returns total exposure, weighted leverage, diversification score, and SAFE/MODERATE/HIGH/CRITICAL recommendation

### Signal Engine

- `sap_perp_signal_score` — Aggregate technical signal score (0-1) from RSI, EMA, MACD, Bollinger Bands, price action, and on-chain funding rate. Returns LONG/SHORT/WAIT with confidence and reasons. Replaces 5-7 individual indicator calls with 1

### Market Intelligence

- `sap_perp_fear_greed` — Crypto Fear & Greed Index from alternative.me (free, no API key). Returns current value (0-100), classification, historical values, and risk_on/risk_off recommendation

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
6. Call `sap_perp_signal_score` to get an aggregate technical signal score
   (0-1) with LONG/SHORT/WAIT recommendation. This replaces 5-7 individual
   indicator calls with 1.
7. Call `sap_perp_risk_check` with market, side, collateral, and leverage
   to verify the trade passes dynamic risk gates (daily loss, drawdown,
   cooldown). Returns PROCEED/WAIT/BLOCK.
8. Call `sap_perp_trade_plan` with market, side, collateral amount, leverage,
   entry price (required, fetch from `sap_adrena_get_trading_prices` first),
   stop loss, take profit, max slippage, and max account-risk policy.
9. Call `sap_perp_builder_status` to confirm which Adrena operations are
   available. As of 0.9.55, all builder operations and Data API tools
   are available natively.

### Execution Flow (Adrena)

**Preferred: atomic batch (1 payment, 1 signing, 1 submit)**

1. Call `sap_adrena_build_position_package` with the owner wallet,
   principal token, collateral token, amount, leverage, side, and
   optional `stopLossPriceUsd` / `takeProfitPriceUsd`. This builds a
   single unsigned transaction with 3 atomic instructions:
   openOrIncreasePosition + setStopLoss + setTakeProfit.
2. Call `sap_payments_finalize_transaction` with `transactionBase64` and
   `submit: true` (after user confirmation) to sign and submit locally.
3. If the position opens but SL/TP instructions fail, the position is
   unprotected. The atomic batch prevents this: all 3 instructions land
   in the same transaction or none do.

**Alternative: separate calls (3 payments, 3 signings)**

1. Call `sap_adrena_build_open_long` (or short) with the owner wallet,
   principal token, collateral token, amount, leverage, and optional
   `stopLossPriceUsd` for policy compliance.
2. The builder returns `transactionBase64` — an unsigned Solana transaction
   constructed from the vendored Adrena IDL via `@coral-xyz/anchor`.
3. Call `sap_payments_finalize_transaction` with `transactionBase64` and
   `submit: true` (after user confirmation) to sign and submit locally.
4. After the position is confirmed on-chain, call `sap_adrena_build_set_stop_loss`
   and `sap_adrena_build_set_take_profit` separately.
5. SAP MCP never signs user-owned Adrena transactions. All signing is local.

### Policy: stop_loss_required

The SAP MCP policy engine has a `stopLossRequired` flag (default: false
as of 0.9.55). When enabled in the profile config, `sap_adrena_build_open_long`
and `sap_adrena_build_open_short` require `stopLossPriceUsd` to be set.
If omitted, the builder returns `PolicyViolation: stop_loss_required`.
Pass `stopLossPriceUsd` or use `sap_adrena_build_position_package` which
accepts it directly.

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
