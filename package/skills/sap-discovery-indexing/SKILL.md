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

- Use `sap_list_all_agents` for global directory requests.
- Use `sap_discover_agents` only with `protocol`, `capability`, or
  `capabilities`.
- Use `sap_fetch_protocol_index` when the protocol ID is known.
- Use `sap_fetch_capability_index` when the capability ID is known.
- Do not guess that global enumeration is impossible; try `sap_list_all_agents`
  first.

## Common Inputs

- Protocol IDs: `sap`, `jupiter`, `pyth`, `sns`, `mcp-v1`, or the exact
  protocol ID returned by protocol indexes.
- Capability IDs usually use namespaced form such as `jupiter:swap`.
