# SAP Tool Registry

Use this skill for publishing, fetching, updating, deactivating, reactivating,
and reporting SAP tool descriptors.

## Tools

- `sap_publish_tool_by_name`
- `sap_update_tool`
- `sap_deactivate_tool`
- `sap_reactivate_tool`
- `sap_fetch_tool`
- `sap_report_tool_invocations`
- `sap_find_tools_by_category`
- `sap_get_tool_category_summary`
- `sap_fetch_tool_category_index`

## Flow

1. Inspect `sap_profile_current`.
2. For discovery, use `sap_find_tools_by_category` or `sap_fetch_tool`.
3. For publishing or updates, explain protocol ID, category, params, and schema
   impact before calling the write tool.
4. Report invocations only after real usage has occurred.

## Safety

Tool registry writes affect on-chain discoverability. Do not publish placeholder
schemas, fake HTTP methods, or unverifiable descriptions.
