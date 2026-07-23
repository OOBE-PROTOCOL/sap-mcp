# SAP Agent Registry

Use this skill for SAP agent identity, registration, profile updates, activation
state, global directory listing, and agent profile inspection.

## First Steps

1. Call `sap_profile_current`.
2. Call `sap_protocol_invariants` before registry writes when treasury, fee,
   hosted/local routing, or lifecycle-complete rules are unclear.
3. For registration, profile-image updates, Metaplex identity, SNS linking, or
   full identity setup, call `sap_agent_identity_plan` before any write. It is
   free and returns normalized fields, local-signer routing, metadata contract,
   forbidden actions, and verification checklist.
4. Use free exact/base reads before paid discovery: `sap_agent_context`,
   `sap_get_agent`,
   `sap_get_agent_profile`, `sap_get_agent_stats`, `sap_is_agent_active`,
   `sap_get_global_state`, and `sap_list_agents` with `limit <= 20`,
   `view: "compact"`, and `includeProtocolIndexes: false`.
5. Call `sap_get_network_overview` for ecosystem counters when needed.
6. Use `sap_discover_agents` with `query`, `wallet`, `protocol`, or
   `capability` for targeted paid hosted directory reads when free exact/base
   reads are not enough.
7. Use `sap_list_all_agents` for global current agent lists and follow
   `pagination.nextCursor` for additional pages.

## Tools

- `sap_register_agent`
- `sap_protocol_invariants`
- `sap_agent_identity_plan`
- `sap_agent_context`
- `sap_agent_next_action`
- `sap_update_agent`
- `sap_deactivate_agent`
- `sap_reactivate_agent`
- `sap_close_agent`
- `sap_get_agent`
- `sap_get_agent_profile`
- `sap_get_agent_stats`
- `sap_get_global_state`
- `sap_get_network_overview`
- `sap_list_agents`
- `sap_list_all_agents`
- `sap_is_agent_active`
- `sap_report_calls`
- `sap_update_reputation_metrics`

## Routing

- Hosted accountless SAP MCP cannot sign user-owned registry writes. If
  `sap_register_agent`, `sap_update_agent`, or another registry write returns
  `hosted_local_signer_required`, no x402 payment was charged. For agent
  registration, call the local `sap_payments.sap_payments_register_agent`
  bridge with the same fields and `confirm: true`; it signs locally with the
  active SAP MCP profile. For agent profile, image, metadata, capability,
  protocol, pricing, or x402 endpoint updates, call local
  `sap_payments.sap_payments_update_agent` with the same update fields and
  `confirm: true`. For other registry writes, run the write on the local SAP
  MCP profile or use a production unsigned builder/finalizer flow when
  available.
- Before any retry after `payment_required`, `hosted_local_signer_required`,
  `BlockhashNotFound`, timeout, missing `sap_payments`, or a submitted
  signature that did not confirm, call `sap_agent_next_action`. Follow its
  `safeToRetryNow`, `nextTool`, and `forbiddenActions` fields.
- Agent pictures must be public metadata, not desktop file paths. Upload the
  image or metadata JSON to IPFS, Arweave, Kommodo, or HTTPS, then set
  `agentUri`/`metadataUri` with `sap_payments_update_agent`.
- After `sap_payments_register_agent`, do not stop at a Solscan link. Verify
  `success`, `agentRegistered`, `agentPda`, `confirmationStatus`,
  `protocolComplete`, and `protocolFee.status`. A complete registration should
  show the expected protocol fee credited to treasury
  `J7PyZAGKvprCz4SQ5DKBLAHstJxgVqZcz6kguUoWpP7P`. If `success` is false but
  `agentRegistered` is true, the account may exist but SAP registration is not
  protocol-complete. Report the integrity issue and do not retry automatically.
- After `sap_payments_update_agent`, fetch the agent profile again and verify
  the changed fields. For image/profile updates, `agentUri` or `metadataUri`
  must resolve to public metadata containing the image URL.
- If `sap_payments_update_agent` returns Anchor 3012, `AccountNotInitialized`,
  or mentions `pricing_menu`, do not run runtime repair and do not retry the
  same write. This means the write reached the SAP on-chain program but a
  required registry lifecycle PDA is missing or stale. Call
  `sap_agent_next_action` and `sap_protocol_invariants`, then upgrade the
  SDK/server or use the initializer path before retrying.
- For full agent identity setup, follow
  `docs/16_SAP_AGENT_IDENTITY_PIPELINE.md`: SAP registration first, optional
  Metaplex/MPL Core identity, optional SNS domain and records, then a final SAP
  update that points `metadataUri` at the public metadata document.
- "Find XONA Agent" or "find an agent by name" means `sap_discover_agents` with
  `query`.
- "Find x402 agents" means `sap_discover_agents` with
  `hasX402Endpoint: true`.
- "List all agents" means first call free `sap_list_agents` with
  `limit <= 20`, `view: "compact"`, and `includeProtocolIndexes: false`; then
  use paid `sap_list_all_agents` with `pagination.nextCursor` if the user wants
  more, full rows, or ecosystem-scale enumeration.
- "Agent by wallet" means `sap_get_agent` or `sap_get_agent_profile`.
- "Is this agent live?" means `sap_is_agent_active`.
- "Network totals" means `sap_get_network_overview`.

## Safety

Registration and update tools are write operations. Explain the action, read
policy context, require explicit confirmation, and never inspect keypair files.
For registrations, distinguish `agent account exists` from `protocol lifecycle
complete`; the latter requires confirmation plus a non-failing protocol fee
audit.

## Canonical Register Fields

Use these exact fields for `sap_payments_register_agent` and local
`sap_register_agent`:

- `name`: public display name.
- `description`: public purpose, capabilities, and trust boundary.
- `capabilities`: array of strings or objects. Prefer object form:
  `{ "id": "jupiter:swap", "description": "...", "protocolId": "jupiter", "version": "1.0.0" }`.
- `pricing`: array of pricing tiers. For x402/pay.sh use
  `{ "pricePerCall": "1000", "tokenType": "usdc", "settlementMode": "x402", "tokenDecimals": 6 }`;
  USDC amounts are micro-USDC.
- `protocols`: array such as `["sap", "mcp", "jupiter", "pyth", "metaplex"]`.
- `agentId`: stable lowercase id, for example `solking`.
- `agentUri` or `metadataUri`: public metadata/profile URL. Never a local path.
- `x402Endpoint`: optional `https://host/.well-known/x402`.
- `confirm`: required `true` on the local `sap_payments` bridge.
- `protocolFee`: returned output audit for registration; verify it before
  announcing completion.

## Canonical Update Fields

`sap_payments_update_agent` accepts the same profile fields as registration,
but every field is optional. Omitted fields stay unchanged. Array fields
replace the full on-chain list, so fetch the current agent first before adding
only one capability, protocol, or pricing tier.
