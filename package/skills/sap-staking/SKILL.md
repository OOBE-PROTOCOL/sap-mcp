# SAP Staking

Use this skill for SAP stake initialization, deposits, unstake requests,
complete unstake flows, and stake reads.

## Tools

- `sap_init_stake`
- `sap_deposit_stake`
- `sap_request_unstake`
- `sap_complete_unstake`
- `sap_fetch_stake`

## Flow

1. Read `sap_fetch_stake` before write operations.
2. Use `sap_init_stake` only when no stake account exists.
3. Explain lockup, amount, and unstake timing before deposits or unstake
   requests.

## Safety

Stake operations affect capital and trust guarantees. Respect local policy and
ask for explicit approval when thresholds require it.
