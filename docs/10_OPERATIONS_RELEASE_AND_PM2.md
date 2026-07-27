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

## 10.5 Hosted Provider Keys

Provider keys belong only on the hosted SAP MCP gateway. Never place them in
Codex, Hermes, Claude, OpenClaw, Smithery, MCP registry metadata, or public
wizard snippets.

For Jupiter, configure the API root, not a product endpoint:

```bash
SAP_MCP_JUPITER_API_BASE_URL=https://api.jup.ag
SAP_MCP_JUPITER_API_KEY=<server-side-jupiter-key>
SAP_MCP_JUPITER_TIMEOUT_MS=30000
```

Do not configure `/swap/v1`, `/swap/v1/quote`, `/price/v3`, or `/ultra/v1` as
the base URL. The gateway normalizes common pasted product URLs, but the
production env should stay on the root so the Client SDK can append the correct
paths.

Perps market data uses on-chain Adrena decoding by default. Hosted operators
should set the Adrena program ID and use an indexed/full-history RPC that
supports `getProgramAccounts` over Anchor account discriminators:

```bash
SAP_MCP_PERPS_ADRENA_PROGRAM_ID=13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet
SAP_MCP_PERPS_TIMEOUT_MS=8000
```

Optional perps providers can enrich market data or provide IDL-backed unsigned
transaction builders:

```bash
# SAP_MCP_PERPS_MARKETS_URL=https://provider.example/perps/markets
# SAP_MCP_PERPS_BUILDER_URL=https://provider.example/perps/build-order
# SAP_MCP_PERPS_API_KEY=<server-side-perps-provider-key>
```

If `SAP_MCP_PERPS_BUILDER_URL` is unset, `sap_perp_build_order_transaction` is
not registered and agents must stop at analysis/planning. Do not expose a
builder until it returns complete unsigned Solana transactions for local
finalization. `adrena-sdk@beta` / `adrena-sdk-ts@beta` were inspected during
0.9.38 work; the published npm tarballs include type declarations but are
missing the JavaScript runtime files required by their entrypoints, so SAP MCP
does not rely on them for production transaction construction yet.

## 10.6 Release Packaging

Recommended release model:

1. Public GitHub repository for source and docs.
2. npm package for CLI, wizard, and local server installation.
3. GitHub releases for signed artifacts and changelog.
4. Private infrastructure repo or private environment store for production secrets.

## 10.7 Changelog Discipline

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

## 10.8 Current Release Notes

Version `0.9.38` includes:

1. Local stdio and remote Streamable HTTP MCP modes.
2. Profile-managed config under `~/.config/mcp-sap`.
3. Dedicated SAP MCP wallet isolation.
4. Optional client config injection for local agents.
5. x402 monetization gate for paid hosted tool calls.
6. OOBE self-hosted x402 SVM facilitator.
7. Facilitator RPC failover through `SAP_MCP_FACILITATOR_RPC_FALLBACK_URLS` for transient endpoint failures.
8. pay.sh provider YAML generation.
9. SAP SDK, SNS, Synapse AgentKit, Solana, profile, transaction, skill, chat, and payment tools.
10. Policy engine support with local, Bento, and hybrid modes.
11. Security guardrails for private key exposure and unsafe actions.
12. Streamable HTTP cleanup bypasses for `DELETE`, `OPTIONS`, and `HEAD`.
13. Canonical x402 estimate/challenge pricing.
14. Jupiter endpoint normalization for server-side provider keys.
15. Perps provider readiness and optional unsigned builder registration.
16. Node.js `>=22.12.0` and pnpm `11.7.0` release baseline.
