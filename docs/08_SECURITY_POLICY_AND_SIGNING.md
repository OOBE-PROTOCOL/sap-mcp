# 08. Security, Policy, And Signing

## 08.1 Key Material Rules

1. Never expose keypair byte arrays to agents.
2. Never print private keys in logs, CLI output, MCP resources, MCP prompts, or errors.
3. Never inject keypair bytes into Claude, Hermes, Codex, OpenClaw, or other client config.
4. Never use the Solana CLI keypair as an implicit SAP MCP wallet.
5. Use dedicated SAP MCP profile keypairs under `~/.config/mcp-sap/keypairs/`.
6. Use a separate facilitator signer for x402 facilitator operations.

## 08.2 Signer Modes

| Mode | Signing behavior |
| --- | --- |
| `readonly` | No signing. Safe for public read-only hosted deployments. |
| `local-dev-keypair` | Uses a dedicated local SAP MCP keypair. Best for local development. |
| `external-signer` | Delegates signing to an external signer service or local signing proxy. |
| `hosted-api` | Hosted server mode for API workflows where raw customer keys do not live in process. |

## 08.3 External Signing Protocol

Use external signing when a remote MCP workflow needs user-controlled signatures without uploading the user's keypair to the hosted server.

The local signing proxy exposes:

```text
GET  /sign/<profile>
POST /sign/<profile>
GET  /health
```

Set the same bearer token on both sides:

```bash
SAP_SIGNING_AUTH_TOKEN=replace-with-local-token
SAP_EXTERNAL_SIGNER_AUTH_TOKEN=replace-with-local-token
SAP_EXTERNAL_SIGNER_URL=http://127.0.0.1:8765/sign/<profile>
```

`GET /sign/<profile>` returns:

```json
{
  "publicKey": "..."
}
```

`POST /sign/<profile>` accepts:

```json
{
  "transaction": "base64-serialized-transaction",
  "sessionId": "optional-session-id"
}
```

The `<profile>` is resolved through the SAP MCP profile manager first, then through canonical keypair filenames under `~/.config/mcp-sap/keypairs/`. The signing proxy intentionally does not fall back to legacy `agents/` directories.

Recommended flow:

1. User runs `npx sap-mcp-config wizard` locally.
2. User starts `sap-signing-proxy` on `127.0.0.1`.
3. Remote workflow prepares an unsigned transaction or payload.
4. Local signer signs through `POST /sign/<profile>`.
5. The signed transaction returns to the caller without exposing keypair bytes.

## 08.4 Policy Layers

SAP MCP supports:

1. Local policy engine.
2. Bento policy engine.
3. Hybrid policy engine.
4. Spending limits.
5. Tool permission mapping.
6. Approval workflow for sensitive config changes.
7. Unsafe action guard.
8. Private-key guard.

## 08.5 Bento Policy

Bento can be enabled by profile:

```json
{
  "bento": {
    "enabled": true,
    "agentId": "sap-agent"
  },
  "policy": {
    "mode": "hybrid",
    "failOpen": false,
    "logging": true
  }
}
```

Production recommendation:

1. Use `failOpen=false`.
2. Keep local policy as a fallback boundary.
3. Log policy decisions without logging secrets.
4. Test denied, allowed, and degraded Bento paths before launch.

## 08.6 Transaction Safety

Before signing or submitting transactions, enforce:

1. Tool permission.
2. Profile mode.
3. Daily limit.
4. Max transaction value.
5. Approval threshold.
6. Network consistency.
7. Private-key guard.
8. Audit log.

Agents must ask for approval before value-moving operations when policy requires it.

## 08.7 Remote Hosted Safety

For `mcp.sap.oobeprotocol.ai`:

1. Use TLS at the reverse proxy.
2. Use `SAP_MCP_AUTH_TYPE=none` for public agent-facing MCP when x402 monetization is enabled.
3. Keep hosted payment and value-moving signatures user-controlled through the wizard-created local profile or an external signer.
4. Never ask hosted users to paste keypair bytes into an MCP client config or upload wallet files to the hosted server.
5. Keep the Node server behind `127.0.0.1` unless intentionally public.
6. Use API keys or JWTs with rotation for private beta, enterprise, admin, or non-public deployments.
7. Rate-limit abusive clients.
8. Enable x402 only after facilitator health and settlement tests pass.
9. Keep facilitator auth token private.
10. Keep facilitator signer funded only to the level required for operation.
