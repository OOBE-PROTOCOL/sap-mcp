# 07. Endpoints And Clients

## 07.1 Remote MCP Endpoints

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/` | Public landing page with share metadata and safe endpoint information. | Public. |
| `GET` | `/server.json` | Machine-readable public server metadata. | Public. |
| `GET` | `/favicon.png` | SAP MCP favicon/social preview asset. | Public. |
| `GET` | `/health` | Health check. | No, unless reverse proxy requires it. |
| `GET` | `/.well-known/agent-card.json` | A2A-compatible discovery card. | Usually public. |
| `GET` | `/.well-known/sap-mcp-wizard.json` | Machine-readable wizard install metadata for agents that cannot see local config. | Public. |
| `GET` | `/wizard/install.sh` | Small shell launcher that runs the npm-hosted SAP MCP wizard. | Public. |
| `POST` | `/mcp` | MCP JSON-RPC requests. | Public in `SAP_MCP_AUTH_TYPE=none`; Bearer in private modes. Paid tools require x402. |
| `GET` | `/mcp` | Streamable HTTP session stream. Browser-style `Accept: text/html` receives a public preview page instead. | Same as `POST /mcp`. |
| `DELETE` | `/mcp` | Streamable HTTP session cleanup. | Same as `POST /mcp`. |

The public HTML and JSON endpoints must remain secret-free. Do not expose RPC query parameters, private VPS paths, keypair file paths, bearer tokens, facilitator auth tokens, or wallet bytes through these routes.

## 07.2 Facilitator Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/facilitator/health` | Facilitator health. |
| `GET` | `/facilitator/supported` | Supported x402 payment schemes and networks. |
| `POST` | `/facilitator/verify` | Verify a payment payload. |
| `POST` | `/facilitator/settle` | Settle a verified payment. |

Protect facilitator endpoints with `SAP_MCP_FACILITATOR_AUTH_TOKEN` outside local-only development.

## 07.3 Required Remote Headers

Public hosted agent-facing mode:

```text
Content-Type: application/json
Accept: application/json, text/event-stream
```

Private API key/JWT mode adds:

```text
Authorization: Bearer <api-key-or-jwt>
```

For paid requests, add one of:

```text
PAYMENT-SIGNATURE: <x402 payment payload>
X-PAYMENT: <x402 payment payload>
```

## 07.4 Initialize Smoke Test

```bash
curl -i https://mcp.sap.oobeprotocol.ai/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-06-18",
      "capabilities":{},
      "clientInfo":{"name":"smoke","version":"1.0.0"}
    }
  }'
```

## 07.5 Tool List Smoke Test

```bash
curl -i https://mcp.sap.oobeprotocol.ai/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/list",
    "params":{}
  }'
```

## 07.6 Local Client Config

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

## 07.7 Remote Client Config

Generic MCP client JSON:

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

Hermes global `~/.hermes/mcp.json`:

```json
{
  "sap": {
    "url": "https://mcp.sap.oobeprotocol.ai/mcp",
    "transport": "streamable-http"
  }
}
```

Hermes profile YAML:

```yaml
mcp_servers:
  sap:
    url: https://mcp.sap.oobeprotocol.ai/mcp
    transport: streamable-http
```

Do not nest `mcpServers.sap` under a Hermes `mcp_servers.sap` entry.

## 07.8 MCP Client Behavior

Clients should:

1. Use the server's language behavior when responding to users.
2. Not assume devnet or mainnet from old local environment variables.
3. Read the profile/context tools before making network claims.
4. Treat keypair files as secret material.
5. Retry paid calls with x402 headers only when the server returns payment requirements.
6. If local `~/.config/mcp-sap` config is missing or inaccessible, send the user to `/.well-known/sap-mcp-wizard.json` or `/wizard/install.sh` instead of asking for keypair bytes.
