# 04. Local Stdio Usage

## 04.1 When To Use Local Mode

Use local stdio when the MCP server runs on the same machine as the agent client:

1. Claude Desktop.
2. Hermes.
3. Codex.
4. OpenClaw.
5. Cursor or another local MCP client.
6. Local development and smoke testing.

## 04.2 Install And Build

From the repo:

```bash
pnpm install
pnpm run build
```

From a published package:

```bash
npm install -g @oobe-protocol-labs/sap-mcp-server
```

## 04.3 Create A Profile

```bash
npx sap-mcp-config wizard
```

Then inspect it:

```bash
npx sap-mcp-config show
npx sap-mcp-config pubkey
npx sap-mcp-config profiles
```

## 04.4 Start Local MCP

From source:

```bash
node dist/cli.js
```

From an installed package:

```bash
sap-mcp-server
```

## 04.5 Client Config Examples

### Claude Desktop

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

### Hermes

```yaml
mcp_servers:
  sap:
    command: sap-mcp-server
    env:
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: "false"
      SAP_LOG_LEVEL: info
```

### Source Checkout

```yaml
mcp_servers:
  sap:
    command: node
    args:
      - /path/to/sap-mcp-server/dist/cli.js
    cwd: /path/to/sap-mcp-server
    env:
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: "false"
      SAP_LOG_LEVEL: info
```

## 04.6 What The Agent Should See

The agent may see:

1. Loaded profile name.
2. Network and RPC URL.
3. Program ID.
4. Signer public key.
5. Agent public key or PDA.
6. Config path.
7. A statement that secret material is never exposed.

The agent must not read, print, summarize, or reveal keypair byte arrays.

## 04.7 Local Signing

Local signing requires a profile in `local-dev-keypair` mode or a configured external signer.

Use local signing only when the machine operator controls the wallet and understands the risk. Remote hosted production should prefer `readonly`, `hosted-api`, or `external-signer` boundaries.
