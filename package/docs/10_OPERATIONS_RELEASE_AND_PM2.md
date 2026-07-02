# 10. Operations, Release, And PM2

## 10.1 Required Quality Gates

Use Node.js `>=22.12.0` and pnpm `11.7.0`. Source installs must use pnpm, not npm:

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
```

Before release:

```bash
pnpm audit --audit-level moderate
pnpm run typecheck
pnpm run lint
pnpm test -- --run
pnpm run build
npm pack --dry-run
```

or run the aggregate release gate:

```bash
pnpm run verify:release
```

For remote deployments, also run MCP smoke tests against `/mcp`.

## 10.2 Process Manager Policy

The repo ships `ecosystem.config.example.cjs` as a shape reference without live secrets. Do not publish the real production ecosystem file, host paths, listener ports, signer paths, RPC credentials, payment recipient, or facilitator auth values.

Production process definitions should live in a private infrastructure repository or host-level secret manager.

## 10.3 PM2 Commands

```bash
pm2 start <private-ecosystem-file>
pm2 status
pm2 logs <process-name>
pm2 restart <process-name> --update-env
pm2 save
pm2 startup
```

## 10.4 Secrets

Do not commit:

1. `.env` files with live secrets.
2. API keys.
3. JWT secrets.
4. Facilitator auth tokens.
5. Keypair JSON files.
6. PM2 ecosystem files containing production secrets.
7. Customer configuration files.

Use server-side secret management or private deployment files outside the public repo.

## 10.5 Release Packaging

Recommended release model:

1. Public GitHub repository for source and docs.
2. npm package for CLI, wizard, and local server installation.
3. GitHub releases for signed artifacts and changelog.
4. Private infrastructure repo or private environment store for production secrets.

## 10.6 Changelog Discipline

Each release should document:

1. Runtime tool count.
2. SDK versions.
3. Transport changes.
4. Config and wizard changes.
5. Security changes.
6. Payment changes.
7. Breaking changes.
8. Migration notes.
9. Verification commands and results.

## 10.7 Current Release Notes

Version `0.2.0` includes:

1. Local stdio and remote Streamable HTTP MCP modes.
2. Profile-managed config under `~/.config/mcp-sap`.
3. Dedicated SAP MCP wallet isolation.
4. Optional client config injection for local agents.
5. x402 monetization gate for paid hosted tool calls.
6. OOBE self-hosted x402 SVM facilitator.
7. pay.sh provider YAML generation.
8. SAP SDK, SNS, Synapse AgentKit, Solana, profile, transaction, skill, chat, and payment tools.
9. Policy engine support with local, Bento, and hybrid modes.
10. Security guardrails for private key exposure and unsafe actions.
11. Clean `pnpm audit --audit-level moderate` dependency graph.
12. Node.js `>=22.12.0` and pnpm `11.7.0` release baseline.
