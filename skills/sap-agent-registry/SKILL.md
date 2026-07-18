# SAP Agent Registry

Use this skill for SAP agent identity, registration, profile updates, activation
state, global directory listing, and agent profile inspection.

## First Steps

1. Call `sap_profile_current`.
2. Call `sap_get_network_overview` for ecosystem counters when needed.
3. Use `sap_discover_agents` with `query`, `wallet`, `protocol`, or
   `capability` for targeted paid hosted directory reads.
4. Use `sap_list_all_agents` for global current agent lists and follow
   `pagination.nextCursor` for additional pages.

## Tools

- `sap_register_agent`
- `sap_update_agent`
- `sap_deactivate_agent`
- `sap_reactivate_agent`
- `sap_close_agent`
- `sap_get_agent`
- `sap_get_agent_profile`
- `sap_get_agent_stats`
- `sap_get_global_state`
- `sap_get_network_overview`
- `sap_list_all_agents`
- `sap_is_agent_active`
- `sap_report_calls`
- `sap_update_reputation_metrics`

## Routing

- Hosted accountless SAP MCP cannot sign user-owned registry writes. If
  `sap_register_agent`, `sap_update_agent`, or another registry write returns
  `hosted_local_signer_required`, no x402 payment was charged; run the write on
  the local SAP MCP profile or use a production unsigned builder/finalizer flow
  when available.
- "Find XONA Agent" or "find an agent by name" means `sap_discover_agents` with
  `query`.
- "Find x402 agents" means `sap_discover_agents` with
  `hasX402Endpoint: true`.
- "List all agents" means `sap_list_all_agents` with a small `limit`, then
  `pagination.nextCursor` if the user wants more.
- "Agent by wallet" means `sap_get_agent` or `sap_get_agent_profile`.
- "Is this agent live?" means `sap_is_agent_active`.
- "Network totals" means `sap_get_network_overview`.

## Safety

Registration and update tools are write operations. Explain the action, read
policy context, and never inspect keypair files.
