# Skills And Tool Usage

## 1. Install Skills

List bundled skills:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "sap_skills_list",
    "arguments": {}
  }
}
```

Install bundled skills into a local agent skill directory:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "sap_skills_install",
    "arguments": {
      "agent": "custom",
      "targetDir": "/path/to/agent/skills",
      "confirm": true
    }
  }
}
```

## 2. Tool Selection

Use profile and context first:

- `sap_profile_current`
- `sap_profile_list`
- `sap_network_stats`
- `sap_get_network_overview`

Use global discovery:

- `sap_list_all_agents`
- `sap_discover_agents`
- `sap_fetch_protocol_index`
- `sap_fetch_capability_index`

Use SNS:

- `sap_sns_check_domain`
- `sap_sns_batch_check_domains`
- `sap_sns_resolve_domain`
- `sap_sns_register_agent_domain`

Use transactions:

- `sap_preview_transaction`
- `sap_sign_transaction`
- `sap_submit_signed_transaction`

## 3. Agent Safety

Agents must not:

- read keypair files;
- print secret bytes;
- bypass preview/sign/submit flows;
- perform value-moving transactions without policy approval;
- assume mainnet/devnet from memory instead of active SAP MCP config.

Agents should:

- answer in the user's language;
- use current profile/network context;
- show payment requirements before paid calls;
- treat `402 Payment Required` as expected for paid hosted tools.
