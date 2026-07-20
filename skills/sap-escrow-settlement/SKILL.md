# SAP Escrow Settlement

Use this skill for active Escrow V2 deposits, settlement, withdrawal,
closing, pending settlements, and disputes. V1 escrow write flows are no
longer active on the current SAP on-chain program and must not be used for
new work.

## Tools

Hosted unsigned builders:

- `sap_escrow_build_create_transaction`
- `sap_escrow_build_deposit_transaction`
- `sap_escrow_build_settle_transaction`
- `sap_escrow_build_finalize_transaction`
- `sap_escrow_build_withdraw_transaction`
- `sap_escrow_build_close_transaction`

Local-signer direct writes:

- `sap_create_escrow_v2`
- `sap_deposit_escrow_v2`
- `sap_settle_escrow_v2`
- `sap_finalize_settlement_v2`
- `sap_file_dispute_v2`
- `sap_withdraw_escrow_v2`
- `sap_close_escrow_v2`
- `sap_fetch_escrow_v2`
- `sap_fetch_pending_settlement`
- `sap_next_settlement_index`
- `sap_fetch_dispute`
- `sap_fetch_escrow`

`sap_fetch_escrow` is retained only for legacy read-only inspection. Do not
recommend V1 create, deposit, settle, withdraw, close, or batch-settle flows.

## Flow

1. Fetch V2 escrow state before mutating it.
2. In hosted SAP MCP, never call direct escrow write tools after
   `hosted_local_signer_required`. Use the matching
   `sap_escrow_build_*_transaction` tool, then finalize the unsigned
   transaction locally with `sap_payments_finalize_transaction`.
3. In local SAP MCP stdio mode, direct write tools can sign through the active
   local SAP profile. Do not read keypair JSON or create temporary signing
   scripts.
4. For V2 settlement, inspect pending settlement and dispute state.
5. Explain amount, depositor, agent PDA, nonce, settlement index, and dispute
   effect before write tools.
6. Treat `settlementSecurity = 2` / DisputeWindow as the safe default.
   Use `settlementSecurity = 1` / CoSigned only when a valid `coSigner` is
   provided. Never default to SelfReport / `0`.
7. Amounts are always in the smallest unit of the escrow token: lamports for
   SOL, micro-USDC for USDC.

## Safety

Escrow tools can lock, move, or release funds. Use preview/signing policy and
explicit user approval for high-value actions.
