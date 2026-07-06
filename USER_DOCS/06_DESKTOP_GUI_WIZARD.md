# Desktop GUI Wizard

## 1. What It Is

The SAP MCP Desktop Wizard is the normie-friendly installer for users who do not want to edit MCP JSON, TOML, or YAML by hand.

It creates the same real SAP MCP profile as the CLI/TUI wizard:

- a named profile under `~/.config/mcp-sap`;
- a dedicated local SAP MCP wallet or external signer boundary;
- conservative policy limits;
- hosted MCP config for `https://mcp.sap.oobeprotocol.ai/mcp`;
- optional local x402 paid-call bridge for agent runtimes.

The desktop app is not a mock installer. It calls the same setup modules used by `sap-mcp-config wizard`.

The first screen lets you choose one of two modes:

| Mode | Use It When |
| --- | --- |
| **Full SAP MCP setup** | You are creating or refreshing a SAP MCP profile, wallet boundary, policy limits, hosted MCP entry, and x402 payment bridge. |
| **Install x402 payment client only** | You already have `~/.config/mcp-sap` configured, hosted tools are visible, but paid/write calls still return `payment_required`. |

## 2. When To Use It

Use the desktop wizard when:

1. You want hosted SAP MCP but local signing.
2. You are setting up Codex, Hermes, Claude, OpenClaw, or another MCP client.
3. You need paid/write tools to work through x402.
4. You want a dedicated SAP MCP wallet separate from Solana CLI.
5. You prefer a guided GUI instead of terminal prompts.

Use the CLI wizard instead when you are on a server, SSH session, CI environment, or headless machine.

## 3. Download Options

The hosted endpoint exposes the installer descriptor:

```txt
https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json
```

Release artifacts are published on GitHub releases:

```txt
https://github.com/OOBE-PROTOCOL/sap-mcp/releases
```

Expected artifacts:

| Platform | Artifact |
| --- | --- |
| macOS | `SAP-MCP-Wizard-<version>-<arch>.dmg` or `.zip` |
| Windows | `SAP-MCP-Wizard-Setup-<version>-x64.exe` |
| Linux | `sap-mcp-wizard-<version>-<arch>.tar.gz` |

macOS builds must be signed and notarized for a zero-warning double-click install after downloading from Chrome, Safari, or another browser. Free public builds are ad-hoc signed but not Apple-notarized, so macOS may block them as "damaged" until you remove the quarantine flag.

For an unsigned SAP MCP Wizard build that you downloaded from the official GitHub release, copy the app to `/Applications`, then run:

```bash
xattr -dr com.apple.quarantine "/Applications/SAP MCP Wizard.app"
```

Then open the app again from Finder.

Do not paste wallet/keypair material into support chats while troubleshooting installer issues.

## 4. GUI Flow

The desktop wizard walks through:

1. **Setup**: choose full setup or x402 payment-client-only repair.
2. **Profile**: choose a real profile name; the wizard refuses ambiguous `default` profiles.
3. **Wallet**: create a dedicated SAP MCP wallet or point to an existing dedicated keypair path.
4. **Policy**: set max transaction value, daily limits, log level, and optional Bento Guard settings.
5. **Runtimes**: detect local agent runtimes and configure hosted SAP MCP plus local `sap_payments`.
6. **Review**: show config path, wallet boundary, hosted MCP endpoint, and runtime actions before writing.

In x402 payment-client-only mode, the wizard skips profile, wallet, and policy steps. It only installs or repairs runtime MCP client entries and the optional addon bundle.

The renderer never receives keypair bytes. Wallet creation and file writes happen in the local main process.

## 5. Codex Setup From GUI

For Codex, the desktop wizard can write both entries:

```toml
[mcp_servers.sap]
url = "https://mcp.sap.oobeprotocol.ai/mcp"

[mcp_servers.sap_payments]
command = "npx"
args = ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server", "sap-mcp-server"]
enabled_tools = ["sap_x402_paid_call", "sap_profile_current", "sap_x402_estimate_cost"]
tool_timeout_sec = 300

[mcp_servers.sap_payments.env]
SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = "false"
SAP_ALLOWED_TOOLS = "sap_x402_paid_call,sap_profile_current,sap_x402_estimate_cost"
SAP_LOG_LEVEL = "info"
```

