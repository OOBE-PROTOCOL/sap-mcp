# Branch & CI/CD Strategy

## Branch model

```
main          ← production-ready, tagged releases only
develop       ← integration branch, PRs merge here first
release/*     ← optional release prep branches (release/0.9.74)
feature/*     ← short-lived feature branches → PR to develop
hotfix/*      ← urgent fixes → PR to main + cherry-pick to develop
```

### Flow

1. **Feature work**: branch from `develop` → PR back to `develop`
2. **Release prep**: branch `release/<version>` from `develop` → bump version, CHANGELOG → merge to `main` + tag
3. **Hotfix**: branch from `main` → fix → PR to `main` + tag → cherry-pick to `develop`
4. **Desktop builds**: triggered automatically on tag push, binary artifacts published to GitHub Release

## Component branch prefixes

Use component-scoped branches so hosted MCP, local bridge, wizard, UI, payments,
and protocol tools can move independently without losing one-repo coherence.

| Branch prefix | Scope | Primary paths | Required review focus |
| --- | --- | --- | --- |
| `feature/hosted-mcp/*` | Hosted Streamable HTTP MCP gateway | `src/remote/`, `src/transports/http.ts`, `src/server/`, `src/payments/hosted-tool-eligibility.ts` | MCP protocol compatibility, auth mode, rate limits, x402 challenge behavior, no signer custody. |
| `feature/local-bridge/*` | Local stdio MCP and payment/signing bridge | `src/bin/`, `src/transports/stdio.ts`, `src/signer/`, `src/policy/`, `src/memory/` | Key isolation, local-only signing, policy checks, profile resolution, bridge-only tool allow-list. |
| `feature/wizard/*` | CLI/TUI/Desktop onboarding | `src/config/`, `src/tui/`, `src/wizard-core/`, `apps/desktop/`, `USER_DOCS/` | Normie/dev/agent flow clarity, config merge safety, detected runtimes, recovery mode. |
| `feature/mcp-apps-ui/*` | MCP Apps Cards and public visual output | `src/ui/`, `src/adapters/mcp/`, `src/remote/public-home/` | `ui://` resource validity, HTML escaping, structured content, accessible card fallback. |
| `feature/payments-x402/*` | x402/pay.sh monetization and paid tool bridge | `src/payments/`, `packages/tools/src/x402-paid-call-tool.ts`, `docs/06_X402_PAYSH_MONETIZATION_SETTLEMENT.md` | Pricing source of truth, replay flow, receipt validation, spending caps, recovery text. |
| `feature/protocol-tools/*` | Solana/SAP/DeFi tool families | `packages/tools/src/`, `src/sap/`, `src/perps/`, `src/resources/`, `packages/schemas/src/` | Transaction preview, unsigned builder boundaries, protocol invariants, test fixtures. |
| `feature/integrations/*` | External agent/runtime integrations | `integration/`, `src/config/mcp-client-injection.ts`, `docs/07_HTTP_ENDPOINTS_MCP_CLIENTS_SMOKE_TESTS.md` | Client-specific config format, safe merge, pinned package version, repair path. |
| `feature/release-ops/*` | CI/CD, packaging, docs, release automation | `.github/`, `scripts/`, `docs/`, `package.json` | Release gates, artifact integrity, branch policy, package surface, changelog. |

For larger initiatives, create one epic branch such as
`feature/wizard/company-onboarding` and land smaller PRs behind it only when the
epic branch is protected by the same CI gates as `develop`. Do not mix hosted
gateway changes with local signer or wizard changes in the same PR unless the
contract change requires both.

Pull requests must use `.github/pull_request_template.md`. The template is
contract-checked by `config/branch-review-contracts.json` so every PR declares
the primary service boundary, hosted `sap` impact, local `sap_payments` impact,
changed contracts, verification commands, docs/release notes, secret/custody
safety, and normie/developer/agent recovery impact.

## Service contracts

| Service boundary | Contract that must stay stable |
| --- | --- |
| Hosted MCP | `/mcp`, `/server.json`, `/pricing.json`, `/.well-known/agent-card.json`, `/.well-known/sap-mcp-wizard.json`, `/.well-known/sap-mcp-tool-catalog.json`, x402 challenge shape, MCP `tools/list` and `tools/call` results. |
| Local bridge | `sap_payments_*` tools, local profile path policy, signer policy, bridge-only environment variables, no keypair bytes in MCP output. |
| Wizard | Same profile/config model across CLI, TUI, and Desktop; safe client config merge; hosted `sap` plus local `sap_payments` routing. |
| MCP Apps UI | Embedded `ui://` HTML resource plus JSON `structuredContent`; graceful fallback to text/JSON for clients without Apps support. |
| Release artifacts | npm tarball, GitHub desktop artifacts, checksums, changelog, user docs, engineering docs. |

