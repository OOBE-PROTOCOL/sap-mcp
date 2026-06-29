# SAP Escrow Settlement

Use this skill for escrow v1/v2, deposits, settlement, batch settlement,
withdrawal, closing, pending settlements, and disputes.

## Tools

- `sap_create_escrow`
- `sap_deposit_escrow`
- `sap_settle_escrow`
- `sap_settle_escrow_batch`
- `sap_withdraw_escrow`
- `sap_close_escrow`
- `sap_fetch_escrow`
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

## Flow

1. Fetch escrow state before mutating it.
2. For v2 settlement, inspect pending settlement and dispute state.
3. Explain amount, depositor, agent PDA, nonce, settlement index, and dispute
   effect before write tools.

## Safety

Escrow tools can lock, move, or release funds. Use preview/signing policy and
explicit user approval for high-value actions.
