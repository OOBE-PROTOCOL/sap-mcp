# 09. Tools, Skills, And Agent Guide

## 09.1 Tool Families

SAP MCP exposes several tool families:

1. SAP SDK registry, discovery, reputation, escrow, memory, capability, SNS, and protocol tools.
2. Synapse AgentKit tools.
3. Solana RPC, token, NFT, DAS, transaction, network, and Jupiter tools.
4. Profile tools such as current profile, switch profile, list profiles, and public key inspection.
5. Skill-pack tools for installing SAP MCP usage context into agent runtimes.
6. x402 tools for estimating, preparing, verifying, and settling paid workflows.
7. Chat tools for signed SAP session-ledger group rooms, discovery manifests, room sealing, and message retrieval.

## 09.2 Agent Context Rules

Agents should:

1. Treat `Start SAP MCP`, `Initialize SAP MCP`, `Load SAP`, and `SAP mode` as activation phrases.
2. Call `sap_agent_start` first when it is exposed, then load `sap_skills_bundle` with `includeContents: true`.
3. Call profile/context tools before claiming the current network.
4. For hosted remote MCP, describe the remote server as accountless and non-custodial; do not call `default` the user's local profile.
5. Use local `sap_payments_profile_current` and `sap_payments_readiness` when the `sap_payments` bridge is visible.
6. Respect the active profile's `rpcUrl`, `programId`, and `mode`.
7. Prefer SAP SDK docs and skills when explaining SAP Protocol semantics.
8. Answer in the user's language unless the user asks otherwise.
9. Avoid showing internal thinking, keypair bytes, raw request secrets, or private config.
10. Ask for approval before signing or value-moving operations when required by policy.
11. Use free exact/base SAP reads before paid discovery when possible:
    `sap_agent_context`, `sap_get_agent`, `sap_get_agent_profile`,
    `sap_get_agent_stats`, `sap_is_agent_active`, `sap_get_global_state`, and compact
    `sap_list_agents` pages with `limit <= 20`, `view: "compact"`, and
    `includeProtocolIndexes: false`.
12. For paid hosted agent discovery, use targeted `sap_discover_agents` filters
    before broad scans: `query`, `wallet`, `agentPda`, `protocol`,
    `capability`, `capabilities`, `hasX402Endpoint`, small `limit`, then
    `pagination.nextCursor`.
13. If a capability lookup returns zero agents, retry with `query` or `wallet`
    before saying the agent is absent; AgentAccount rows are canonical and
    indexes can lag.
14. Call `sap_agent_next_action` before retrying after `payment_required`,
    `hosted_local_signer_required`, transient RPC errors, missing local bridge
    tools, or submitted signatures that did not confirm.

The intended user command is short:

```text
Start SAP MCP.
```

The agent should then run the startup routine itself instead of asking the user
to paste a long prompt.

For simple status prompts such as "are you connected to SAP MCP?", keep the
answer compact: connected yes/no, endpoint, mode, non-custodial status, local
`sap_payments` readiness only if it was actually checked, and one next action.
Do not list the full tool catalog, protocol families, or category summary
unless the user explicitly asks what tools are available.

## 09.3 Bootstrap Tools And Prompts

SAP MCP exposes a free startup path:

1. `sap_agent_start` returns the machine-readable agent playbook.
2. `sap_agent_runtime_status` returns the hosted/accountless/local-bridge routing table.
3. `sap_agent_context` returns free compact SAP agent context before paid discovery.
4. `sap_agent_next_action` classifies SAP MCP errors and tells the agent whether a retry is safe.
5. `sap-agent-start` is the matching MCP prompt for runtimes that prefer prompts.
6. `sap_skills_bundle` returns the bundled SAP MCP skills so the agent can load tool routing, x402, SNS, registry, chat, and Solana protocol guidance.
7. `sap_payments_readiness` checks the local non-custodial payment bridge before paid/write hosted calls.

These calls are free. Paid tools should only start after the agent has loaded
skills and, when needed, verified the local `sap_payments` bridge.

## 09.4 Skills Directory

The repo may include a `skills/` directory for client-installable SAP MCP operating instructions.

Recommended skill topics:

1. SAP MCP overview and safety rules.
2. Solana protocol tool routing.
3. SAP registry and discovery workflows.
4. SNS identity workflows.
5. x402 payment and settlement workflows.
6. Transaction signing and approval workflows.
7. Troubleshooting network/profile mismatch.
8. On-chain agent chat workflows using SAP session ledgers.

## 09.5 Upstream SDK References

Use upstream SAP SDK docs and skills as the source of protocol behavior:

1. `https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs`
2. `https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/skills`
3. `https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/v1.0.2/skills`

SAP MCP wrappers should map to real SDK imports and types from:

1. `@oobe-protocol-labs/synapse-sap-sdk`
2. `@oobe-protocol-labs/synapse-client-sdk`
3. `@modelcontextprotocol/sdk`

## 09.6 Tool Documentation Standard

Each exported tool should include:

1. Stable tool name.
2. Clear title.
3. Operational description.
4. JSON schema or Zod schema that serializes correctly through MCP `tools/list`.
5. Typed handler input.
6. Typed handler output.
7. Policy metadata.
8. Payment tier when hosted monetization is enabled.
9. Error behavior.

Avoid stubs, fake compatibility wrappers, `any`, TODO-only handlers, and undocumented low-code glue.

## 09.7 Language Behavior

If a user asks in English, the agent should answer in English. If a user asks in Italian, the agent should answer in Italian. SAP MCP prompts and skills should reinforce this behavior because tool output may contain multilingual metadata.
