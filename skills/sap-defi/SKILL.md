# SAP DeFi

Use this skill for Jupiter swaps, DCA, limit orders, Drift, Adrena, Lulo,
Raydium, Orca, Meteora, OpenBook, Manifest, Pump.fun, Jito, bridges, and
staking protocols.

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

- `drift_*`
- `adrena_*`
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
2. For swaps, prefer `jupiter_getQuote` then `jupiter_smartSwap` or
   `jupiter_swapInstructions`.
3. Explain slippage, route, token mints, amount units, and expected output.
4. Preview and policy-check before signing.
5. For any unsigned or partially signed transaction returned by Jupiter, use
   `sap_preview_transaction`, `sap_sign_transaction`, and
   `sap_submit_signed_transaction`. Do not write ad-hoc signing scripts.

## Safety

DeFi execution can lose funds through slippage, MEV, wrong decimals, or bad
mints. Do not proceed from ticker symbols alone when mint addresses are needed.
Never read, print, export, or pass keypair bytes through shell commands,
environment variables, temporary scripts, screenshots, prompts, or MCP client
config. If a transaction cannot be decoded by SAP MCP transaction tools, stop
and report the unsupported transaction format instead of manually signing raw
message bytes.
