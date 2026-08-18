# SAP MCP Server

Production-oriented Model Context Protocol server for OOBE Synapse Agent Protocol, Solana, Synapse AgentKit, SNS, and monetized hosted agent workflows.

SAP MCP exposes the same typed tool registry through two supported MCP launch modes:

1. Local stdio for desktop agents and local development.
2. Remote Streamable HTTP at `/mcp` for hosted customers and orchestrators.

It also includes a professional setup wizard, profile-managed config under `~/.config/mcp-sap`, optional Bento policy integration, local and external signing modes, x402 monetization, a self-hosted OOBE facilitator, pay.sh provider YAML generation, and an A2A-compatible discovery card.

User-facing setup docs live in [`USER_DOCS/`](USER_DOCS/00_USER_ONBOARDING_INDEX.md). Operator and engineering docs live in [`docs/`](docs/00_ENGINEERING_DOCUMENTATION_INDEX.md).

## 1. Status

| Area | Current behavior |
| --- | --- |
| Package version | `0.9.80` |
| MCP transport | stdio locally, Streamable HTTP remotely |
| Remote access | Bearerless public mode for hosted agents; API key or JWT for private modes |
| Config directory | `~/.config/mcp-sap` only |
| Agent wallet | Dedicated wallet path under `~/.config/mcp-sap/keypairs/` by default |
| Solana CLI keypair | Never modified by the wizard |
| Policy | Local policy by default, optional Bento or hybrid policy |
| Monetization | Optional remote-only x402/pay.sh payment flow with per-tool pricing |
| Signing | Local dedicated wallet or external signer, depending on profile mode |
| Discovery | A2A-compatible card at `/.well-known/agent-card.json` |

## 2. Install

Prerequisites:

```bash
node --version   # >= 22.12.0
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm --version   # 11.7.0
```

From source:

```bash
pnpm install
pnpm run build
```

Do not use `npm install` for source deployments. This repository is locked and verified with pnpm.

From the published package:

```bash
npm install -g @oobe-protocol-labs/sap-mcp-server
```

## 3. Quick Start

Create or select a profile:

```bash
npx sap-mcp-config wizard
```

Repair hosted SAP MCP runtime entries without recreating the profile:

```bash
npx sap-mcp-config repair
```

After connecting hosted SAP MCP in an agent runtime, start the agent context
with one short message:

```text
Start SAP MCP.
```

The agent should call the free `sap_agent_start` tool or `sap-agent-start`
prompt, load `sap_skills_bundle`, and use the local `sap_payments` bridge for
paid/write hosted calls.

Inspect the active profile:

```bash
npx sap-mcp-config show
npx sap-mcp-config doctor
npx sap-mcp-config pubkey
npx sap-mcp-config profiles
```

Start local stdio MCP:

```bash
sap-mcp-server
```

or from source:

```bash
node dist/cli.js
```

Hosted customers connect their agents to `https://mcp.sap.oobeprotocol.ai/mcp`, but signing remains user-controlled. The recommended setup for most users is the wizard-managed pair of MCP entries:

- `sap`: hosted Streamable HTTP SAP MCP at `https://mcp.sap.oobeprotocol.ai/mcp`;
- `sap_payments`: local non-custodial payment bridge for x402/pay.sh paid/write calls.

Any user who wants to pay x402/pay.sh charges, register or operate a SAP identity, or execute value-moving Solana/SAP tools should run the wizard first and keep the dedicated wallet under `~/.config/mcp-sap/keypairs/` or behind an external signer. Read-only hosted discovery can use the remote URL without a local signer.

## 4. Local Client Config

For local agents, let SAP MCP follow the active profile manager instead of hard-coding wallet paths or stale RPC overrides:

```json
{
  "mcpServers": {
    "sap": {
      "command": "sap-mcp-server",
      "env": {
        "SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE": "false",
        "SAP_LOG_LEVEL": "info"
      }
    }
  }
}
```

Codex uses TOML rather than the JSON `mcpServers` shape. For hosted remote MCP, add this to `~/.codex/config.toml` and restart Codex:

```toml
[mcp_servers.sap]
url = "https://mcp.sap.oobeprotocol.ai/mcp"
```

For paid/write hosted tools, add the local non-custodial payment bridge as well:

```toml
[mcp_servers.sap_payments]
command = "npx"
args = ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server@0.9.80", "sap-mcp-server"]
startup_timeout_sec = 300
tool_timeout_sec = 300

[mcp_servers.sap_payments.env]
SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = "false"
SAP_MCP_PAYMENTS_BRIDGE_ONLY = "true"
SAP_ALLOWED_TOOLS = "all"
SAP_LOG_LEVEL = "info"
```

