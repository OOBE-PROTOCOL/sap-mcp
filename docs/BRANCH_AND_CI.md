# Branch & CI/CD Strategy

## Branch model

```
main          ← production-ready, tagged releases only
develop       ← integration branch, PRs merge here first
release/*     ← optional release prep branches (release/0.9.21)
feature/*     ← short-lived feature branches → PR to develop
hotfix/*      ← urgent fixes → PR to main + cherry-pick to develop
```

### Flow

1. **Feature work**: branch from `develop` → PR back to `develop`
2. **Release prep**: branch `release/<version>` from `develop` → bump version, CHANGELOG → merge to `main` + tag
3. **Hotfix**: branch from `main` → fix → PR to `main` + tag → cherry-pick to `develop`
4. **Desktop builds**: triggered automatically on tag push, binary artifacts published to GitHub Release

## CI/CD workflows

| Workflow | File | Triggers | Purpose |
|---|---|---|---|
| **CI** | `ci.yml` | push to main/develop, PR to main/develop | typecheck, lint, test, build, audit |
| **CodeQL** | `codeql.yml` | push to main/develop, PR, weekly cron | security analysis (JS/TS + Actions) |
| **Desktop Release** | `desktop-release.yml` | tag push, workflow_dispatch | build desktop binaries, publish to GitHub Release |

### CI (`ci.yml`)

- Runs on: Ubuntu (full test suite) + Windows (typecheck + lint + build only — Unix path tests skip)
- Audit: `pnpm audit --audit-level high --prod` (production deps only)
- Concurrency group cancels stale runs on same ref

### Desktop Release (`desktop-release.yml`)

- Triggers on: tag push (`*`) or manual dispatch
- Matrix: macOS 15, Windows 2025, Ubuntu 24.04
- Verify gates: typecheck + lint + test (Unix only) + build
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

Tags are plain version numbers: `0.9.21` (NOT `v0.9.21`).

## Binary artifacts

Desktop binaries are built by CI and published to GitHub Releases only.
They are never committed to the repo. The `release/` directory is gitignored.

Local builds: `pnpm run desktop:build` outputs to `release/desktop/`.