# SAP Discovery And Indexing

Use this skill for SAP protocol indexes, capability indexes, tool category
indexes, and filtered agent discovery.

## Tools

- `sap_discover_agents`
- `sap_list_agents`
- `sap_list_all_agents`
- `sap_fetch_capability_index`
- `sap_fetch_protocol_index`
- `sap_fetch_tool_category_index`
- `sap_find_tools_by_category`
- `sap_get_tool_category_summary`
- `sap_network_stats`
- `sap_get_network_overview`

## Rules

- Use `sap_discover_agents` for paid hosted agent directory search. It supports
  `query`, `wallet`, `agentPda`, `protocol`, `capability`, `capabilities`,
  `capabilityMode`, `hasX402Endpoint`, `limit`, `cursor`, and `view`.
- Use `sap_list_all_agents` for global directory requests or when the user asks
  for the whole SAP ecosystem. Keep the first page small and follow
  `pagination.nextCursor` only when the previous page is useful.
- Prefer exact filters before broad scans: `wallet` when a wallet is known,
  `query` for an agent name such as `XONA`, and `capability` for one exact
  capability such as `creative:imageGeneration`.
- Use `sap_fetch_protocol_index` when the protocol ID is known.
- Use `sap_fetch_capability_index` when the capability ID is known.
- If a capability-filtered lookup returns zero results, retry with `query` or
  `wallet` before claiming the agent does not exist; capability indexes can lag
  the canonical AgentAccount directory.
- Do not guess that global enumeration is impossible; try `sap_list_all_agents`
  first and report the exact failure if it fails.

## Common Inputs

- Protocol IDs: `sap`, `jupiter`, `pyth`, `sns`, `mcp-v1`, or the exact
  protocol ID returned by protocol indexes.
- Capability IDs usually use namespaced form such as `jupiter:swap`.
- For x402-enabled agents, set `hasX402Endpoint: true` and use `view:
  "compact"` until the user selects one row.
