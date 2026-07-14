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

Run the wizard:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

For non-technical users, download the Desktop GUI Wizard from GitHub releases:

```txt
https://github.com/OOBE-PROTOCOL/sap-mcp/releases
```

The Desktop GUI Wizard creates the same profile and signer setup as the CLI wizard, then can configure hosted MCP plus the local SAP MCP `sap_payments` bridge for supported agent runtimes.

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
