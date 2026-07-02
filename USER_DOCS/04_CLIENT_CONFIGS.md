# MCP Client Configuration

## 1. Hosted Remote MCP

Use this when the client supports remote Streamable HTTP MCP and expects a root
`mcpServers` object:

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

## 2. Hosted Hermes Configs

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
    url: https://mcp.sap.oobeprotocol.ai/mcp
    transport: streamable-http
```

Do not nest `mcpServers.sap` inside a Hermes `mcp_servers.sap` block.

## 3. Local Stdio MCP

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
        "SAP_LOG_LEVEL": "info"
      }
    }
  }
}
```

## 4. Local Hermes YAML Concept

```yaml
mcp_servers:
  sap:
    command: node
    args:
      - /absolute/path/to/sap-mcp-server/dist/bin/sap-mcp-server.js
    cwd: /absolute/path/to/sap-mcp-server
    env:
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: "false"
      SAP_LOG_LEVEL: info
```

## 5. Local Codex TOML Concept

```toml
[mcp_servers.sap]
command = "node"
args = ["/absolute/path/to/sap-mcp-server/dist/bin/sap-mcp-server.js"]
cwd = "/absolute/path/to/sap-mcp-server"

[mcp_servers.sap.env]
SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = "false"
SAP_LOG_LEVEL = "info"
```

## 6. Wizard Injection

The wizard can automatically detect and update supported client config files. If a SAP MCP entry already exists, the wizard should show the existing config and ask whether to merge, override, skip, or print manual instructions.

Run:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```
