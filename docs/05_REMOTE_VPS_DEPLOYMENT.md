# 05. Remote Hosted Deployment

## 05.1 Public Documentation Boundary

This document is intentionally public-safe. It describes the supported hosted deployment shape without exposing OOBE's live VPS layout, private ports, private process names, secret names, signer paths, production RPC providers, or infrastructure topology.

Keep the real deployment runbook, PM2 ecosystem file, reverse-proxy config, firewall rules, signer paths, payment recipient addresses, facilitator auth tokens, and RPC credentials in a private infrastructure repository or secret manager.

## 05.2 Deployment Goal

Remote mode exposes SAP MCP over Streamable HTTP at a hosted `/mcp` endpoint. Public hosted deployments should run behind:

1. TLS termination.
2. Reverse proxy access control.
3. Rate limiting.
4. Policy checks.
5. x402 monetization for paid `tools/call` requests.
6. Private server-to-server authentication for facilitator traffic when applicable.
7. Centralized logs and monitoring that do not expose secrets.

## 05.3 Build Gates

Run release gates before publishing or deploying:

```bash
pnpm run typecheck
pnpm run lint
pnpm test -- --run
pnpm run build
npm pack --dry-run
```

The aggregate release command is:

```bash
pnpm run verify:release
```

## 05.4 Runtime Configuration

Production runtime values must be injected from a private environment store, not hard-coded in public docs.

Required categories:

1. Hosted profile name.
2. Bind host and port for the private Node listener.
3. Public base URL used in discovery responses.
4. Remote auth mode for public or private deployments.
5. Solana RPC provider.
6. Monetization settings.
7. Facilitator URL and facilitator auth token when x402 is enabled.
8. Logging format and retention settings.

Public agent-facing deployments can run without Bearer auth when x402, rate limits, and policy are enabled. Private beta, enterprise, admin, and non-public deployments should use API key or JWT auth.

## 05.5 Public Routes

Expose only the required public routes through the reverse proxy:

```text
GET     /health
GET     /.well-known/agent-card.json
GET     /.well-known/sap-mcp-wizard.json
GET     /wizard/install.sh
POST    /mcp
GET     /mcp
DELETE  /mcp
```

Facilitator routes should be exposed only when required by the selected x402 architecture and protected with private facilitator authentication:

```text
GET     /facilitator/health
GET     /facilitator/supported
POST    /facilitator/verify
POST    /facilitator/settle
```

Do not publish the private reverse-proxy file, internal listener ports, private upstream names, or live facilitator auth values.

## 05.6 Process Management

Run the remote MCP server and facilitator under a process manager such as PM2, systemd, or a container supervisor.

Recommended rules:

1. Keep the production process file outside the public repository.
2. Store secrets in the host secret manager or private environment file.
3. Use structured logs.
4. Rotate logs.
5. Restart on crash.
6. Alert on health-check failures, payment verification failures, and unexpected auth failures.
7. Never commit production PM2 ecosystem files containing real environment values.

The public `ecosystem.config.example.cjs` is a shape reference only. Copy it into private infrastructure and replace every placeholder from your secret store before deployment.

## 05.7 Hosted Customer Onboarding

Hosted user signing/payment onboarding:

1. Install the npm package or release artifact that includes `sap-mcp-config` and `sap-mcp-wizard`.
2. Run `npx sap-mcp-config wizard`.
3. Create or import a dedicated SAP MCP wallet under `~/.config/mcp-sap/keypairs/`, or configure an external signer.
4. Configure the agent client with the hosted MCP URL.
5. Paid x402/pay.sh flows and value-moving tools sign with the user-controlled signer, not with the hosted OOBE server keypair.
6. No Bearer token is required in public agent-facing mode.

Agents that cannot see local OS config should direct the user to the hosted wizard endpoint:

```bash
curl -fsSL https://mcp.sap.oobeprotocol.ai/wizard/install.sh | sh
```

They can inspect machine-readable wizard metadata at:

```text
https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json
```

Read-only hosted discovery:

1. Use the hosted MCP URL.
2. No local signer is required for free read-only calls.
3. Optional skills/docs pack improves agent behavior.

## 05.8 Production Profile Mode

For public hosting, avoid loading customer private keypairs into the remote process.

Recommended modes:

1. `readonly` for read-only hosted discovery.
2. `hosted-api` for server-side hosted operations governed by explicit product policy.
3. `external-signer` when customer signing must happen outside the MCP server process.

The hosted server is transport, policy, discovery, and payment verification infrastructure. It is not a custodial wallet service for customer keypairs.
