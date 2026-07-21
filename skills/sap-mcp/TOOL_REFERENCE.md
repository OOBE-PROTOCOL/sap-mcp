# SAP MCP Tool Reference

This file maps every SAP MCP server tool to the most specific local skill.

## Granular SAP SDK Skills

Use these specific skills before falling back to the broader `sap-operations`
or `sap-agentkit` skills:

| Skill | Domain |
| --- | --- |
| `sap-agent-registry` | Agent identity, lifecycle, profile, global directory |
| `sap-discovery-indexing` | Network overview, protocol/capability/category indexes |
| `sap-tool-registry` | Tool descriptors, schemas, invocation reporting |
| `sap-reputation-attestation` | Feedback, reputation, attestations, FairScale |
| `sap-memory-vault` | Vaults, sessions, inscriptions, epoch pages |
| `sap-ledger-session` | Session continuity and latest durable reads |
| `sap-payments-x402` | x402 payment context, balances, subscriptions |
| `sap-escrow-settlement` | Escrow V2, settlement, pending settlement, disputes |
| `sap-staking` | SAP stake deposit, unstake, stake reads |
| `sap-solana-token` | SOL/SPL balances, transfers, token admin |
| `sap-defi` | Jupiter, perps, liquidity, orderbooks, bridges, staking protocols |
| `sap-market-data` | Pyth, CoinGecko, Jupiter token intelligence |
| `sap-nft-metaplex` | DAS, Metaplex, 3.Land NFT workflows |
| `sap-social-gaming` | Blinks, bounties, gaming |

## `sap-mcp`

Profile, config, runtime context, and raw transaction lifecycle:

`sap_profile_current`, `sap_profile_list`, `sap_profile_public_key`,
`sap_profile_switch`, `sap_decode_transaction`, `sap_preview_transaction`,
`sap_sign_transaction`, `sap_submit_signed_transaction`, `sap_skills_list`,
`sap_skills_bundle`, `sap_skills_install`.

## `sap-operations`

SAP registry and discovery:

`sap_protocol_invariants`, `sap_agent_identity_plan`, `sap_register_agent`, `sap_update_agent`, `sap_deactivate_agent`,
`sap_reactivate_agent`, `sap_close_agent`, `sap_get_agent`,
`sap_get_agent_profile`, `sap_get_agent_stats`, `sap_get_global_state`,
`sap_get_network_overview`, `sap_discover_agents`, `sap_list_agents`,
`sap_list_all_agents`, `sap_is_agent_active`, `sap_network_stats`,
`sap_fetch_capability_index`, `sap_fetch_protocol_index`,
`sap_find_tools_by_category`,
`sap_get_tool_category_summary`, `sap_fetch_tool_category_index`,
`sap_fetch_tool`, `sap_publish_tool_by_name`, `sap_update_tool`,
`sap_deactivate_tool`, `sap_reactivate_tool`,
`sap_report_tool_invocations`, `sap_report_calls`.

Use free exact/base reads before paid discovery when possible:
`sap_agent_context`, `sap_get_agent`, `sap_get_agent_profile`,
`sap_get_agent_stats`, `sap_is_agent_active`, `sap_get_global_state`, and
`sap_list_agents` with `limit <= 20`, `view: "compact"`, and
`includeProtocolIndexes: false`.
Use `sap_discover_agents` for targeted paid hosted search by `query`, `wallet`,
`agentPda`, `protocol`, `capability`, `capabilities`, or `hasX402Endpoint`.
Use paid `sap_list_all_agents` for user requests such as "give me a list of all
agents in the SAP ecosystem rn"; start with a small `limit` and continue with
`pagination.nextCursor`. If a capability lookup returns zero, retry with
`query` or `wallet` before reporting that the agent is absent.

Use `sap_agent_next_action` before retrying any SAP MCP error or partial write
result. It normalizes `payment_required`, `hosted_local_signer_required`,
transient Solana RPC failures, missing local bridge tools, and unconfirmed
submitted signatures into the next safe tool route.

Use `sap_protocol_invariants` before registry writes when the program id,
protocol treasury, source-level 0.1 SOL registration fee invariant, hosted
write route, or local signer route is unclear. Use `sap_agent_identity_plan`
before registration,
profile/image updates, Metaplex identity bridging, SNS linking, or x402
endpoint publishing. It is a free planner and should run before any local
signer write.

SAP memory and sessions:

`sap_init_vault`, `sap_fetch_vault`, `sap_open_vault_session`,
`sap_fetch_session`, `sap_inscribe_memory`, `sap_compact_inscribe_memory`,
`sap_fetch_epoch_page`, `sap_session_start`, `sap_session_read_latest`,
`sap_session_status`.

