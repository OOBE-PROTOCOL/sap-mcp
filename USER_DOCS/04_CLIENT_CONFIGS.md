# MCP Client Configuration

## 1. Hosted Remote MCP

Use this when the client supports remote Streamable HTTP MCP and expects a root
`mcpServers` object. Do not paste this JSON into Codex `config.toml`.

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

## 2. Hosted Codex TOML

Codex supports Streamable HTTP MCP servers and uses TOML config, usually at:

- macOS/Linux: `~/.codex/config.toml`
- Windows: `%USERPROFILE%\.codex\config.toml`

Use this hosted remote entry:

```toml
[mcp_servers.sap]
url = "https://mcp.sap.oobeprotocol.ai/mcp"
```

Paid/write tools also need a local non-custodial payment bridge. The wizard can
write both entries automatically. Choose:

```txt
Configure Codex automatically: hosted sap + local sap_payments bridge
```

The final Codex setup should look like this:

```toml
[mcp_servers.sap]
url = "https://mcp.sap.oobeprotocol.ai/mcp"

[mcp_servers.sap_payments]
command = "npx.cmd"
args = ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server@0.9.10", "sap-mcp-server"]
startup_timeout_sec = 300
tool_timeout_sec = 300

[mcp_servers.sap_payments.env]
SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = "false"
SAP_MCP_PAYMENTS_BRIDGE_ONLY = "true"
SAP_ALLOWED_TOOLS = "all"
SAP_LOG_LEVEL = "info"
```

On macOS/Linux, use `command = "npx"` instead of `npx.cmd`.

Restart Codex after editing the file. Do not paste the JSON `mcpServers`
snippet into Codex; Codex expects TOML. If you specifically want Codex to start
the complete local stdio SAP MCP process instead of using the hosted endpoint, use:

```toml
[mcp_servers.sap]
command = "npx.cmd"
args = ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server@0.9.10", "sap-mcp-server"]

[mcp_servers.sap.env]
SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = "false"
SAP_LOG_LEVEL = "info"
```

On macOS/Linux, use `command = "npx"` instead of `npx.cmd`.

## 3. Hosted Hermes Configs

Hermes global `~/.hermes/mcp.json` uses flat server entries:

```json
{
  "sap": {
    "url": "https://mcp.sap.oobeprotocol.ai/mcp",
    "transport": "streamable-http"
  }
}
```

Hermes profile YAML uses `mcp_servers` with a flat server block:

```yaml
mcp_servers:
  sap:
    url: "https://mcp.sap.oobeprotocol.ai/mcp"
    transport: "streamable-http"
```

Do not nest `mcpServers.sap` inside a Hermes `mcp_servers.sap` block.

## 4. Local Stdio MCP

Use this when the client requires stdio:

```json
{
  "mcpServers": {
    "sap": {
      "command": "node",
      "args": ["/absolute/path/to/sap-mcp-server/dist/bin/sap-mcp-server.js"],
      "cwd": "/absolute/path/to/sap-mcp-server",
      "env": {
        "SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE": "false",
        "SAP_MCP_PAYMENTS_BRIDGE_ONLY": "true",
        "SAP_LOG_LEVEL": "info"
      }
    }
  }
}
```

## 5. Local Hermes YAML Concept

```yaml
mcp_servers:
  sap:
    command: node
    args:
      - /absolute/path/to/sap-mcp-server/dist/bin/sap-mcp-server.js
    cwd: /absolute/path/to/sap-mcp-server
    env:
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: "false"
      SAP_MCP_PAYMENTS_BRIDGE_ONLY: "true"
      SAP_LOG_LEVEL: info
```

## 6. Local Codex TOML Concept

```toml
[mcp_servers.sap]
command = "node"
args = ["/absolute/path/to/sap-mcp-server/dist/bin/sap-mcp-server.js"]
cwd = "/absolute/path/to/sap-mcp-server"

[mcp_servers.sap.env]
SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = "false"
SAP_MCP_PAYMENTS_BRIDGE_ONLY = "true"
SAP_LOG_LEVEL = "info"
```

## 7. Wizard Injection

The wizard can automatically detect and update supported client config files. If a SAP MCP entry already exists, the wizard should show the existing config and ask whether to merge, override, skip, or print manual instructions.

Run:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

## 8. Local SAP MCP Payment Bridge

Hosted SAP MCP paid tools return an x402 challenge. Some agent runtimes expose remote MCP tools but do not yet have a native x402 replay path. The wizard configures a local `sap_payments` MCP bridge for Hermes, Claude, Codex, OpenClaw, or custom runtimes. It can also install a reference bundle for repair/custom clients:

```txt
~/.config/mcp-sap/addons/x402-paid-call
```

Normal agents should call `sap_payments_call_paid_tool` through the local `sap_payments` bridge. The standalone command is a terminal/custom-wrapper fallback:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-x402-paid-call \
  --tool sap_list_all_agents \
  --arguments '{"limit":5}' \
  --max-usd 0.02 \
  --confirm
```

For Codex, the recommended runtime integration is the local `sap_payments` MCP
bridge shown above. It exposes only:

```txt
sap_payments_readiness
sap_payments_call_paid_tool
sap_payments_call_external_x402
sap_payments_finalize_transaction
sap_payments_prepare_challenge
sap_payments_sign_challenge
sap_payments_verify_receipt
sap_x402_paid_call
```

Use `sap_payments_finalize_transaction` when a hosted builder returns
`transactionBase64`, `transaction`, or another unsigned Solana transaction. Do
not create temporary signing scripts, read keypair JSON, or ask the hosted
server to sign user-owned transactions.

For Claude Code, use the official MCP CLI pattern:

```bash
claude mcp add --transport http sap https://mcp.sap.oobeprotocol.ai/mcp
claude mcp add --transport stdio sap_payments -- npx --yes --package @oobe-protocol-labs/sap-mcp-server@0.9.10 sap-mcp-server
```

Set `SAP_MCP_PAYMENTS_BRIDGE_ONLY=true` and `SAP_ALLOWED_TOOLS=all` in the
local bridge environment if your Claude runtime exposes environment
configuration. The bridge-only flag keeps the local process focused on payment
retries while `all` prevents future payment helper tools from being hidden by a
stale allow-list.

Legacy Hermes command-wrapper concept:

```json
{
  "plugins": {
    "x402_paid_call": {
      "command": "sap-mcp-x402-paid-call",
      "description": "Pay and retry hosted SAP MCP x402 tool calls with the active local SAP MCP profile.",
      "args": [],
      "env": {
        "SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE": "false"
      }
    }
  }
}
```

Preferred local MCP tool call:

```json
{
  "name": "sap_payments_call_paid_tool",
  "arguments": {
    "toolName": "sap_list_all_agents",
    "arguments": { "limit": 5 },
    "maxPriceUsd": 0.02,
    "confirm": true
  }
}
```

Do not add wallet paths, keypair bytes, RPC API keys, or profile-specific overrides to hosted MCP client config. Hosted MCP config points to `https://mcp.sap.oobeprotocol.ai/mcp`; the local `sap_payments` bridge signs only the payment payload on the user's machine.
