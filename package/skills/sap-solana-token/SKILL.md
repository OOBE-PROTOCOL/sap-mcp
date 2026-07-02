# SAP Solana Token

Use this skill for SOL balances, SPL token balances, token accounts, transfers,
minting, burning, account close/freeze/thaw, and token security checks.

## Tools

- `sol_get_balance`
- `spl-token_getBalance`
- `spl-token_getTokenAccounts`
- `spl-token_transfer`
- `spl-token_transferSol`
- `spl-token_deployToken`
- `spl-token_mintTo`
- `spl-token_burn`
- `spl-token_closeAccount`
- `spl-token_freezeAccount`
- `spl-token_thawAccount`
- `spl-token_rugCheck`

## Flow

1. Read profile/network with `sap_profile_current`.
2. Read balances before transfers or mint/burn operations.
3. Use `spl-token_rugCheck` before interacting with unknown token mints.
4. Preview/sign transaction-producing outputs through SAP transaction tools
   when a serialized transaction is involved.

## Safety

Transfers, minting, burning, freezing, thawing, and account closing are
high-risk. Do not execute without explicit user intent.
