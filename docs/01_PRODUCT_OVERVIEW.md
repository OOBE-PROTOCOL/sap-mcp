# 01. Product Overview

## 01.1 What SAP MCP Is

SAP MCP Server exposes OOBE Synapse Agent Protocol functionality through the Model Context Protocol. Agents connect through MCP and receive a structured tool surface for Solana, SAP Protocol, Synapse AgentKit, SNS, profiles, skills, payments, and transaction signing.

The server supports two first-class modes:

| Mode | Transport | Primary use case |
| --- | --- | --- |
| Local | stdio | Claude Desktop, Hermes, Codex, OpenClaw, Cursor, and local agent development. |
| Remote | Streamable HTTP at `/mcp` | Hosted access at a public domain such as `mcp.sap.oobeprotocol.ai`. |

## 01.2 What It Exposes

The runtime tool registry includes:

1. SAP SDK tools from `@oobe-protocol-labs/synapse-sap-sdk`.
2. SAP SNS tools for domain and identity workflows.
3. Synapse AgentKit tools from `@oobe-protocol-labs/synapse-client-sdk`.
4. Solana RPC, DAS, token, NFT, DeFi, Jupiter, transaction, and profile tools.
5. SAP MCP profile and skill-pack management tools.
6. x402 payment helper tools for paid hosted workflows.

Tool count changes as upstream SDKs evolve. Verify the current runtime count with `tools/list` or the smoke test in [07. Endpoints And Clients](07_ENDPOINTS_AND_CLIENTS.md).

## 01.3 Who Uses It

| Actor | What they need |
| --- | --- |
| Local agent operator | A profile under `~/.config/mcp-sap`, a dedicated SAP MCP keypair or external signer, and a local MCP client config. |
| Hosted MCP customer | A remote MCP URL and payment headers only for paid tool calls. |
| OOBE operator | A VPS deployment, reverse proxy, PM2 services, API keys or JWT auth, facilitator service, payment recipient wallet, and monitoring. |
| Developer | The repo, SDK dependencies, typecheck/build/test gates, and the docs in this directory. |

## 01.4 Public Or Private Repository

The recommended model is:

1. Keep the source repo public once secrets, private config files, keypairs, deployment tokens, and customer credentials are excluded.
2. Keep production `.env`, PM2 ecosystem files with secrets, facilitator signer files, and customer API keys private.
3. Publish signed GitHub releases and npm packages so users can install the wizard and local server without cloning private infrastructure.

Public source helps agent developers audit the tool surface, transport behavior, and signing model. Private deployment state protects the business.

## 01.5 Do Remote Customers Need The Wizard?

Yes for signing and paid agent operation.

1. Customers can connect read-only agents to hosted `https://mcp.sap.oobeprotocol.ai/mcp` with only a client config entry.
2. Hosted users who sign x402/pay.sh payments or tool transactions must run `sap-mcp-config wizard` to create the user SAP profile, policy limits, and local or external signer.
3. Developers who want to run SAP MCP locally should use the wizard.
4. Hosted customers should not receive server keypairs, facilitator keypairs, or OOBE deployment secrets.

The wizard is distributed through the npm package and release artifacts. It is the standard onboarding path for hosted users who need user-controlled signing.

Agent owners need the wizard when they want their own SAP identity, local profile, dedicated wallet, signing policy, or external signer connection. In that case the wallet lives on the user's machine under `~/.config/mcp-sap/keypairs/` or behind an external signer, not inside the hosted OOBE remote MCP process.

| Customer mode | Wizard required | Wallet or signer location |
| --- | --- | --- |
| Read-only hosted discovery | Optional | None required for read-only calls. |
| Hosted user paying x402/pay.sh charges | Yes | User machine under `~/.config/mcp-sap/keypairs/` or external signer. |
| Hosted user signing SAP/Solana tool transactions | Yes | User-controlled signer, never uploaded to `mcp.sap.oobeprotocol.ai`. |
| Local stdio or self-hosted developer | Yes | User machine under `~/.config/mcp-sap/keypairs/` or external signer. |
| OOBE custodial hosted agent | No for end user | OOBE-controlled secret manager; separate product and risk model. |

## 01.6 Monetization Model In One Sentence

Agents do not pay merely because they connect. Free protocol and base profile calls remain free; paid tools are priced per `tools/call` and authorized through x402 before execution.
