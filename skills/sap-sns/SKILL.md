# SAP SNS

Use this skill when an agent needs Solana Name Service domains, records,
wallet resolution, ownership checks, or linking a domain to a SAP agent.

Stage 1 (`.sns` namespace): SNS resolves `.sns`; legacy `.sol` resolution is
paused at the protocol level since slot 452,825,395. Display and resolve
everything as `.sns`.

This skill is adapted from upstream `sns-skill` plus SAP MCP's
`sap_sns_*` wrappers, now backed by the SNS JS SDK v4.

## Safe Flow

1. Check the loaded profile with `sap_profile_current`.
2. Check one domain availability for free with `sap_sns_check_domain`.
3. Validate records with `sap_sns_validate_records`.
4. Resolve wallet ownership with `sap_sns_resolve_wallet` and
   `sap_sns_check_ownership`.
5. Write paths (registration, record management, primary domain) return
   **unsigned instruction sets**: the caller signs and submits with its own
   wallet. SAP MCP never custodies keys — hosted accountless mode cannot sign
   or submit SNS writes.
6. After SNS ownership or records are ready, update the SAP agent metadata with
   `sap_payments_update_agent` so `metadataUri` references the `.sns` identity.

Hosted accountless SAP MCP cannot register or update a `.sns` domain directly
because those writes require user wallet authority. The write tools
(`sap_sns_register_agent_domain`, `sap_sns_build_manage_record_transaction`,
`sap_sns_build_set_primary_domain_transaction`) return unsigned instructions
ready for local signing; they never sign, submit, or charge signing authority.

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
- `sap_sns_build_set_primary_domain_transaction`
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
- `.sol` domain inputs are rejected by design (legacy `.sol` resolution is
  paused); pass `.sns` names (full or bare).
- Do not claim `sap_sns_build_register_domain_transaction` exists unless it is
  returned by `tools/list`.

## SAP Agent Identity Link

For "use my `.sns` as my SAP identity":

1. Resolve or check ownership with `sap_sns_resolve_wallet` and
   `sap_sns_check_ownership`.
2. If a record must change, build the unsigned instruction set with
   `sap_sns_build_manage_record_transaction` (value, or `null` to delete) and
   have the wallet owner sign and submit it locally.
3. Update the agent metadata JSON to include:
   `{ "sns": { "domain": "name.sns" } }`.
4. Call local `sap_payments_update_agent` with the public `metadataUri` and
   `confirm: true`.
