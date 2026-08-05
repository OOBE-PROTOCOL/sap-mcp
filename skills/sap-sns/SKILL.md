# SAP SNS

Use this skill when an agent needs Solana Name Service domains, records,
wallet resolution, ownership checks, or linking a domain to a SAP agent.

This skill is adapted from upstream `sns-skill` plus SAP MCP's
`sap_sns_*` wrappers.

## Safe Flow

1. Check the loaded profile with `sap_profile_current`.
2. Check one domain availability for free with `sap_sns_check_domain`.
3. Validate records with `sap_sns_validate_records`.
4. Resolve wallet ownership with `sap_sns_resolve_wallet` and
   `sap_sns_check_ownership`.
5. Treat SNS record writes and direct SNS registrations as temporarily
   unavailable through SAP MCP until a current SNS SDK path is migrated and
   covered by end-to-end tests.
6. After SNS ownership or records are ready, update the SAP agent metadata with
   `sap_payments_update_agent` so `metadataUri` references the `.sol` identity.

Hosted accountless SAP MCP cannot register or update a .sol domain directly
because those writes require user wallet authority. Current SAP MCP builds keep
read/discovery tools available without the historical Bonfida npm package, but
`sap_sns_register_agent_domain` and `sap_sns_build_manage_record_transaction`
fail fast before payment or signing. Do not retry those write tools unless
`tools/list` and release notes explicitly say SNS writes are enabled again.

## Tools

- `sap_sns_check_domain`
- `sap_sns_batch_check_domains`
- `sap_sns_resolve_domain`
- `sap_sns_validate_records`
- `sap_sns_get_domain_records`
- `sap_sns_get_record`
- `sap_sns_resolve_wallet`
- `sap_sns_check_ownership`
- `sap_sns_get_domain_pda`
- `sap_sns_get_record_pda`
- `sap_sns_build_manage_record_transaction`
- `sap_sns_register_agent_domain`
- `sns_registerDomain`
- `sns_resolveDomain`
- `sns_reverseLookup`
- `alldomains_getOwnedDomains`
- `alldomains_registerDomain`
- `alldomains_resolveDomain`

## Guardrails

- Never assume mainnet/devnet; read the profile RPC first.
- Never read the local wallet file.
- `sap_sns_check_ownership` canonical field is `owner`; `wallet` is accepted as
  an alias for agent ergonomics.
- Prefer build/preview/sign flows over direct register flows when the user
  needs to review transaction details.
- Do not claim `sap_sns_build_register_domain_transaction` exists unless it is
  returned by `tools/list`.
- Do not route SNS write attempts through x402; current SAP MCP intentionally
  rejects SNS write paths before payment.

## SAP Agent Identity Link

For “use my .sol as my SAP identity”:

1. Resolve or check ownership with `sap_sns_resolve_wallet` and
   `sap_sns_check_ownership`.
2. If a record must change, tell the user SNS writes are currently unavailable
   through SAP MCP and avoid charging x402 for retries.
3. Update the agent metadata JSON to include:
   `{ "sns": { "domain": "name.sol" } }`.
4. Call local `sap_payments_update_agent` with the public `metadataUri` and
   `confirm: true`.