On Windows, use `command = "npx.cmd"`. The wizard can write this automatically.

Codex supports Streamable HTTP MCP servers with URL-based entries in `config.toml`. Use local stdio through `npx` only when you specifically want Codex to launch the local SAP MCP process:

```toml
[mcp_servers.sap]
command = "npx"
args = ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server@0.9.80", "sap-mcp-server"]

[mcp_servers.sap.env]
SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = "false"
SAP_LOG_LEVEL = "info"
```

On Windows, use `command = "npx.cmd"`.

See [04. Local Stdio MCP Runbook](docs/04_LOCAL_STDIO_MCP_RUNBOOK.md).

## 5. Remote Server

Remote deployments expose MCP over Streamable HTTP:

```bash
node dist/remote/server.js
```

Production environment values should come from a private secret store or private deployment file, not from public docs. Public hosted agent-facing deployments can use `SAP_MCP_AUTH_TYPE=none` when x402, rate limits, and policy are enabled. API key or JWT auth remains available for private beta, enterprise, and admin deployments.

Remote endpoints:

```text
GET     /
GET     /docs
GET     /server.json
GET     /favicon.png
GET     /favicon.ico
GET     /health
GET     /openapi.json
GET     /.well-known/x402
GET     /pay/provider.yml
GET     /.well-known/agent-card.json
GET     /.well-known/sap-mcp-wizard.json
GET     /.well-known/sap-mcp-tool-catalog.json
GET     /tool-catalog.json
GET     /wizard/install.sh
POST    /mcp
GET     /mcp
DELETE  /mcp
```

`GET /` is a public, share-safe landing page with Open Graph/Twitter metadata. It exposes only public server information; keypair bytes, private wallet paths, RPC query secrets, and VPS-local paths must never appear there.

`GET /docs` serves the public documentation site for install, start, configuration, hosted remote MCP, x402/pay.sh payments, and MCP client setup.

Marketplace listings such as Smithery can use [`smithery.config.schema.json`](smithery.config.schema.json)
to explain the hosted setup path. The schema intentionally asks for no
secrets: SAP MCP hosted reads work remotely, while paid/write calls use the
wizard-managed local `sap_payments` bridge, local profile policy, and
user-controlled signer.

See [05. Hosted Streamable HTTP Deployment](docs/05_HOSTED_STREAMABLE_HTTP_DEPLOYMENT.md) and [07. HTTP Endpoints, MCP Clients, And Smoke Tests](docs/07_HTTP_ENDPOINTS_MCP_CLIENTS_SMOKE_TESTS.md).

## 6. Monetization

Hosted HTTP deployments can require payment for paid `tools/call` requests while leaving local stdio and base MCP protocol calls free.

Initial model:

| Tier | Examples | Price |
| --- | --- | --- |
| Free | `tools/list`, `prompts/list`, `resources/list`, bootstrap/status/repair, cost estimation, local payment bridge control, SOL/SPL/x402 balance readiness, single-asset price snapshots, memory/audit, transaction preview/finalize helpers | Free |
| Micro read | exact agent/profile reads, compact directory pages, SNS availability, escrow state, lightweight trader context | `$0.001` |
| Premium read | broad discovery, enriched holdings/DAS, token lists, quotes/routes, history/OHLCV, analytics, larger pages | `$0.002` |
| Builder or batch | complex builders, SNS/domain batch checks, unsigned transaction builders, routing preparation | `$0.006`, batch = sum of paid calls |
| Value action | selected value-linked operations | fixed `$0.06` standard, `$0.035` selected heavy paths, plus optional bps |

Enable x402:

```bash
SAP_MCP_MONETIZATION_ENABLED=true
SAP_MCP_MONETIZATION_PROVIDER=x402
SAP_MCP_MONETIZATION_PAY_TO=YOUR_SOLANA_USDC_RECIPIENT
SAP_MCP_X402_FACILITATOR_URL=YOUR_PRIVATE_OR_HOSTED_FACILITATOR_URL
```

Initialize and run the OOBE facilitator:

```bash
npx sap-mcp-facilitator init
npx sap-mcp-facilitator start
```

Generate a pay.sh provider YAML:

The hosted public catalog is available at `https://mcp.sap.oobeprotocol.ai/pay/provider.yml`.
It is secret-free and intended for pay.sh catalog/proxy discovery.

