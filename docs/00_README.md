# 00. Documentation Index

SAP MCP Server is a production-oriented Model Context Protocol server for OOBE SAP Protocol, Solana, Synapse AgentKit, SNS, and monetized hosted agent workflows.

This documentation set is intentionally numbered. Read it in order for a full system view, or jump directly to the operational area you need.

## 00.1 Document Map

| Document | Purpose |
| --- | --- |
| [01. Product Overview](01_PRODUCT_OVERVIEW.md) | What SAP MCP is, who uses it, and which deployment models it supports. |
| [02. Architecture And Request Flow](02_ARCHITECTURE_AND_REQUEST_FLOW.md) | Runtime modules, MCP flow, signing flow, payment flow, and trust boundaries. |
| [03. Configuration And Wizard](03_CONFIGURATION_AND_WIZARD.md) | Profile manager, wallet isolation, wizard behavior, client config injection, and config CLI. |
| [04. Local Stdio Usage](04_LOCAL_STDIO_USAGE.md) | Local MCP setup for Claude, Hermes, Codex, OpenClaw, and development agents. |
| [05. Remote VPS Deployment](05_REMOTE_VPS_DEPLOYMENT.md) | Hosted Streamable HTTP deployment for `mcp.sap.oobeprotocol.ai`, reverse proxy, PM2, and release packaging. |
| [06. Payments, x402, And pay.sh](06_PAYMENTS_X402_AND_PAYSH.md) | Monetization model, x402 payment gate, pay.sh provider YAML, facilitator keypair, pricing, and settlement. |
| [07. Endpoints And Clients](07_ENDPOINTS_AND_CLIENTS.md) | HTTP endpoints, headers, MCP client examples, health checks, smoke tests, and payment endpoints. |
| [08. Security, Policy, And Signing](08_SECURITY_POLICY_AND_SIGNING.md) | Keypair safety, Bento/local policy, approval rules, signer modes, and operational security. |
| [09. Tools, Skills, And Agent Guide](09_TOOLS_SKILLS_AND_AGENT_GUIDE.md) | Tool families, agent context, skills installation, SDK docs pointers, and language expectations. |
| [10. Operations, Release, And PM2](10_OPERATIONS_RELEASE_AND_PM2.md) | Build gates, PM2 ecosystem, logs, monitoring, changelog discipline, public/private repo guidance. |
| [11. Code Quality Audit](11_CODE_QUALITY_AUDIT.md) | Engineering scorecard, release gates, quality rules, and current residual risks. |
| [12. On-Chain Agent Chat](12_ONCHAIN_AGENT_CHAT.md) | SAP signed thematic group rooms, room manifests, retrieval, link sharing, privacy boundaries, and SDK-native roadmap. |

## 00.2 Primary Binaries

| Binary | Purpose |
| --- | --- |
| `sap-mcp-server` | Local stdio MCP server and CLI entry point. |
| `sap-mcp-remote` | Remote MCP Streamable HTTP server. Supports bearerless public mode plus API key/JWT private modes. |
| `sap-mcp-config` | Config CLI, profile manager, approval workflow, and wizard entry point. |
| `sap-mcp-wizard` | TUI setup wizard. |
| `sap-signing-proxy` | Local signing proxy for external signer mode. |
| `sap-mcp-facilitator` | Self-hosted x402 SVM facilitator. |
| `sap-mcp-pay-sh-spec` | pay.sh provider YAML generator. |

## 00.3 Golden Rules

1. Generated SAP MCP wallets live under `~/.config/mcp-sap/keypairs/`.
2. The wizard never modifies `~/.config/solana/id.json`.
3. Local stdio mode is for a user's own machine.
4. Remote HTTP mode can be bearerless for hosted agents; paid tools still require x402.
5. Hosted payment and transaction signing flows still require a wizard-created user SAP profile and a local or external signer.
6. x402 monetization applies to paid `tools/call` requests, not to the basic MCP handshake.
7. pay.sh is an outer provider/catalog/proxy integration; SAP MCP remains the source of truth for per-tool pricing.
8. Facilitator signer, revenue recipient, user SAP wallet, agent PDA, and Solana CLI wallet are separate identities.
9. Keypair bytes must never be logged, shown to agents, injected into client config, or documented in examples.
10. SAP chat tools use session ledgers for fetchable signed group-room history; DMs are reserved for future native support.
