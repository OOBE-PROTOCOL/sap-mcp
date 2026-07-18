# SAP SNS

Use this skill when an agent needs Solana Name Service domains, records,
wallet resolution, ownership checks, or linking a domain to a SAP agent.

This skill is adapted from upstream `sns-skill` plus SAP MCP's
`sap_sns_*` wrappers.

## Safe Flow

1. Check the loaded profile with `sap_profile_current`.
2. Check one domain availability for free with `sap_sns_check_domain`.
3. Validate records with `sap_sns_validate_records`.
4. For hosted record updates, build an unsigned transaction with
   `sap_sns_build_manage_record_transaction`.
5. Preview and finalize hosted builder transactions locally with
   `sap_payments_finalize_transaction`.
6. Register domains directly only from a local SAP MCP profile using
   `sap_sns_register_agent_domain` after explicit user confirmation.

Hosted accountless SAP MCP cannot register a .sol domain directly because the
purchase requires the user wallet signature. If a hosted direct registration is
rejected with `hosted_local_signer_required`, no x402 payment was charged; switch
to the local profile flow instead of retrying the hosted write.

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
- Prefer build/preview/sign flows over direct register flows when the user
  needs to review transaction details.
- Do not claim `sap_sns_build_register_domain_transaction` exists unless it is
  returned by `tools/list`.
- Do not route hosted direct registration through x402; hosted accountless
  servers reject local-signer writes before payment.