Any PR that changes one of these contracts needs either a backward-compatible
migration note or a breaking-change entry in the release branch changelog.

## CI/CD workflows

| Workflow | File | Triggers | Purpose |
|---|---|---|---|
| **CI** | `ci.yml` | push to main/develop, PR to main/develop | typecheck, lint, architecture, tool modules, workspace packages, package boundaries, tool plugin template, skill workflow contracts, company readiness, readiness report, test, build, package exports, npm pack dry-run, audit |
| **CodeQL** | GitHub default setup | push, PR, weekly cron | security analysis (JS/TS + Actions) — configured in repo Settings → Security → Code security |
| **Desktop Release** | `desktop-release.yml` | tag push, workflow_dispatch | build desktop binaries, publish to GitHub Release |

### CI (`ci.yml`)

- Runs on: Ubuntu and Windows with full typecheck, lint, architecture, tool module, workspace package, package boundary, tool plugin template, skill workflow contract, company readiness, readiness report, test, build, package export, and npm pack dry-run gates.
- Audit: `pnpm audit --audit-level high --prod` (production deps only)
- Concurrency group cancels stale runs on same ref

### Local release gates

Use the offline gate while iterating:

```bash
pnpm run verify:release:offline
```

Check internal package extraction contracts directly when moving boundaries:

```bash
pnpm run verify:workspace-packages
```

Check that physical packages do not import legacy compatibility wrappers:

```bash
pnpm run verify:package-boundaries
```

Check the trusted external tool-family template before adding or changing plugin
examples:

```bash
pnpm run verify:tool-plugin-template
```

Check the shared tool execution pipeline before adding or migrating tool
families:

```bash
pnpm run verify:tool-execution-pipeline
```

Check skill workflow contracts directly when changing bundled skills, routing
docs, branch policy, or agent-facing setup instructions:

```bash
pnpm run verify:skill-workflows
```

Check the requirement-to-evidence company readiness matrix before claiming an
A++ release posture:

```bash
pnpm run verify:company-readiness
```

Generate the unified release readiness report directly when reviewing branches:

```bash
pnpm run verify:readiness-report
```

The report joins tool module validation, runtime tool catalogs, MCP Apps Card
coverage, package subpath contracts, workspace package contracts, tool plugin
template typecheck status, tool execution pipeline adoption, skill workflow contracts, company readiness
requirements, workflow command coverage, branch prefixes, service contracts,
and release personas.

Use the full release gate before tagging or publishing:

```bash
pnpm run verify:release
```

The full gate runs typecheck, lint, architecture boundaries, tool module
validation, workspace package contracts, package boundary checks, tool plugin template typecheck, skill
workflow contracts, company readiness, readiness report, test, build, package
export verification, npm pack dry-run, and production dependency audit at
`moderate` severity.

### Architecture boundaries

The monorepo has internal package boundaries under `packages/*`. Before moving
code between service boundaries, update `config/architecture-boundaries.json`
and run:

```bash
pnpm run check:architecture
```

The release gate runs this check automatically before the full test suite.

### Desktop Release (`desktop-release.yml`)

- Triggers on: tag push (`*`) or manual dispatch
- Matrix: macOS 15, Windows 2025, Ubuntu 24.04
- Verify gates: typecheck + lint + architecture + tool modules + workspace packages + package boundaries + tool plugin template + skill workflow contracts + company readiness + readiness report + test + build + exports + npm pack dry-run
- Audit: production deps only, high severity
- Publish job: downloads all 3 OS artifacts, generates SHA256 checksums, attaches to GitHub Release
- Signing: optional (uses secrets if available, warns if unsigned)

## Secrets management

The `.gitignore` excludes:
- `.env`, `.env.local`, `.env.*.local`
- `*.pem`, `*.key`, `*.p8`, `*.p12`, `*.secret`
- `*keypair*.json`, `*wallet*.json`, `id.json`
- `keypairs/`, `wallets/`
- `sap-mcp-premium-private/` (separate private repo)
- `PRIVATE_VPS_DOCS/`, `*.private.md`

GitHub Actions secrets (configured in repo settings):
- `MACOS_CSC_LINK`, `MACOS_CSC_KEY_PASSWORD` — macOS code signing
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — notarization
- `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD` — Windows code signing

## Tag convention

Tags are plain version numbers: `0.9.74` (NOT `v0.9.74`).

Release branches may use plain SemVer or prerelease names:

```txt
release/0.9.75
release/0.9.75-rc.1
```

Public final tags stay plain version numbers.

## Binary artifacts

Desktop binaries are built by CI and published to GitHub Releases only.
They are never committed to the repo. The `release/` directory is gitignored.

Local builds: `pnpm run desktop:build` outputs to `release/desktop/`.
