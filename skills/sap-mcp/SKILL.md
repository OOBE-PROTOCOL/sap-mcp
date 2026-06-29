# SAP MCP

Use this skill when an agent needs to operate the SAP MCP server through MCP,
configure local or remote launch, inspect the loaded profile, or reason about
safe signing behavior.

## First Step

Always inspect runtime context through MCP tools, not by reading config files:

1. `sap_profile_current`
2. `sap_profile_list`
3. `sap_profile_public_key`
4. `sap_network_stats`

The server profile is the source of truth. Environment variables from the MCP
client must not override profile-owned RPC or wallet settings unless
`SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE=true`.

## Response Language

Answer in the same natural language as the user's latest request. If the user
asks in English, answer in English even when previous chat history, tool output,
or repository docs contain Italian. Keep tool names, protocol IDs, addresses,
and error strings unchanged.

## Discovery Rules

- Use `sap_get_network_overview` for live ecosystem counters.
- Use `sap_list_all_agents` when the user asks for all current SAP ecosystem
  agents. It performs global on-chain `AgentAccount` enumeration.
- Use `sap_discover_agents` or `sap_list_agents` only for filtered lookups by
  `protocol`, `capability`, or `capabilities`.
- Use `sap_fetch_protocol_index` when a specific protocol ID is known.
- Do not tell the user that all-agent enumeration is impossible unless
  `sap_list_all_agents` fails and you report the exact failure.

## Tool Name Prefixes

Some MCP clients display SAP tools as `mcp_sap_<tool>`. The callable tool name
inside this server omits the client prefix. Example: a client may display
`mcp_sap_jupiter_getQuote`, while the MCP tool name is `jupiter_getQuote`.

## Upstream References

Use these official upstream references for the latest SAP SDK documentation and
source skill taxonomy:

- Synapse SAP SDK docs: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs
- Synapse SAP SDK skills: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/skills

Use the bundled routing map for local MCP tool selection:

- `docs/SAP_SDK_SKILLS.md`

## Profile Tools

| Tool | Purpose |
| --- | --- |
| `sap_profile_current` | Show loaded profile, active profile, RPC, network, program, signer public key |
| `sap_profile_list` | List available profiles without exposing wallet paths |
| `sap_profile_public_key` | Show profile agent public key |
| `sap_profile_switch` | Reload runtime to another profile; requires `confirm: true` |

## Wizard And CLI

Create or update a profile:

```bash
npx sap-mcp-wizard
# or
npx sap-mcp-config wizard
```

### `npx sap-mcp-config` Usage

Use `sap-mcp-config` for all local profile and wallet configuration. Do not
edit generated JSON files manually unless you are repairing a broken profile.

Recommended first setup:

```bash
npx sap-mcp-config wizard
```

The wizard creates `~/.config/mcp-sap/`, stores profile configs as
`config-<profile>.json`, and creates or links dedicated keypairs under the SAP
MCP config directory. It must not use or overwrite the Solana CLI keypair unless
the user explicitly chooses that path.

Show the currently loaded/active config:

```bash
npx sap-mcp-config show
npx sap-mcp-config info
```

List, inspect, and switch profiles:

```bash
npx sap-mcp-config profiles
npx sap-mcp-config profile-info
npx sap-mcp-config profile <profile-name>
```

Show the public agent identity:

```bash
npx sap-mcp-config pubkey
```

Check wallet status without printing keypair bytes:

```bash
npx sap-mcp-config wallet
```

Update safe scalar settings:

```bash
npx sap-mcp-config set rpcUrl https://api.mainnet-beta.solana.com
npx sap-mcp-config set logLevel info
npx sap-mcp-config set maxTxValueSol 10
npx sap-mcp-config set requireApprovalAboveSol 1
npx sap-mcp-config set dailyLimitSol 100
```

MCP client configuration should prefer the dynamic profile manager over
duplicated RPC or wallet env vars. In dynamic mode the server reads
`~/.config/mcp-sap/.active-profile`, so the user can change profile with
`sap-mcp-config profile <name>` and then restart the MCP client:

```yaml
mcp_servers:
  sap:
    command: node
    args:
      - /absolute/path/to/sap-mcp-server/dist/cli.js
    cwd: /absolute/path/to/sap-mcp-server
    env:
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: "false"
      SAP_LOG_LEVEL: info
```

Only pin a fixed profile when that is intentional:

```yaml
env:
  SAP_MCP_PROFILE: gianni-market-nft-agent
  SAP_MCP_CONFIG_PATH: ~/.config/mcp-sap/config-gianni-market-nft-agent.json
  SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: "false"
  SAP_LOG_LEVEL: info
```

Avoid passing `SAP_WALLET_PATH` or `SAP_MCP_RPC_URL` from the MCP client unless
the user intentionally wants env overrides and has set
`SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE=true`.

Show active profile:

```bash
npx sap-mcp-config show
npx sap-mcp-config profile-info
npx sap-mcp-config pubkey
```

List and switch profiles:

```bash
npx sap-mcp-config profiles
npx sap-mcp-config profile <name>
```

Start local MCP over stdio:

```bash
npx sap-mcp-server start
```

Start remote MCP over Streamable HTTP:

```bash
SAP_MCP_AUTH_TYPE=api_key \
SAP_MCP_API_KEYS=<api-key>=<operator-id> \
npx sap-mcp-remote
```

## Signing Rules

- Do not read wallet/keypair files.
- Do not ask the user to paste private key bytes.
- Use `sap_preview_transaction` before any signing.
- Use `sap_sign_transaction` only after preview and policy checks.
- Use `sap_submit_signed_transaction` only for a signed transaction that the
  user or policy explicitly allows.
- If a transaction exceeds policy limits, stop and ask the user for approval
  through the surrounding agent UI.

## MCP Tool Reference

See `TOOL_REFERENCE.md` in this skill directory for the complete 232-tool
mapping to the most specific SAP skill domain.
