# Steve Launch Tools

Use this skill for Steve-native token launches built directly against Meteora
DBC. These tools do not call PerpsPad. They return transactions for the user
or agent wallet to sign and never custody keys or broadcast autonomously.

## Canonical Flow

1. Call `sap_steve_launch_preview_dbc` with the quote mint and optional dev-buy
   amount. Render the returned curve economics verbatim.
2. Fetch a fresh mainnet blockhash immediately before building.
3. Call `sap_steve_launch_build_dbc`. The builder creates the DBC config and
   pool transactions, transfers pool creator authority to the escrow PDA, and
   initializes the immutable 70% agent / 30% OOBE fee split.
4. Sign and submit `bootstrapLaunch`, `transferPoolCreator`, and
   `initializeEscrow` in the returned order.
5. For the initial buy, prefer `sap_meteora_build_launchpad_trade`. The
   compatibility tool `sap_steve_launch_build_dbc_dev_buy` is DBC-only.

## Perpetual Strategy Metadata

`underlying`, `leverage`, and `direction` are an all-or-nothing policy triple.
They describe the Steve strategy to fund and execute after launch; they do not
delegate launch custody to PerpsPad. Omit all three for a pure bonding-curve
token.

The strategy vault must be activated by its registered wallet and funded
before an execution intent may reserve collateral. Phoenix remains the
execution venue, while Steve owns policy, accounting, and authorization.

## Compatibility

The old `sap_perpspad_launch_dbc`, `sap_perpspad_dbc_config_preview`, and
`sap_perpspad_build_dbc_dev_buy` names are deprecated aliases. Do not emit
them in new plans. The other `sap_perpspad_*` tools remain genuine PerpsPad
API adapters and are not aliases for Steve launches.

## Safety

- Never request, read, log, or persist a wallet secret.
- Never treat an unsigned builder response as a completed launch.
- Reject partial backing-policy triples and stale blockhashes.
- Preserve the returned transaction order and require wallet signatures.
- Do not claim that Steve controls Phoenix, Meteora, Jupiter, or PerpsPad.
