# SAP MCP Server

Production-oriented Model Context Protocol server for OOBE Synapse Agent Protocol, Solana, Synapse AgentKit, SNS, and monetized hosted agent workflows.

SAP MCP exposes the same typed tool registry through two supported MCP launch modes:

1. Local stdio for desktop agents and local development.
2. Remote Streamable HTTP at `/mcp` for hosted customers and orchestrators.

It also includes a professional setup wizard, profile-managed config under `~/.config/mcp-sap`, optional Bento policy integration, local and external signing modes, x402 monetization, a self-hosted OOBE facilitator, pay.sh provider YAML generation, and an A2A-compatible discovery card.

User-facing setup docs live in [`USER_DOCS/`](USER_DOCS/00_START_HERE.md). Operator and engineering docs live in [`docs/`](docs/00_README.md).

## 1. Status

| Area | Current behavior |
| --- | --- |
| Package version | `0.2.1` |
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

Inspect the active profile:

```bash
npx sap-mcp-config show
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
args = ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server", "sap-mcp-server"]
enabled_tools = ["sap_payments_call_paid_tool", "sap_payments_prepare_challenge", "sap_payments_sign_challenge", "sap_payments_verify_receipt", "sap_x402_paid_call", "sap_profile_current", "sap_x402_estimate_cost"]
tool_timeout_sec = 300

[mcp_servers.sap_payments.env]
SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = "false"
SAP_ALLOWED_TOOLS = "sap_payments_call_paid_tool,sap_payments_prepare_challenge,sap_payments_sign_challenge,sap_payments_verify_receipt,sap_x402_paid_call,sap_profile_current,sap_x402_estimate_cost"
SAP_LOG_LEVEL = "info"
```

On Windows, use `command = "npx.cmd"`. The wizard can write this automatically.

Codex supports Streamable HTTP MCP servers with URL-based entries in `config.toml`. Use local stdio through `npx` only when you specifically want Codex to launch the local SAP MCP process:

```toml
[mcp_servers.sap]
command = "npx"
args = ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server", "sap-mcp-server"]

[mcp_servers.sap.env]
SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = "false"
SAP_LOG_LEVEL = "info"
```

On Windows, use `command = "npx.cmd"`.

See [04. Local Stdio Usage](docs/04_LOCAL_STDIO_USAGE.md).

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
GET     /wizard/install.sh
POST    /mcp
GET     /mcp
DELETE  /mcp
```

`GET /` is a public, share-safe landing page with Open Graph/Twitter metadata. It exposes only public server information; keypair bytes, private wallet paths, RPC query secrets, and VPS-local paths must never appear there.

`GET /docs` serves the public documentation site for install, start, configuration, hosted remote MCP, x402/pay.sh payments, and MCP client setup.

See [05. Remote VPS Deployment](docs/05_REMOTE_VPS_DEPLOYMENT.md) and [07. Endpoints And Clients](docs/07_ENDPOINTS_AND_CLIENTS.md).

## 6. Monetization

Hosted HTTP deployments can require payment for paid `tools/call` requests while leaving local stdio and base MCP protocol calls free.

Initial model:

| Tier | Examples | Price |
| --- | --- | --- |
| Free | `tools/list`, `prompts/list`, `resources/list`, `sap_profile_current`, base overview | Free |
| Premium read | `sap_list_all_agents`, enriched network stats, indexed discovery | `$0.007` to `$0.01` |
| Builder or batch | complex builders, SNS/domain batch checks, enriched analytics | `$0.01` to `$0.10` |
| Value action | selected value-linked operations | fixed `$0.20` plus optional `0.5%` |

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

See [06. Payments, x402, And pay.sh](docs/06_PAYMENTS_X402_AND_PAYSH.md).

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

Start with [00. Documentation Index](docs/00_README.md).

| Document | Purpose |
| --- | --- |
| [01. Product Overview](docs/01_PRODUCT_OVERVIEW.md) | Product model, users, public/private repo guidance, and wizard distribution. |
| [02. Architecture And Request Flow](docs/02_ARCHITECTURE_AND_REQUEST_FLOW.md) | Runtime modules, local flow, remote flow, signing, payments, and trust boundaries. |
| [03. Configuration And Wizard](docs/03_CONFIGURATION_AND_WIZARD.md) | Profile manager, wizard, wallet isolation, client injection, and config CLI. |
| [04. Local Stdio Usage](docs/04_LOCAL_STDIO_USAGE.md) | Local setup for Claude, Hermes, Codex, OpenClaw, and development agents. |
| [05. Remote VPS Deployment](docs/05_REMOTE_VPS_DEPLOYMENT.md) | Hosted deployment, reverse proxy, PM2, and customer onboarding. |
| [06. Payments, x402, And pay.sh](docs/06_PAYMENTS_X402_AND_PAYSH.md) | Pricing, x402 gate, pay.sh provider YAML, facilitator signer, and settlement. |
| [07. Endpoints And Clients](docs/07_ENDPOINTS_AND_CLIENTS.md) | HTTP endpoints, headers, smoke tests, and client examples. |
| [08. Security, Policy, And Signing](docs/08_SECURITY_POLICY_AND_SIGNING.md) | Key material rules, signer modes, Bento policy, and transaction safety. |
| [09. Tools, Skills, And Agent Guide](docs/09_TOOLS_SKILLS_AND_AGENT_GUIDE.md) | Tool families, SDK doc pointers, skills, and agent behavior. |
| [10. Operations, Release, And PM2](docs/10_OPERATIONS_RELEASE_AND_PM2.md) | Quality gates, PM2, secrets, release packaging, and changelog discipline. |
| [11. Code Quality Audit](docs/11_CODE_QUALITY_AUDIT.md) | Current engineering scorecard, release gates, quality rules, and residual risks. |
| [12. On-Chain Agent Chat](docs/12_ONCHAIN_AGENT_CHAT.md) | Signed thematic group chat, room manifests, retrieval, link sharing, privacy boundaries, and SDK roadmap. |

## 9. Repository Layout

```text
src/
  adapters/      MCP and Solana adapter helpers
  config/        Runtime config, secure config manager, setup wizard pipeline
  core/          Shared runtime types, errors, logger, constants
  payments/      x402 monetization, facilitator, usage ledger, pay.sh spec
  policy/        Local, Bento, and hybrid policy engines
  remote/        Streamable HTTP MCP server
  resources/     MCP resources
  security/      Private-key, unsafe-action, and permission guards
  server/        MCP server factory and capability registration
  signer/        Local, delegated, and external signer adapters
  tools/         SAP, Solana, AgentKit, SNS, profile, skill, chat, and payment tools
  transports/    stdio and local HTTP transport helpers
```

## 10. License

SAP MCP Server is released under the [MIT License](LICENSE).

## 11. Partner Products

| Partner / Product | Integration |
| --- | --- |
| [@bentoguard / Bento Guard](https://github.com/bentoguard) | Optional policy layer for AI-assisted intent scoring, escalation, and hybrid local/Bento guardrails. Uses the optional `@bentoguard/sdk` package and credentials from [app.bentoguard.xyz](https://app.bentoguard.xyz). |
