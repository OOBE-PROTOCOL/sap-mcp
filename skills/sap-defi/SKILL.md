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

For perps or leveraged trading tasks, start with hosted SAP analytics and
planning tools before any value-moving action:

1. Call `sap_perp_markets` to inspect supported markets, mark prices, funding,
   and open interest.
2. Call `sap_perp_position_info` when the user has an existing wallet position.
3. Call `sap_chart_ohlc`, `sap_chart_long_term`, or
   `sap_chart_volume_profile` for trend, timeframe, and liquidity context.
4. Call `sap_perp_liquidation_zones` to understand liquidation distance and
   crowded-risk areas.
5. Call `sap_perp_trade_plan` with market, side, collateral amount, leverage,
   entry price, stop loss, take profit, max slippage, and max account-risk
   policy.

`sap_perp_trade_plan` is analysis-only. It returns trader-grade risk flags,
liquidation estimate, reward/risk, and an execution checklist. `sap_perp_markets`
may return `dataAvailability.status="unavailable"` when the configured RPC does
not serve the required perps account indexes; treat that as missing data, not as
proof that markets do not exist. Do not create temporary signing scripts, do not
guess perps account graphs, and do not execute a perps transaction unless SAP MCP
exposes a typed unsigned builder or a local SAP payments/signing tool for that
exact action.

Direct Adrena signer tools may exist in some local AgentKit builds, but hosted
SAP MCP blocks them before x402 payment because the hosted server is
accountless. Do not route `adrena_openPosition`, `adrena_closePosition`, or
collateral-changing Adrena calls through `sap_payments_call_paid_tool`; there is
no payment challenge and no unsigned transaction to finalize.

## Safety

DeFi execution can lose funds through slippage, MEV, wrong decimals, or bad
mints. Do not proceed from ticker symbols alone when mint addresses are needed.
Never read, print, export, or pass keypair bytes through shell commands,
environment variables, temporary scripts, screenshots, prompts, or MCP client
config. If a transaction cannot be decoded by SAP MCP transaction tools, stop
and report the unsupported transaction format instead of manually signing raw
message bytes.
