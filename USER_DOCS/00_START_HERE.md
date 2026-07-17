# SAP MCP User Docs

## 1. What SAP MCP Provides

SAP MCP is the hosted and local Model Context Protocol gateway for OOBE Protocol's Synapse Agent Protocol stack. It gives MCP-compatible agents access to SAP identity, discovery, reputation, memory, SNS, x402 payment flows, Solana protocol tools, and bundled SAP skills.

Use one of two deployment modes:

| Mode | Endpoint | Best For |
| --- | --- | --- |
| Hosted remote MCP | `https://mcp.sap.oobeprotocol.ai/mcp` | Users and agents that want OOBE-hosted tools over Streamable HTTP |
| Local stdio MCP | `node dist/cli.js` or `npx sap-mcp-server` | Local development, dedicated wallet profiles, local signing |

## 2. Hosted Remote MCP Quick Start

Hosted MCP still requires a local SAP MCP profile when the agent needs to sign payments or value-moving transactions. The hosted server never receives keypair bytes. The user's machine or external signer owns the trust boundary.

Choose one setup path:

| Path | Best For | What It Does |
| --- | --- | --- |
| Native Desktop Wizard | Non-technical users and first-time setup | Downloads a guided GUI, creates the local SAP profile, detects runtimes, and configures hosted `sap` plus local `sap_payments`. |
| CLI Wizard | Developers, terminal users, servers | Runs the same setup from npm and can print or inject runtime config. |

### Native Desktop Wizard

1. Download the wizard from GitHub releases or from the hosted downloads descriptor.
2. Open the wizard and choose **Full hosted SAP MCP setup**.
3. Select detected runtimes such as Codex, Claude, Hermes, or OpenClaw.
4. Restart the agent runtime and connect to hosted SAP MCP.

Release downloads:

```txt
https://github.com/OOBE-PROTOCOL/sap-mcp/releases
https://mcp.sap.oobeprotocol.ai/wizard/downloads.json
```

More details:

```txt
https://mcp.sap.oobeprotocol.ai/docs/#/user/06_DESKTOP_GUI_WIZARD
```

### CLI Wizard

Run the wizard for a full hosted setup:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

At the first menu, choose **Full hosted SAP MCP setup** for new profiles or
**Repair hosted runtime + sap_payments bridge only** when the profile already
exists and only paid/write hosted calls are failing.

Repair without walking through the full wizard:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config repair
```

1. Full setup creates or imports the dedicated local SAP MCP wallet profile.
2. Repair keeps the active profile and only fixes OOBE `sap`/`sap_payments` runtime entries.
3. Let the wizard configure hosted `sap` plus local `sap_payments` for supported runtimes.
4. Use `sap_payments_call_paid_tool` when a hosted tool requires x402 payment.
5. Use `sap_payments_finalize_transaction` when a paid hosted builder returns an unsigned transaction to preview, sign, and optionally submit locally.

Agents can discover the same recovery path without guessing. The hosted SAP MCP
server exposes these free maintenance tools:

| Tool | Purpose |
| --- | --- |
| `sap_agent_start` | Load the canonical startup playbook. |
| `sap_skills_upgrade_plan` | Return latest-release skill upgrade commands and target directories. |
| `sap_runtime_repair_plan` | Return the pinned repair command and expected `sap_payments` bridge tools after restart. |

If an agent says the local `sap_payments` bridge is missing, ask it to call
`sap_runtime_repair_plan` before asking you to edit JSON, TOML, or YAML by hand.

Show the active profile:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config show
```

Hosted MCP URL:

```txt
https://mcp.sap.oobeprotocol.ai/mcp
```

Hosted documentation:

```txt
https://mcp.sap.oobeprotocol.ai/docs
```

Client config docs:

```txt
https://mcp.sap.oobeprotocol.ai/docs/#/user/04_CLIENT_CONFIGS
```

Payment docs:

```txt
https://mcp.sap.oobeprotocol.ai/docs/#/user/03_PAYMENTS_X402_PAYSH
```

Wizard descriptor:

```txt
https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json
```

## 3. What The Wizard Creates

The wizard creates an isolated profile under:

```txt
~/.config/mcp-sap/
```

Typical layout:

```txt
~/.config/mcp-sap/
  config.json
  config-<profile>.json
  keypairs/
    <profile>-keypair.json
```

The wizard does not modify the Solana CLI keypair unless the user explicitly points a profile at it. The recommended path is a dedicated SAP MCP keypair per agent profile.

## 4. MCP Client Setup

Use hosted remote MCP in MCP-compatible clients by pointing the client at:

```txt
https://mcp.sap.oobeprotocol.ai/mcp
```

The wizard can inject client config automatically for Claude, Hermes, OpenClaw, and Codex, or print manual snippets.

Minimal hosted MCP client concept:

```json
{
  "mcpServers": {
    "sap": {
      "url": "https://mcp.sap.oobeprotocol.ai/mcp",
      "transport": "streamable-http"
    }
  }
}
```

Codex users should not paste that JSON into `~/.codex/config.toml`. Use TOML:

```toml
[mcp_servers.sap]
url = "https://mcp.sap.oobeprotocol.ai/mcp"
```

Codex supports Streamable HTTP MCP servers with URL-based TOML entries. Use local stdio mode only when you want Codex to launch the SAP MCP process locally.

## 5. Safety Rules For Agents

Agents should follow these rules:

1. Never read keypair bytes.
2. Never print wallet secret material.
3. Use `sap_profile_current` before operational work.
4. Use preview/sign/submit flows for transactions.
5. Ask for user approval when policy requires it.
6. Treat hosted paid tools as x402/pay.sh-gated resources.
7. Load SAP MCP skills before using advanced tools.

## 6. Core User Commands

```bash
# Start the guided wizard
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard

# Show active config
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config show

# Show active profile metadata
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config profile-info

# List pending secure config changes
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config pending

# Approve or deny a protected config change
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config approve <id>
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config deny <id>

# Show audit log
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config audit
```

## 7. Docs Map

| File | Purpose |
| --- | --- |
| `01_HOSTED_REMOTE_MCP.md` | Hosted setup for users and agents |
| `02_LOCAL_STDIO_MCP.md` | Local stdio setup and wallet profile flow |
| `03_PAYMENTS_X402_PAYSH.md` | x402, pay.sh pay-per-use, and pay.sh subscriptions |
| `04_CLIENT_CONFIGS.md` | Claude, Hermes, Codex, OpenClaw config examples |
| `05_SKILLS_AND_TOOLS.md` | Skills, tool selection, and security behavior |
| `06_DESKTOP_GUI_WIZARD.md` | Desktop GUI wizard install, hosted setup, local payment bridge, and runtime behavior |
| `07_SMITHERY_AND_MARKETPLACES.md` | Smithery setup schema, marketplace usage, native x402 clients, and local bridge guidance |
