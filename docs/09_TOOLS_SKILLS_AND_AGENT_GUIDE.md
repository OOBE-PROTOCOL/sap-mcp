# 09. Tools, Skills, And Agent Guide

## 09.1 Tool Families

SAP MCP exposes several tool families:

1. SAP SDK registry, discovery, reputation, escrow, memory, capability, SNS, and protocol tools.
2. Synapse AgentKit tools.
3. Solana RPC, token, NFT, DAS, transaction, network, and Jupiter tools.
4. Profile tools such as current profile, switch profile, list profiles, and public key inspection.
5. Skill-pack tools for installing SAP MCP usage context into agent runtimes.
6. x402 tools for estimating, preparing, verifying, and settling paid workflows.

## 09.2 Agent Context Rules

Agents should:

1. Call profile/context tools before claiming the current network.
2. Respect the active profile's `rpcUrl`, `programId`, and `mode`.
3. Prefer SAP SDK docs and skills when explaining SAP Protocol semantics.
4. Answer in the user's language unless the user asks otherwise.
5. Avoid showing internal thinking, keypair bytes, raw request secrets, or private config.
6. Ask for approval before signing or value-moving operations when required by policy.

## 09.3 Skills Directory

The repo may include a `skills/` directory for client-installable SAP MCP operating instructions.

Recommended skill topics:

1. SAP MCP overview and safety rules.
2. Solana protocol tool routing.
3. SAP registry and discovery workflows.
4. SNS identity workflows.
5. x402 payment and settlement workflows.
6. Transaction signing and approval workflows.
7. Troubleshooting network/profile mismatch.

## 09.4 Upstream SDK References

Use upstream SAP SDK docs and skills as the source of protocol behavior:

1. `https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs`
2. `https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/skills`
3. `https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/v0.21.0/skills`

SAP MCP wrappers should map to real SDK imports and types from:

1. `@oobe-protocol-labs/synapse-sap-sdk`
2. `@oobe-protocol-labs/synapse-client-sdk`
3. `@modelcontextprotocol/sdk`

## 09.5 Tool Documentation Standard

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

## 09.6 Language Behavior

If a user asks in English, the agent should answer in English. If a user asks in Italian, the agent should answer in Italian. SAP MCP prompts and skills should reinforce this behavior because tool output may contain multilingual metadata.

