# 14. Desktop Wizard Release

## 14.1 Purpose

The Desktop Wizard packages SAP MCP onboarding as a GUI/TUI-style installer for users who should not need to hand-edit agent runtime config.

It is a wrapper around the same production setup modules used by:

```bash
sap-mcp-config wizard
```

The desktop app must not maintain a second config format, wallet model, signer model, or x402 flow.

## 14.2 Source Layout

| Path | Purpose |
| --- | --- |
| `src/wizard-core/desktop-flow.ts` | Shared desktop setup core: defaults, validation, runtime detection, save orchestration. |
| `apps/desktop/main.mjs` | Electron main process and IPC boundary. |
| `apps/desktop/preload.cjs` | Safe renderer bridge. |
| `apps/desktop/src/main.tsx` | React wizard UI. |
| `apps/desktop/src/styles.css` | Accessible aqua-themed desktop styling. |
| `apps/desktop/electron-builder.cjs` | DMG/ZIP, NSIS EXE, and Linux tar.gz packaging config. |
| `apps/desktop/build/icon.png` | 1024x1024 installer icon derived from the public SAP MCP logo. |

## 14.3 Trust Boundary

The renderer receives profile metadata and user-entered form values only.

It must never receive:

1. keypair bytes;
2. private signer payloads;
3. facilitator secrets;
4. RPC API keys;
5. hosted deployment env values;
6. payment recipient private material.

Profile creation and runtime config writes happen through the main-process IPC handler, which calls shared setup modules.

## 14.4 Runtime Integrations

The desktop wizard currently focuses on the Codex happy path:

1. hosted remote MCP entry:

```toml
[mcp_servers.sap]
url = "https://mcp.sap.oobeprotocol.ai/mcp"
```

2. local payment bridge entry:

```toml
[mcp_servers.sap_payments]
command = "npx"
args = ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server", "sap-mcp-server"]
enabled_tools = ["sap_x402_paid_call", "sap_profile_current", "sap_x402_estimate_cost"]
tool_timeout_sec = 300
```

On Windows, use `npx.cmd`.

Hermes, Claude, OpenClaw, and custom runtimes receive snippets through the addon bundle until their exact local config mutation rules are stable enough for automatic editing.

## 14.5 Build Commands

Renderer only:

```bash
pnpm run desktop:renderer:build
```

Full local desktop build:

```bash
pnpm run desktop:build
```

The full command runs:

1. TypeScript build for server/core/TUI.
2. Vite renderer build.
3. Electron Builder packaging with `--publish never`.

Artifacts are written to:

```txt
release/desktop
```

Generated renderer and release files are ignored by git.

## 14.6 GitHub Release Workflow

Native multi-OS artifacts are built by:

```txt
.github/workflows/desktop-release.yml
```

Triggers:

1. manual `workflow_dispatch`;
2. tag push such as `0.6.0`.

Artifact matrix:

| Runner | Artifact |
| --- | --- |
| `macos-15` | `.dmg`, `.zip` |
| `windows-2025` | NSIS `.exe` |
| `ubuntu-24.04` | `.tar.gz` |

Tagged runs attach artifacts to a draft GitHub release.

## 14.7 Signing Requirements

Local unsigned builds are acceptable when the release notes clearly mark the macOS artifact as unsigned and provide the quarantine removal command.

Public release requirements:

1. macOS Developer ID Application certificate;
2. macOS notarization credentials;
3. Windows code signing certificate for SmartScreen reputation;
4. checksum publication in GitHub release notes;
5. changelog section for the exact released version.

Do not publish unsigned binaries as final user-facing installers without an explicit warning.

For signed tagged GitHub release builds, the macOS job uses these secrets when they are configured:

| Secret | Purpose |
| --- | --- |
| `MACOS_CSC_LINK` or `CSC_LINK` | Base64-encoded `.p12` Developer ID Application certificate, or a secure URL supported by Electron Builder. |
| `MACOS_CSC_KEY_PASSWORD` or `CSC_KEY_PASSWORD` | Password for the certificate bundle. |
| `APPLE_ID` | Apple Developer account email used for notarization. |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization. |
| `APPLE_TEAM_ID` | Apple Developer Team ID. |

The Electron Builder macOS config uses:

1. hardened runtime;
2. explicit Electron entitlements;
3. `afterSign` notarization through `apps/desktop/notarize.cjs`;
4. ad-hoc signing mode when `CSC_LINK` is not present;
5. signed/notarized mode when Apple Developer ID secrets are present.

If macOS shows this message:

```txt
"SAP MCP Wizard" is damaged and cannot be opened.
```

the downloaded app was blocked by Gatekeeper because it was not signed and notarized for public distribution, or because the browser applied a quarantine attribute to an unsigned build.

Temporary local-only workaround for a trusted internal build:

```bash
xattr -dr com.apple.quarantine "/Applications/SAP MCP Wizard.app"
```

or, before dragging from the mounted image:

```bash
xattr -dr com.apple.quarantine "/Volumes/SAP MCP Wizard/SAP MCP Wizard.app"
```

Unsigned/ad-hoc macOS release note text:

```txt
macOS note: this build is ad-hoc signed but not Apple-notarized. After copying the app to /Applications, run:
xattr -dr com.apple.quarantine "/Applications/SAP MCP Wizard.app"
```

A zero-warning public macOS release still requires Apple Developer ID signing and notarization.

## 14.8 Verification Gates

Before publishing:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test:run
pnpm audit --audit-level moderate
pnpm run build
pnpm run desktop:build
npm pack --dry-run --cache ./.npm-cache
```

The current local macOS arm64 build produces:

```txt
SAP-MCP-Wizard-0.6.0-arm64.dmg
SAP-MCP-Wizard-0.6.0-arm64.zip
```

Windows EXE and Linux artifacts are produced by the GitHub Actions matrix.
