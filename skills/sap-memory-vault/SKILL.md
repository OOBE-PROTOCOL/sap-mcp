# SAP Memory Vault

Use this skill for encrypted SAP memory vaults, vault sessions, memory
inscriptions, compact inscriptions, and vault/session reads.

## Tools

- `sap_init_vault`
- `sap_fetch_vault`
- `sap_open_vault_session`
- `sap_fetch_session`
- `sap_inscribe_memory`
- `sap_compact_inscribe_memory`
- `sap_fetch_epoch_page`

## Flow

1. Use `sap_fetch_vault` to check whether the agent already has a vault.
2. Use `sap_init_vault` only when a vault is missing and the user wants durable
   memory.
3. Use `sap_open_vault_session` before session inscriptions.
4. Use `sap_inscribe_memory` for normal entries and
   `sap_compact_inscribe_memory` for compact payloads.
5. Use `sap_fetch_epoch_page` for finalized pages.

## Safety

Do not store private keys, seed phrases, wallet bytes, API keys, or raw secrets
in SAP memory.
