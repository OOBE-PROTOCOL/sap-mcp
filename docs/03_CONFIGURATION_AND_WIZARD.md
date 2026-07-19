# 03. Configuration And Wizard

## 03.1 Config Directory

SAP MCP uses one canonical local config namespace:

```text
~/.config/mcp-sap/
  .active-profile
  config.json
  config-<profile>.json
  keypairs/
    <profile>-keypair.json
  logs/
```

Legacy paths such as `~/.config/sap-mcp` should not be used by new installs. Client config entries should point to the SAP MCP profile manager, not hard-code legacy wallet paths.

## 03.2 Profile Resolution

Runtime config is resolved in this order:

1. Safe built-in defaults.
2. `SAP_MCP_CONFIG_PATH`, when explicitly set.
3. `SAP_MCP_PROFILE`, when explicitly set.
4. `~/.config/mcp-sap/.active-profile`.
5. `~/.config/mcp-sap/config.json`.
6. Deployment environment variables.
7. Explicit runtime overrides from code.

Profile-owned fields remain authoritative unless `SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE=true`.

## 03.3 Profile-Owned Fields

These fields normally belong to the active profile:

| Field | Meaning |
| --- | --- |
| `mode` | `readonly`, `local-dev-keypair`, `hosted-api`, or external signer mode. |
| `rpcUrl` | Solana RPC endpoint. |
| `programId` | SAP program ID. |
| `commitment` | Solana commitment level. |
| `agentPubkey` | Agent public key or PDA exposed to agents. |
| `walletPath` | Dedicated SAP MCP keypair path when local signing is enabled. |
| `walletEncrypted` | Whether the wallet file is encrypted. |
| `policy` | Local, Bento, or hybrid policy configuration. |
| `bento` | Optional Bento integration settings. |
| `monetization` | Hosted payment settings when remote monetization is enabled. |

## 03.4 Wizard Responsibilities

The wizard should:

1. Create `~/.config/mcp-sap` when missing.
2. Ask for a profile name instead of silently creating ambiguous `default` state.
3. Create or import a dedicated SAP MCP wallet.
4. Store the wallet under `~/.config/mcp-sap/keypairs/` by default.
5. Never write to `~/.config/solana/id.json`.
6. Ask whether Bento policy should be enabled.
7. Validate RPC URL, program ID, keypair path, mode, limits, and profile names.
8. Show a final preview before writing files.
9. Offer optional MCP client config injection.
10. Warn before merge or override when an existing `sap` MCP entry is found.

## 03.5 Desktop GUI Wizard

SAP MCP also ships a Desktop GUI Wizard for users who should not need to edit JSON, TOML, or YAML by hand.

The desktop app uses the same setup modules as `sap-mcp-config wizard`; it must not create a second config format or a separate wallet model.

Desktop flow:

1. Choose a named profile.
2. Create or import a dedicated SAP MCP wallet.
3. Set policy limits and optional Bento Guard metadata.
4. Detect local agent runtimes.
5. Configure hosted MCP and the local SAP MCP `sap_payments` bridge where supported.
6. Show a final review before writing files.

Release artifacts are produced as macOS DMG/ZIP, Windows NSIS EXE, and Linux tar.gz. See [14. Desktop Wizard Release](14_DESKTOP_WIZARD_RELEASE.md).

## 03.6 Client Config Injection

The injection step is optional. It targets known local MCP clients such as Claude Desktop, Hermes, Codex, and OpenClaw.

The injected config should follow the profile manager:

```json
{
  "mcpServers": {
    "sap": {
      "command": "node",
      "args": ["/path/to/sap-mcp-server/dist/cli.js"],
      "cwd": "/path/to/sap-mcp-server",
      "env": {
        "SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE": "false",
        "SAP_LOG_LEVEL": "info"
      }
    }
  }
}
```

Do not inject keypair bytes, hard-coded legacy wallet paths, or stale RPC overrides into agent client files.

For hosted paid/write tools, clients may also need a local `sap_payments` bridge that exposes only:

```txt
sap_payments_readiness
sap_payments_call_paid_tool
sap_payments_call_external_x402
sap_payments_register_agent
sap_payments_finalize_transaction
sap_payments_prepare_challenge
sap_payments_sign_challenge
sap_payments_verify_receipt
sap_x402_paid_call
```

This bridge obtains x402 challenges, signs payment proofs locally with the active SAP MCP profile, retries hosted tool calls, finalizes unsigned hosted transactions, and inspects receipts.

## 03.7 Config CLI

Use `sap-mcp-config` for profile and policy operations:

```bash
npx sap-mcp-config wizard
npx sap-mcp-config show
npx sap-mcp-config profiles
npx sap-mcp-config profile <name>
npx sap-mcp-config create-profile <name> [copy-from]
npx sap-mcp-config delete-profile <name>
npx sap-mcp-config profile-info
npx sap-mcp-config pubkey
npx sap-mcp-config info
npx sap-mcp-config wallet
npx sap-mcp-config set mode readonly
npx sap-mcp-config pending
npx sap-mcp-config approve <id>
npx sap-mcp-config deny <id>
npx sap-mcp-config audit
npx sap-mcp-config hash
```

## 03.8 Approval Workflow

Sensitive config changes can require approval. Typical protected fields are:

1. `mode`
2. `walletPath`
3. `externalSignerUrl`
4. `maxTxValueSol`
5. `dailyLimitSol`

Pending changes are listed with `sap-mcp-config pending`, approved with `sap-mcp-config approve <id>`, and denied with `sap-mcp-config deny <id>`.

## 03.9 Network Consistency

The active profile is the source of truth for network behavior. If a profile is on devnet, SAP tools must return devnet data. If a profile is on mainnet, SAP tools must return mainnet data.

Avoid this anti-pattern:

```yaml
env:
  SAP_MCP_RPC_URL: https://api.devnet.solana.com
  SAP_WALLET_PATH: /legacy/path/keypair.json
```

Use profile-managed config instead:

```yaml
env:
  SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: "false"
  SAP_LOG_LEVEL: info
```
