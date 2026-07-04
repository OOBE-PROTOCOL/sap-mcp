# SAP MCP Wizard Desktop

Desktop wrapper for the SAP MCP configuration wizard.

The desktop app is a GUI over the same configuration modules used by the CLI and
TUI wizards. It does not keep an independent configuration model.

## What It Does

- creates a named SAP MCP profile under `~/.config/mcp-sap`;
- creates or imports a dedicated SAP MCP wallet path;
- keeps keypair bytes out of the renderer and out of hosted MCP config;
- configures Codex with hosted `sap` plus local `sap_payments`;
- installs the local x402 paid-call addon bundle.

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
Windows SmartScreen-friendly builds require a code signing certificate.
