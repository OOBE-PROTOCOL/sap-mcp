# Local Stdio MCP

## 1. When To Use Local Mode

Use local stdio mode when:

- the MCP client does not support remote Streamable HTTP;
- the user wants the entire MCP server running locally;
- transaction signing must happen on the user's machine;
- development or integration testing needs local logs.

## 2. Create A Profile

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

Recommended mode for local non-transactional inspection:

```txt
readonly
```

Recommended mode for local signing with a dedicated SAP wallet:

```txt
local-dev-keypair
```

Recommended mode for hardware/KMS/managed signers:

```txt
external-signer
```

## 3. Start Local MCP

Installed package:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-server
```

From a cloned repo:

```bash
pnpm install --frozen-lockfile
pnpm run build
node dist/bin/sap-mcp-server.js
```

## 4. Config Directory

SAP MCP uses:

```txt
~/.config/mcp-sap
```

Do not use the legacy path:

```txt
~/.config/sap-mcp
```

Do not store SAP MCP keypairs in:

```txt
~/.config/solana/id.json
```

unless the user intentionally chooses to reuse the Solana CLI identity.

## 5. Local Client Config Concept

```json
{
  "mcpServers": {
    "sap": {
      "command": "node",
      "args": ["/absolute/path/to/sap-mcp-server/dist/bin/sap-mcp-server.js"],
      "cwd": "/absolute/path/to/sap-mcp-server",
      "env": {
        "SAP_MCP_PROFILE": "default"
      }
    }
  }
}
```

The wizard can generate or inject the correct client config.
