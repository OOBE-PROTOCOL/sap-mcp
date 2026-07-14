# SAP MCP Wizard Desktop

Desktop wrapper for the SAP MCP configuration wizard.

The desktop app is a GUI over the same configuration modules used by the CLI and
TUI wizards. It does not keep an independent configuration model.

## What It Does

- creates a named SAP MCP profile under `~/.config/mcp-sap`;
- creates or imports a dedicated SAP MCP wallet path;
- keeps keypair bytes out of the renderer and out of hosted MCP config;
- configures Codex, Claude, Hermes, and OpenClaw with hosted `sap` plus local `sap_payments`;
- installs an optional local payment bridge reference bundle for repair/custom clients.

## Development

```bash
pnpm run build
pnpm run desktop:renderer
```

In another terminal, after installing Electron dependencies:

```bash
SAP_MCP_DESKTOP_DEV_URL=http://localhost:5173 electron apps/desktop/main.mjs
```

## Release Packaging

```bash
pnpm run desktop:build
```

The release artifacts are written to:

```txt
release/desktop
```

Tagged releases can also build native artifacts through:

```txt
.github/workflows/desktop-release.yml
```

That workflow creates macOS DMG/ZIP, Windows NSIS EXE, and Linux tar.gz
artifacts from native GitHub runners. Release uploads are created as draft
GitHub releases so signing, notarization, and final notes can be reviewed before
publishing.

macOS signing and notarization require Apple Developer ID credentials.
Windows SmartScreen-friendly builds require an Authenticode code signing certificate.

Tagged macOS release builds require:

- `MACOS_CSC_LINK` or `CSC_LINK`
- `MACOS_CSC_KEY_PASSWORD` or `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Tagged Windows release builds require:

- `WINDOWS_CSC_LINK` or `WIN_CSC_LINK`
- `WINDOWS_CSC_KEY_PASSWORD` or `WIN_CSC_KEY_PASSWORD`

The workflow generates `SHA256SUMS.txt` for every desktop artifact attached to
the release.

Unsigned macOS artifacts are for internal testing only. A browser-downloaded
unsigned DMG can be blocked by Gatekeeper with an "app is damaged" message.

When no `CSC_LINK` is configured, Electron Builder skips Developer ID signing
and the `afterSign` hook applies an ad-hoc local signature. Users can still run
the app after copying it to `/Applications` and removing quarantine:

```bash
xattr -dr com.apple.quarantine "/Applications/SAP MCP Wizard.app"
```
