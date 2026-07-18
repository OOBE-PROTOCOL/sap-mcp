# Skills And Tool Usage

## 1. Start SAP MCP

Users should not need to paste a long operations prompt. After connecting the
hosted `sap` MCP server, say this to the agent:

```text
Start SAP MCP.
```

The agent should then:

1. call `sap_agent_start`;
2. call `sap_skills_bundle` with `includeContents: true`;
3. call `sap_skills_upgrade_plan` if skills are missing or stale;
4. use exact tool names from `tools/list`;
5. call `sap_payments_readiness` if the local `sap_payments` bridge is visible;
6. use `sap_payments_call_paid_tool` for paid hosted tools that return x402 payment requirements;
7. if a paid hosted builder returns `transactionBase64`, call `sap_payments_finalize_transaction` for local preview/sign/submit.

If `sap_payments` is missing, run the wizard repair flow and restart the agent
runtime:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config repair
```

Agents should call the free `sap_runtime_repair_plan` tool before asking users
to edit MCP config by hand. It returns the pinned latest-release repair command,
what the repair changes, and which `sap_payments` tools should be visible after
the runtime restarts.

## 2. Install Skills

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

Plan a skills upgrade from hosted or local SAP MCP:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "sap_skills_upgrade_plan",
    "arguments": {
      "agent": "codex"
    }
  }
}
```

`sap_skills_upgrade_plan` is free. In hosted mode it does not claim to write
files on the user's machine; it returns exact commands and target directories.
In local stdio mode, use `sap_skills_install` with `confirm: true` when the user
wants the files written.

## 3. Tool Selection

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

- `sap_sns_check_domain` for a free single-domain availability check
- `sap_sns_batch_check_domains`
- `sap_sns_resolve_domain`
- `sap_sns_register_agent_domain` only from a local SAP MCP profile with a
  local wallet or external signer

Hosted accountless SAP MCP cannot directly sign SNS registrations. If a hosted
direct write returns `hosted_local_signer_required`, no x402 payment was charged;
run the local profile flow or use hosted unsigned builders plus
`sap_payments_finalize_transaction` where a builder exists.

Use transactions:

- `sap_preview_transaction`
- `sap_sign_transaction`
- `sap_submit_signed_transaction`
- `sap_payments_finalize_transaction` for hosted builder transactions that must be finalized locally

## 4. Agent Safety

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