SAP reputation, feedback, attestations, and FairScale:

`sap_fetch_feedback`, `sap_give_feedback`, `sap_update_feedback`,
`sap_revoke_feedback`, `sap_fetch_attestation`, `sap_create_attestation`,
`sap_revoke_attestation`, `sap_update_reputation_metrics`,
`sap_fairscale_score`, `sap_fairscale_trust_gate`.

SAP payments, x402, subscriptions, Escrow V2, settlement, disputes, staking:

`sap_x402_prepare_payment`, `sap_x402_get_balance`,
`sap_create_subscription`, `sap_fund_subscription`,
`sap_cancel_subscription`, `sap_fetch_subscription`,
`sap_escrow_build_create_transaction`,
`sap_escrow_build_deposit_transaction`,
`sap_escrow_build_settle_transaction`,
`sap_escrow_build_finalize_transaction`,
`sap_escrow_build_withdraw_transaction`,
`sap_escrow_build_close_transaction`,
`sap_create_escrow_v2`, `sap_deposit_escrow_v2`,
`sap_settle_escrow_v2`, `sap_finalize_settlement_v2`,
`sap_file_dispute_v2`, `sap_withdraw_escrow_v2`, `sap_close_escrow_v2`,
`sap_fetch_escrow_v2`, `sap_fetch_pending_settlement`,
`sap_next_settlement_index`, `sap_fetch_dispute`, `sap_init_stake`,
`sap_deposit_stake`, `sap_request_unstake`, `sap_complete_unstake`,
`sap_fetch_stake`.

Use `sap_fetch_escrow` only for legacy read-only inspection. V1 escrow write
tools are not part of the active SAP MCP surface.

In hosted mode, prefer `sap_escrow_build_*_transaction` for Escrow V2 writes
and finalize the returned unsigned transaction locally with
`sap_payments_finalize_transaction`. Use direct `sap_create_escrow_v2`,
`sap_deposit_escrow_v2`, `sap_settle_escrow_v2`,
`sap_finalize_settlement_v2`, `sap_withdraw_escrow_v2`, and
`sap_close_escrow_v2` only when running a local SAP MCP profile with a signer.

## `sap-sns`

SAP SNS and direct SNS domain workflows:

`sap_sns_check_domain`, `sap_sns_batch_check_domains`,
`sap_sns_resolve_domain`, `sap_sns_validate_records`,
`sap_sns_get_domain_records`, `sap_sns_get_record`,
`sap_sns_resolve_wallet`, `sap_sns_check_ownership`,
`sap_sns_get_domain_pda`, `sap_sns_get_record_pda`,
`sap_sns_build_manage_record_transaction`,
`sap_sns_register_agent_domain`, `sns_registerDomain`, `sns_resolveDomain`,
`sns_reverseLookup`, `alldomains_getOwnedDomains`,
`alldomains_registerDomain`, `alldomains_resolveDomain`.

`sap_sns_register_agent_domain` is local-signer-only. Hosted accountless SAP MCP
rejects that direct write before x402 payment. For hosted record changes, use
`sap_sns_build_manage_record_transaction` and finalize the unsigned transaction
locally with `sap_payments_finalize_transaction`.

## `sap-agentkit`

Solana RPC, SPL token, pricing, DAS:

`sol_get_balance`, `spl-token_getBalance`, `spl-token_getTokenAccounts`,
`spl-token_transfer`, `spl-token_transferSol`, `spl-token_deployToken`,
`spl-token_mintTo`, `spl-token_burn`, `spl-token_closeAccount`,
`spl-token_freezeAccount`, `spl-token_thawAccount`, `spl-token_rugCheck`,
`coingecko_getTokenPrice`, `coingecko_getTokenInfo`,
`coingecko_getOHLCV`, `coingecko_getPoolsByToken`,
`coingecko_getTopGainersLosers`, `coingecko_getTrending`,
`pyth_getPrice`, `pyth_getPriceHistory`, `pyth_listPriceFeeds`,
`das_getAsset`, `das_getAssetsByOwner`, `das_getAssetsByCreator`,
`das_getAssetsByCollection`, `das_searchAssets`.

NFT and Metaplex workflows:

`3land_buyNFT`, `3land_cancelListing`, `3land_createCollection`,
`3land_listForSale`, `3land_mintAndList`,
`metaplex-nft_deployCollection`, `metaplex-nft_mintNFT`,
`metaplex-nft_updateMetadata`, `metaplex-nft_configureRoyalties`,
`metaplex-nft_setAndVerifyCollection`, `metaplex-nft_verifyCollection`,
`metaplex-nft_verifyCreator`, `metaplex-nft_delegateAuthority`,
`metaplex-nft_revokeAuthority`.

