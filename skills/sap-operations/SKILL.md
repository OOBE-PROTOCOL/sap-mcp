# SAP Operations

Use this skill for SAP Protocol registry, agent lifecycle, memory, reputation,
x402 payments, escrow, settlement, disputes, staking, and tool publishing.

This skill corresponds to upstream SAP SDK v1.0.x domains such as
`sap-overview`, `sap-client`, `sap-advanced`, `sap-memory`,
`sap-merchant`, and `sap-enterprise`.

## Operating Pattern

1. Inspect `sap_profile_current`.
2. Use read tools before write tools.
3. For write operations, explain the on-chain action and expected cost.
4. For transactions or direct signing, preview first with `sap_preview_transaction`.
5. Never read keypair files.

## Agent Registry

Use:

- `sap_protocol_invariants`
- `sap_agent_identity_plan`
- `sap_register_agent`
- `sap_update_agent`
- `sap_deactivate_agent`
- `sap_reactivate_agent`
- `sap_close_agent`
- `sap_get_agent`
- `sap_get_agent_profile`
- `sap_discover_agents`
- `sap_list_agents`
- `sap_list_all_agents`

Use `sap_discover_agents` for targeted hosted directory reads by `query`,
`wallet`, `agentPda`, `protocol`, `capability`, `capabilities`, or
`hasX402Endpoint`. Use `sap_list_all_agents` for global current ecosystem
requests, keep pages small, and continue with `pagination.nextCursor`.

Before registering or updating an agent profile, call free
`sap_protocol_invariants` when treasury, registration fee, hosted write route,
or local signer route is unclear. Then call `sap_agent_identity_plan`. The
planner tells the agent which fields are missing, whether the action should use
hosted reads or local signing, whether Metaplex or SNS identity is involved,
and how to verify the write afterward.

Hosted accountless SAP MCP cannot sign wallet-owned registry writes. If hosted
`sap_register_agent` or `sap_update_agent` returns
`hosted_local_signer_required`, do not retry the hosted write. Use local
`sap_payments_register_agent` or `sap_payments_update_agent` with
`confirm: true`. After registration, verify `success`, `agentPda`,
`confirmationStatus`, and `protocolFee.status`; after update, fetch the agent
profile again and compare the changed fields.

## Memory

Use:

- `sap_init_vault`
- `sap_fetch_vault`
- `sap_open_vault_session`
- `sap_fetch_session`
- `sap_inscribe_memory`
- `sap_compact_inscribe_memory`
- `sap_session_start`
- `sap_session_read_latest`
- `sap_session_status`

## Reputation And Attestations

Use:

- `sap_fetch_feedback`
- `sap_give_feedback`
- `sap_update_feedback`
- `sap_revoke_feedback`
- `sap_fetch_attestation`
- `sap_create_attestation`
- `sap_revoke_attestation`
- `sap_update_reputation_metrics`
- `sap_fairscale_score`
- `sap_fairscale_trust_gate`

## Payments, Escrow, Settlement

Use:

- `sap_x402_prepare_payment`
- `sap_x402_get_balance`
- `sap_create_subscription`
- `sap_fund_subscription`
- `sap_cancel_subscription`
- `sap_create_escrow_v2`
- `sap_deposit_escrow_v2`
- `sap_settle_escrow_v2`
- `sap_finalize_settlement_v2`
- `sap_file_dispute_v2`
- `sap_withdraw_escrow_v2`
- `sap_close_escrow_v2`

Escrow writes are V2-only. Default `settlementSecurity` is DisputeWindow (`2`);
CoSigned (`1`) requires `coSigner`; SelfReport (`0`) is not a valid default.
Escrow amounts are smallest token units: lamports for SOL and micro-USDC for
USDC.

## Staking

Use:

- `sap_init_stake`
- `sap_deposit_stake`
- `sap_request_unstake`
- `sap_complete_unstake`
- `sap_fetch_stake`
