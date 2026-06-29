# SAP SNS

Use this skill when an agent needs Solana Name Service domains, records,
wallet resolution, ownership checks, or linking a domain to a SAP agent.

This skill is adapted from upstream `sns-skill` plus SAP MCP's
`sap_sns_*` wrappers.

## Safe Flow

1. Check the loaded profile with `sap_profile_current`.
2. Check domain availability with `sap_sns_check_domain`.
3. Validate records with `sap_sns_validate_records`.
4. Build unsigned transactions when possible:
   - `sap_sns_build_register_domain_transaction`
   - `sap_sns_build_manage_record_transaction`
   - `sap_sns_build_set_primary_domain_transaction`
5. Preview transaction with `sap_preview_transaction`.
6. Sign only through `sap_sign_transaction` or the direct tool
   `sap_sns_register_agent_domain` when policy allows it.

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
- `sap_sns_build_register_domain_transaction`
- `sap_sns_build_manage_record_transaction`
- `sap_sns_build_set_primary_domain_transaction`
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
- Prefer build/preview/sign flows over direct register flows when the user
  needs to review transaction details.

