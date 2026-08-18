# 00. Documentation Index

SAP MCP Server is a production-oriented Model Context Protocol server for OOBE SAP Protocol, Solana, Synapse AgentKit, SNS, and monetized hosted agent workflows.

This documentation set is intentionally numbered. Read it in order for a full system view, or jump directly to the operational area you need.

File names use `NN_DOMAIN_PURPOSE_ARTIFACT.md` for fast resolution during support, release, and incident work. Preferred artifact suffixes are `INDEX`, `RUNBOOK`, `CONTRACTS`, `SPECIFICATION`, `REFERENCE`, `REPORT`, `WORKFLOW`, `PIPELINE`, `PROTOCOL`, and `BOUNDARIES`. Avoid vague names such as "overview", "guide", or "notes" unless the file is the docsify `README.md` entrypoint.

For end-user installation and MCP client setup, start with [`../USER_DOCS/00_USER_ONBOARDING_INDEX.md`](../USER_DOCS/00_USER_ONBOARDING_INDEX.md). The files below are the engineering and operations reference set.

## 00.1 Document Map

| Document | Purpose |
| --- | --- |
| [01. Product Scope And Deployment Model](01_PRODUCT_SCOPE_DEPLOYMENT_MODEL.md) | What SAP MCP is, who uses it, and which deployment models it supports. |
| [02. Runtime Architecture And Trust Boundaries](02_RUNTIME_ARCHITECTURE_TRUST_BOUNDARIES.md) | Runtime modules, MCP flow, signing flow, payment flow, and trust boundaries. |
| [03. Profile Config Wizard Injection](03_PROFILE_CONFIG_WIZARD_INJECTION.md) | Profile manager, wallet isolation, wizard behavior, client config injection, and config CLI. |
| [04. Local Stdio MCP Runbook](04_LOCAL_STDIO_MCP_RUNBOOK.md) | Local MCP setup for Claude, Hermes, Codex, OpenClaw, and development agents. |
| [05. Hosted Streamable HTTP Deployment](05_HOSTED_STREAMABLE_HTTP_DEPLOYMENT.md) | Hosted Streamable HTTP deployment for `mcp.sap.oobeprotocol.ai`, reverse proxy, PM2, and release packaging. |
| [06. x402/pay.sh Monetization Settlement](06_X402_PAYSH_MONETIZATION_SETTLEMENT.md) | Monetization model, x402 payment gate, pay.sh provider YAML, facilitator keypair, pricing, and settlement. |
| [07. HTTP Endpoints, MCP Clients, And Smoke Tests](07_HTTP_ENDPOINTS_MCP_CLIENTS_SMOKE_TESTS.md) | HTTP endpoints, headers, MCP client examples, health checks, smoke tests, and payment endpoints. |
| [08. Security Policy Signing Runbook](08_SECURITY_POLICY_SIGNING_RUNBOOK.md) | Keypair safety, Bento/local policy, approval rules, signer modes, and operational security. |
| [09. Tool Skill Routing Agent Operations](09_TOOL_SKILL_ROUTING_AGENT_OPERATIONS.md) | Tool families, agent context, skills installation, SDK docs pointers, and language expectations. |
| [10. Release Operations PM2 Runbook](10_RELEASE_OPERATIONS_PM2_RUNBOOK.md) | Build gates, PM2 ecosystem, logs, monitoring, changelog discipline, public/private repo guidance. |
| [11. Engineering Quality Audit Report](11_ENGINEERING_QUALITY_AUDIT_REPORT.md) | Engineering scorecard, release gates, quality rules, and current residual risks. |
| [12. Signed Agent Chat Protocol](12_SIGNED_AGENT_CHAT_PROTOCOL.md) | SAP signed thematic group rooms, room manifests, retrieval, link sharing, privacy boundaries, and SDK-native roadmap. |
| [13. Bounty Program Technical Spec](13_BOUNTY_PROGRAM_TECHNICAL_SPEC.md) | Proposed multi-partner bounty with OOBE/SAP MCP, Bento, Metaplex 014/MPL Core, SNS, judging criteria, and technical requirements. |
| [14. Desktop Wizard Release Artifacts](14_DESKTOP_WIZARD_RELEASE_ARTIFACTS.md) | GUI wizard architecture, release artifacts, signing requirements, and multi-OS GitHub Actions packaging. |
| [15. Demo Dashboard Screenshare Runbook](15_DEMO_DASHBOARD_SCREENSHARE_RUNBOOK.md) | Scripted demo path for hosted landing page, dashboard surfaces, payments, and wizard flows. |
| [16. Agent Identity Registry Pipeline](16_AGENT_IDENTITY_REGISTRY_PIPELINE.md) | Agent identity enrichment, registry source truth, client display fields, and validation pipeline. |
| [18. Premium Plugin Runtime Contracts](18_PREMIUM_PLUGIN_RUNTIME_CONTRACTS.md) | Premium plugin manifest contracts, public discovery, provider readiness, streams, and webhooks. |
| [19. Agentic Standards Interoperability](19_AGENTIC_STANDARDS_INTEROPERABILITY.md) | MCP, A2A, marketplace, x402/pay.sh, and agent runtime alignment. |
| [20. Engineering Operating Model Boundaries](20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md) | Component branch strategy, hosted/local service contracts, release personas, wizard standards, and company-grade gates. |
| [Branching CI Release Workflow](BRANCHING_CI_RELEASE_WORKFLOW.md) | Branch ownership, service-scoped workflows, CI gates, and release promotion rules. |
| [MagicBlock Tooling Reference](MAGICBLOCK_TOOLING_REFERENCE.md) | MagicBlock tool group behavior, schemas, and smoke-test coverage. |
| [x402/pay.sh Protocol Specification](X402_PAYSH_PROTOCOL_SPECIFICATION.md) | Payment challenge, provider YAML, settlement headers, and paid tool protocol surface. |

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
| SAP MCP Desktop Wizard | GUI/TUI-style installer released as DMG/ZIP, Windows EXE, and Linux tar.gz artifacts. |

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
11. Hosted MCP, local bridge, wizard, MCP Apps UI, payments, protocol tools, and release ops must keep explicit service contracts and component-scoped branch ownership.
