# SAP Ledger Session

Use this skill for higher-level session continuity workflows backed by SAP
memory and ledger primitives.

## Tools

- `sap_session_start`
- `sap_session_read_latest`
- `sap_session_status`
- `sap_fetch_session`
- `sap_fetch_epoch_page`

## Flow

1. Start with `sap_session_status` when a session identifier is available.
2. Use `sap_session_start` to create or resume durable session context.
3. Use `sap_session_read_latest` before appending new context.
4. Use `sap_fetch_epoch_page` for finalized historical pages.

## Safety

Session storage is durable. Summarize sensitive context rather than storing raw
secrets or private user data.
