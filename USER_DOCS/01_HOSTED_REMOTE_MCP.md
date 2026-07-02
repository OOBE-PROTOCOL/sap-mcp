# Hosted Remote MCP

## 1. Endpoint

Use the OOBE-hosted SAP MCP endpoint:

```txt
https://mcp.sap.oobeprotocol.ai/mcp
```

Discovery endpoints:

```txt
https://mcp.sap.oobeprotocol.ai/
https://mcp.sap.oobeprotocol.ai/server.json
https://mcp.sap.oobeprotocol.ai/health
https://mcp.sap.oobeprotocol.ai/.well-known/agent-card.json
https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json
https://mcp.sap.oobeprotocol.ai/wizard/install.sh
https://mcp.sap.oobeprotocol.ai/favicon.png
```

The root page is safe to share publicly. It exposes professional metadata, favicon/social preview tags, and public endpoint information only. It must never expose RPC API keys, keypair paths, private VPS paths, or signer material.

Public `server.json` shape:

```json
{
  "name": "sap-mcp-server",
  "title": "SAP MCP Server | OOBE Protocol",
  "description": "Hosted Solana-native MCP gateway for Synapse Agent Protocol tools, x402/pay.sh monetization, SNS identity, and agent operations.",
  "version": "0.2.1",
  "status": "online",
  "protocol": {
    "primary": "mcp",
    "transport": "streamable-http",
    "protocolVersion": "2025-06-18"
  },
  "endpoints": {
    "landing": "https://mcp.sap.oobeprotocol.ai/",
    "mcp": "https://mcp.sap.oobeprotocol.ai/mcp",
    "health": "https://mcp.sap.oobeprotocol.ai/health",
    "serverInfo": "https://mcp.sap.oobeprotocol.ai/server.json",
    "agentCard": "https://mcp.sap.oobeprotocol.ai/.well-known/agent-card.json",
    "wizardDescriptor": "https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json",
    "wizardInstallScript": "https://mcp.sap.oobeprotocol.ai/wizard/install.sh",
    "favicon": "https://mcp.sap.oobeprotocol.ai/favicon.png"
  },
  "capabilities": {
    "tools": true,
    "resources": true,
    "prompts": true,
    "streaming": true,
    "payments": ["x402", "pay.sh"],
    "userControlledSigning": true
  },
  "authentication": {
    "schemes": ["none", "x402"],
    "bearerRequired": false
  },
  "security": {
    "keypairBytesExposed": false,
    "storesUserKeypairs": false,
    "rpcSecretsExposed": false,
    "wizardConfigDirectory": "~/.config/mcp-sap"
  },
  "docs": {
    "npm": "https://www.npmjs.com/package/@oobe-protocol-labs/sap-mcp-server",
    "github": "https://github.com/OOBE-PROTOCOL/sap-mcp",
    "userDocs": "https://github.com/OOBE-PROTOCOL/sap-mcp/tree/main/USER_DOCS"
  }
}
```

## 2. Why Hosted Users Still Need The Wizard

Hosted MCP executes tools remotely, but the user's wallet and signer should remain local or externally controlled. The wizard creates:

- an isolated SAP MCP profile;
- a dedicated wallet path or external signer reference;
- policy limits;
- optional MCP client config injection;
- local context for agents that need to sign x402/pay.sh payloads or Solana transactions.

The hosted server does not expose or store keypair bytes.

Read-only discovery can connect directly to the hosted MCP URL. Any agent that needs to sign x402/pay.sh payloads, SAP transactions, Solana transactions, SNS operations, or settlement actions should run the wizard first so the signer remains user-controlled.

If `sap_profile_current` reports `runtime.signerConfigured: false` on the hosted server, read it as a non-custodial guarantee: OOBE is not holding the user's wallet. It is not a reason to switch to local stdio automatically. Paid hosted tools should complete the x402/pay.sh payment flow from the user's local SAP profile or external signer. Use local stdio only when the user explicitly chooses local execution or the client cannot support remote Streamable HTTP/x402.

## 3. Install And Configure

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

Select hosted remote MCP when asked how the client should connect.

Then verify:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config show
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config profile-info
```

## 4. Test Hosted MCP Manually

Initialize:

```bash
curl -iN https://mcp.sap.oobeprotocol.ai/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl-smoke","version":"0.1.0"}}}'
```

Copy the returned `mcp-session-id`, then list tools:

```bash
curl -iN https://mcp.sap.oobeprotocol.ai/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: <SESSION_ID>' \
  -H 'mcp-protocol-version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## 5. Free Tool Smoke Test

```bash
curl -iN https://mcp.sap.oobeprotocol.ai/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: <SESSION_ID>' \
  -H 'mcp-protocol-version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"sap_profile_current","arguments":{}}}'
```

The RPC URL in returned metadata must be redacted if it contains query secrets.

## 6. Paid Tool Smoke Test

```bash
curl -iN https://mcp.sap.oobeprotocol.ai/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: <SESSION_ID>' \
  -H 'mcp-protocol-version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"sap_list_all_agents","arguments":{"limit":5}}}'
```

Expected result without payment proof:

```txt
HTTP/1.1 402 Payment Required
```

The response includes x402 payment instructions. Agents that support x402 can sign the payment payload and replay the exact request with the payment header.
