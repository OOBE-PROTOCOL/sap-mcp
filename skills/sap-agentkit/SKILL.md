# SAP AgentKit

Use this skill for Synapse AgentKit tools exposed through SAP MCP: Solana RPC,
SPL token, DAS, NFT, Metaplex, DeFi, market, staking, bridge, Blinks, bounty,
and gaming workflows.

This skill maps to upstream skill domains such as `sap-defi`, `sap-nft`,
`sap-metaplex`, `sap-gaming`, and `sap-social`.

## General Rules

- Read `sap_profile_current` before acting.
- Use read-only tools first.
- Treat swap, bridge, staking, liquidity, mint, transfer, market, and order
  tools as write/high-risk operations.
- For tools that produce or submit transactions, preview and policy-check
  before signing.
- Never inspect keypair files or ask the user for secret key bytes.

## Solana And Token

Use `sol_get_balance`, `spl-token_*`, `pyth_*`, `coingecko_*`, and `das_*`
tools for wallet, token, price, and asset context.

## NFT And Metaplex

Use `3land_*` and `metaplex-nft_*` tools for collection, minting, royalty,
authority, and verification flows.

## DeFi And Markets

Use `lulo_*`, `manifest_*`, `meteora_*`, `openbook_*`, `orca_*`,
`raydium-pools_*`, `pump_*`, `bridging_*`, `staking_*`, and `jito_*` tools for
DeFi execution when the tool is available in the current runtime and the
required signing route is explicit.

For perps, prefer SAP MCP analysis tools first: `sap_perp_trade_plan`,
`sap_perp_markets`, `sap_perp_position_info`, `sap_perp_liquidation_zones`,
`sap_perp_signal_score`, `sap_perp_risk_check`, and `sap_chart_*`. For execution,
use the hosted Adrena unsigned builders (`sap_adrena_build_*`) only when
`sap_perp_builder_status` reports the operation available, then finalize the
returned `transactionBase64` locally with `sap_payments_finalize_transaction`.
SAP MCP never signs user-owned Adrena transactions on the hosted server.

## Social, Blinks, Gaming

Use `blinks_*`, `gibwork_*`, and `send-arcade_*` tools when the task is about
actions, bounties, or games rather than direct SAP protocol operations.