DeFi, markets, liquidity, bridges, staking:

Jupiter protocol toolkit:

`jupiter_getOrder`, `jupiter_executeOrder`, `jupiter_getHoldings`,
`jupiter_shield`, `jupiter_searchTokens`, `jupiter_getQuote`,
`jupiter_swap`, `jupiter_swapInstructions`, `jupiter_programLabels`,
`jupiter_getPrice`, `jupiter_getTokenList`, `jupiter_getTokenInfo`,
`jupiter_createLimitOrder`, `jupiter_executeTrigger`,
`jupiter_cancelLimitOrder`, `jupiter_cancelLimitOrders`,
`jupiter_getLimitOrders`, `jupiter_createDCA`, `jupiter_executeDCA`,
`jupiter_cancelDCA`, `jupiter_getDCAOrders`, `jupiter_smartSwap`.

`adrena_addCollateral`, `adrena_closePosition`, `adrena_getPositions`,
`adrena_openPosition`, `adrena_removeCollateral`,
`bridging_bridgeDeBridge`, `bridging_bridgeDeBridgeStatus`,
`bridging_bridgeWormhole`, `bridging_bridgeWormholeStatus`,
`drift_borrow`, `drift_closePerpPosition`, `drift_deposit`,
`drift_getPositions`, `drift_lend`, `drift_openPerpPosition`,
`drift_withdraw`, `jito_getBundleStatus`, `jito_getTipEstimate`,
`jito_sendBundle`, `lulo_deposit`, `lulo_getBestRates`,
`lulo_getPositions`, `lulo_withdraw`, `manifest_cancelOrder`,
`manifest_createMarket`, `manifest_getOrderbook`,
`manifest_placeLimitOrder`, `meteora_addDLMMLiquidity`,
`meteora_createAlphaVault`, `meteora_createDLMMPool`,
`meteora_createDynamicPool`, `meteora_removeDLMMLiquidity`,
`openbook_cancelOrder`, `openbook_createMarket`, `openbook_placeOrder`,
`orca_closePosition`, `orca_collectFees`, `orca_getWhirlpool`,
`orca_openPosition`, `orca_swap`, `pump_launchToken`, `pump_trade`,
`raydium-pools_addLiquidity`, `raydium-pools_createAMMv4`,
`raydium-pools_createCLMM`, `raydium-pools_createCPMM`,
`raydium-pools_removeLiquidity`, `staking_getStakeAccounts`,
`staking_stakeSOL`, `staking_unstakeSOL`, `staking_stakeJupSOL`,
`staking_unstakeJupSOL`, `staking_stakeSolayer`,
`staking_unstakeSolayer`.

Protocol routing shortcuts:

| User intent | Most specific tools |
| --- | --- |
| SOL or SPL balance | `sol_get_balance`, `spl-token_getBalance`, `spl-token_getTokenAccounts` |
| SOL or SPL transfer | `spl-token_transferSol`, `spl-token_transfer` |
| Token launch/mint/burn | `spl-token_deployToken`, `spl-token_mintTo`, `spl-token_burn` |
| Jupiter quote/swap | `jupiter_getQuote`, `jupiter_smartSwap`, `jupiter_swap`, `jupiter_swapInstructions` |
| Jupiter limit/DCA | `jupiter_createLimitOrder`, `jupiter_getLimitOrders`, `jupiter_createDCA`, `jupiter_getDCAOrders` |
| Perps/lending | `drift_*`, `adrena_*`, `lulo_*` |
| Liquidity pools | `raydium-pools_*`, `orca_*`, `meteora_*` |
| Orderbooks | `openbook_*`, `manifest_*` |
| Price data | `pyth_*`, `coingecko_*` |
| NFTs | `metaplex-nft_*`, `3land_*` |
| Domains | `sap_sns_*`, `sns_*`, `alldomains_*` |
| Bridges/staking/actions | `bridging_*`, `staking_*`, `jito_*`, `blinks_*` |

Social, Blinks, bounties, gaming:

`blinks_buildActionUrl`, `blinks_confirmAction`, `blinks_executeAction`,
`blinks_getAction`, `blinks_resolveBlinkUrl`, `blinks_validateActionsJson`,
`gibwork_createBounty`, `gibwork_listBounties`, `gibwork_submitWork`,
`send-arcade_listGames`, `send-arcade_playGame`.
