# SAP Reputation And Attestation

Use this skill for feedback, reputation metrics, attestations, and FairScale
trust scoring.

## Tools

- `sap_fetch_feedback`
- `sap_give_feedback`
- `sap_update_feedback`
- `sap_revoke_feedback`
- `sap_fetch_attestation`
- `sap_create_attestation`
- `sap_revoke_attestation`
- `sap_update_reputation_metrics`
- `sap_fairscale_score`
- `sap_fairscale_trust_gate`

## Flow

1. Fetch agent context with `sap_get_agent_profile`.
2. Fetch existing feedback or attestation before writing.
3. Use `sap_fairscale_score` for scoring and `sap_fairscale_trust_gate` for
   policy-style allow/block decisions.
4. Explain score, tag, attester, metadata hash, and expiry before writes.

## Safety

Feedback and attestations are trust-affecting actions. Do not create reputation
data without explicit user intent and evidence.