```bash
npx sap-mcp-pay-sh-spec \
  --out sap-mcp-pay-sh.yml \
  --upstream-url https://mcp.sap.oobeprotocol.ai \
  --network mainnet \
  --recipient YOUR_SOLANA_USDC_RECIPIENT
```

See [06. x402/pay.sh Monetization Settlement](docs/06_X402_PAYSH_MONETIZATION_SETTLEMENT.md).

For local agent runtimes that cannot replay x402 challenges natively, install
the wizard's local `sap_payments` bridge and call `sap_payments_call_paid_tool`.
The legacy CLI helper is still available for terminal use:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-x402-paid-call \
  --tool sap_list_all_agents \
  --arguments '{"limit":5}' \
  --max-usd 0.02 \
  --confirm
```

The helper signs payment payloads with the user's local SAP MCP profile and
never sends keypair bytes to the hosted server.

## 7. Commands

```bash
pnpm run typecheck
pnpm run lint
pnpm test -- --run
pnpm run build
pnpm run verify:release
```

Installed binaries:

| Command | Purpose |
| --- | --- |
| `sap-mcp-server` | Local stdio MCP server and CLI entry point |
| `sap-mcp-remote` | Remote MCP server with bearerless, API key, and JWT modes |
| `sap-mcp-config` | Config CLI, profile manager, approval workflow, and wizard |
| `sap-mcp-wizard` | TUI configuration wizard |
| `sap-signing-proxy` | Local signing proxy |
| `sap-mcp-facilitator` | Self-hosted x402 SVM facilitator |
| `sap-mcp-pay-sh-spec` | pay.sh provider YAML generator |
| `sap-mcp-x402-paid-call` | Legacy terminal/custom-wrapper fallback for hosted x402 paid MCP tools |

## 8. Documentation

Start with [00. Engineering Documentation Index](docs/00_ENGINEERING_DOCUMENTATION_INDEX.md).

| Document | Purpose |
| --- | --- |
| [01. Product Scope Deployment Model](docs/01_PRODUCT_SCOPE_DEPLOYMENT_MODEL.md) | Product model, users, public/private repo guidance, and wizard distribution. |
| [02. Runtime Architecture Trust Boundaries](docs/02_RUNTIME_ARCHITECTURE_TRUST_BOUNDARIES.md) | Runtime modules, local flow, remote flow, signing, payments, and trust boundaries. |
| [03. Profile Config Wizard Injection](docs/03_PROFILE_CONFIG_WIZARD_INJECTION.md) | Profile manager, wizard, wallet isolation, client injection, and config CLI. |
| [04. Local Stdio MCP Runbook](docs/04_LOCAL_STDIO_MCP_RUNBOOK.md) | Local setup for Claude, Hermes, Codex, OpenClaw, and development agents. |
| [05. Hosted Streamable HTTP Deployment](docs/05_HOSTED_STREAMABLE_HTTP_DEPLOYMENT.md) | Hosted deployment, reverse proxy, PM2, and customer onboarding. |
| [06. x402/pay.sh Monetization Settlement](docs/06_X402_PAYSH_MONETIZATION_SETTLEMENT.md) | Pricing, x402 gate, pay.sh provider YAML, facilitator signer, and settlement. |
| [07. HTTP Endpoints, MCP Clients, And Smoke Tests](docs/07_HTTP_ENDPOINTS_MCP_CLIENTS_SMOKE_TESTS.md) | HTTP endpoints, headers, smoke tests, and client examples. |
| [08. Security Policy Signing Runbook](docs/08_SECURITY_POLICY_SIGNING_RUNBOOK.md) | Key material rules, signer modes, Bento policy, and transaction safety. |
| [09. Tool Skill Routing Agent Operations](docs/09_TOOL_SKILL_ROUTING_AGENT_OPERATIONS.md) | Tool families, SDK doc pointers, skills, and agent behavior. |
| [10. Release Operations PM2 Runbook](docs/10_RELEASE_OPERATIONS_PM2_RUNBOOK.md) | Quality gates, PM2, secrets, release packaging, and changelog discipline. |
| [11. Engineering Quality Audit Report](docs/11_ENGINEERING_QUALITY_AUDIT_REPORT.md) | Current engineering scorecard, release gates, quality rules, and residual risks. |
| [12. Signed Agent Chat Protocol](docs/12_SIGNED_AGENT_CHAT_PROTOCOL.md) | Signed thematic group chat, room manifests, retrieval, link sharing, privacy boundaries, and SDK roadmap. |
| [13. Bounty Program Technical Spec](docs/13_BOUNTY_PROGRAM_TECHNICAL_SPEC.md) | Partner bounty scope, judging criteria, and technical requirements. |
| [14. Desktop Wizard Release Artifacts](docs/14_DESKTOP_WIZARD_RELEASE_ARTIFACTS.md) | Native wizard packaging, signing, checksums, and release artifacts. |
| [15. Demo Dashboard Screenshare Runbook](docs/15_DEMO_DASHBOARD_SCREENSHARE_RUNBOOK.md) | Demo flow for hosted landing page, dashboard, wizard, and payment surfaces. |
| [16. Agent Identity Registry Pipeline](docs/16_AGENT_IDENTITY_REGISTRY_PIPELINE.md) | Registry source truth, enrichment, validation, and display pipeline. |
| [18. Premium Plugin Runtime Contracts](docs/18_PREMIUM_PLUGIN_RUNTIME_CONTRACTS.md) | Premium plugin manifest contracts, provider readiness, streams, and webhooks. |
| [19. Agentic Standards Interoperability](docs/19_AGENTIC_STANDARDS_INTEROPERABILITY.md) | MCP, A2A, marketplace, x402/pay.sh, and runtime alignment. |
| [20. Engineering Operating Model Boundaries](docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md) | Branch ownership, service contracts, release personas, and company-grade gates. |

## 9. Repository Layout

The repository is a modular monorepo. Real source code lives in `packages/*/src/`; the corresponding `src/` directories are thin compatibility wrappers (`export * from '../../packages/...'`) that preserve existing import paths.

```text
packages/
  core/              Shared runtime types, errors, logger, constants, guards, result
  config-runtime/    Runtime config, secure config manager, setup wizard, runtime doctor, client injection
  server-runtime/    MCP server factory, capability registration, server metadata
  hosted-gateway/    Streamable HTTP MCP server, public home, premium routes, rate limiter, tx relay
  local-bridge/      Local stdio MCP bridge, payment bridge process diagnostics
  mcp-adapter/       Model Context Protocol adapter compatibility layer
  schemas/           Public Zod schemas and protocol contracts
  tools/             SAP, Solana, AgentKit, SNS, profile, skill, chat, payment, perps, and premium tools
  ui-cards/          MCP Apps Card rendering, card builder, templates, protocol logos
  wizard-core/       Shared CLI and desktop wizard flow
  tool-plugin-template/  Trusted external tool-family plugin template
  adapters/          Solana connection and public key adapter utilities
  bin/               npx-safe bootstrap entrypoints for remote and local servers
  memory/            Agent memory store, tool call store, stream buffer, Hermes bridge
  observability/     Metrics collection and exporter
  perps/             Perpetual futures analytics, Adrena builders, chart indicators, risk engine
  payments/          x402 monetization, facilitator, usage ledger, pay.sh spec, pricing
  policy/            Local, Bento, and hybrid policy engines, spending limits, permission checks
  premium/           Premium runtime plugins, streams, webhooks, session management
  prompts/           MCP prompt templates for developer, payments, context, execution-proof, registry
  resources/         MCP resource templates for memory, execution-proof, reputation, profile, registry, stats
  runtime/           Module resolution and payment bridge process management
  sap/               SAP SDK client manager, types, and error classes
  security/          Private-key guard, tool permissions, prompt injection notes, approval gates
  session/           Session store, delegated sessions, agent sessions, session limits
  signer/            Local, delegated, and external signer adapters, wallet guard, policy-enforcing wallet
  solana/            Solana ATA utilities
  strategies/        Strategy store and trade journal
  transports/        stdio and HTTP transport layers
  tui/               Terminal UI wizard save helper (legacy, source in src/tui/)
```

The root `package.json` re-exports all package surfaces so consumers can import from `@oobe-protocol-labs/sap-mcp-server` without referencing internal packages directly.

## 10. License

SAP MCP Server is released under the [MIT License](LICENSE).

## 11. Partner Products

| Partner / Product | Integration |
| --- | --- |
| [@bentoguard / Bento Guard](https://github.com/bentoguard) | Optional policy layer for AI-assisted intent scoring, escalation, and hybrid local/Bento guardrails. Uses the optional `@bentoguard/sdk` package and credentials from [app.bentoguard.xyz](https://app.bentoguard.xyz). |