On Windows, the command is `npx.cmd`.

The hosted `sap` server lists and executes remote SAP MCP tools. The local `sap_payments` bridge signs x402 payment proofs with the active local SAP MCP profile and retries paid hosted calls without exposing keypair bytes.

## 6. Runtime Configs Written By The GUI

The GUI writes runtime-native config shapes. It does not paste profile names, wallet paths, RPC API keys, or keypair bytes into hosted MCP entries.

### 6.1 Claude Desktop

Claude Desktop uses a root `mcpServers` JSON object:

```json
{
  "mcpServers": {
    "sap": {
      "type": "http",
      "url": "https://mcp.sap.oobeprotocol.ai/mcp"
    },
    "sap_payments": {
      "command": "npx",
      "args": ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server", "sap-mcp-server"],
      "env": {
        "SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE": "false",
        "SAP_ALLOWED_TOOLS": "sap_x402_paid_call,sap_profile_current,sap_x402_estimate_cost",
        "SAP_LOG_LEVEL": "info"
      }
    }
  }
}
```

Known paths:

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%USERPROFILE%\AppData\Roaming\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

### 6.2 Hermes

Hermes global `mcp.json` uses flat server entries:

```json
{
  "sap": {
    "url": "https://mcp.sap.oobeprotocol.ai/mcp",
    "transport": "streamable-http"
  },
  "sap_payments": {
    "command": "npx",
    "args": ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server", "sap-mcp-server"],
    "env": {
      "SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE": "false",
      "SAP_ALLOWED_TOOLS": "sap_x402_paid_call,sap_profile_current,sap_x402_estimate_cost",
      "SAP_LOG_LEVEL": "info"
    }
  }
}
```

Hermes profile YAML uses top-level `mcp_servers`:

```yaml
mcp_servers:
  sap:
    url: https://mcp.sap.oobeprotocol.ai/mcp
    transport: streamable-http
  sap_payments:
    command: npx
    args:
      - --yes
      - --package
      - @oobe-protocol-labs/sap-mcp-server
      - sap-mcp-server
    env:
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: "false"
      SAP_ALLOWED_TOOLS: sap_x402_paid_call,sap_profile_current,sap_x402_estimate_cost
      SAP_LOG_LEVEL: info
```

### 6.3 OpenClaw

OpenClaw MCP JSON uses the same root `mcpServers` structure as generic MCP clients:

```json
{
  "mcpServers": {
    "sap": {
      "url": "https://mcp.sap.oobeprotocol.ai/mcp",
      "transport": "streamable-http"
    },
    "sap_payments": {
      "command": "npx",
      "args": ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server", "sap-mcp-server"],
      "env": {
        "SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE": "false",
        "SAP_ALLOWED_TOOLS": "sap_x402_paid_call,sap_profile_current,sap_x402_estimate_cost",
        "SAP_LOG_LEVEL": "info"
      }
    }
  }
}
```

On Windows, command-backed bridge entries use `npx.cmd`.

## 7. x402 Client Addon

The GUI can also install the x402 addon bundle under:

```txt
~/.config/mcp-sap/addons/x402-paid-call
```

Direct helper command:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-x402-paid-call \
  --tool sap_list_all_agents \
  --arguments '{"limit":5}' \
  --max-usd 0.02 \
  --confirm
```

Use the helper when your agent runtime can see hosted tools but cannot natively sign and replay x402 challenges.

## 8. CLI Fallback

The same setup can always be done from terminal:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

Show active profile:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config show
```

Install from hosted script:

```bash
curl -fsSL https://mcp.sap.oobeprotocol.ai/wizard/install.sh | bash
```

Read the script before running it when operating in a security-sensitive environment.

## 9. Security Rules

1. Do not paste keypair bytes into agent chat, MCP config, GitHub issues, or support tickets.
2. Do not configure hosted MCP with `SAP_WALLET_PATH` or RPC API-key overrides.
3. Keep the SAP MCP wallet separate from `~/.config/solana/id.json`.
4. Use the local `sap_payments` bridge only for x402 helper tools.
5. Restart the agent runtime after the wizard updates client config.
6. For production wallets, prefer external signer or delegated session mode once available for your runtime.
