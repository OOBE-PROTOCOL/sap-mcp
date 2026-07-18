# SAP MCP

Use this skill when an agent needs to operate the SAP MCP server through MCP,
configure local or remote launch, inspect the loaded profile, or reason about
safe signing behavior.

## First Step

If the user says "Start SAP MCP", "Initialize SAP MCP", "Load SAP", or "SAP
mode", treat it as the activation command. Call `sap_agent_start` when it is
available, then call `sap_skills_bundle` with `includeContents: true` and load
the returned SAP MCP skill contents into context.

Always inspect runtime context through MCP tools, not by reading config files:

1. `sap_agent_start`
2. `sap_skills_bundle` with `includeContents: true`
3. `sap_skills_upgrade_plan` when local skills are missing or stale
4. `sap_runtime_repair_plan` when hosted tools are connected but `sap_payments` is missing
5. `sap_profile_current`
6. `sap_profile_list`
7. `sap_profile_public_key`
8. `sap_network_stats`

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

- `skills/sap-mcp/TOOL_REFERENCE.md`
- `USER_DOCS/05_SKILLS_AND_TOOLS.md`

SAP MCP startup and skill bootstrap tools are free context/setup tools. Call
`sap_agent_start`, `sap_skills_list`, `sap_skills_bundle`,
`sap_skills_upgrade_plan`, `sap_runtime_repair_plan`, and local
`sap_skills_install` directly. Do not route startup, skill listing, bundling,
upgrade planning, runtime repair planning, or installation through
`sap_x402_paid_call`. On hosted remote MCP, use
`sap_skills_bundle` to download skill contents; the hosted server cannot
install files onto the caller's local machine. Local installation belongs to the
wizard, desktop app, addon installer, or a local stdio SAP MCP process.
If skills or runtime bridge config are stale, call `sap_skills_upgrade_plan` or
`sap_runtime_repair_plan` first. These tools return the pinned latest-release
commands and preserve the non-custodial local signing model.

## Hosted Remote MCP

Canonical hosted endpoint:

```text
https://mcp.sap.oobeprotocol.ai/mcp
```

Public server metadata:

```json
{
  "name": "sap-mcp-server",
  "title": "SAP MCP Server | OOBE Protocol",
  "status": "online",
  "protocol": {
    "primary": "mcp",
    "transport": "streamable-http",
    "protocolVersion": "2025-06-18"
  },
  "endpoints": {
    "landing": "https://mcp.sap.oobeprotocol.ai/",
    "mcp": "https://mcp.sap.oobeprotocol.ai/mcp",
    "serverInfo": "https://mcp.sap.oobeprotocol.ai/server.json",
    "wizardDescriptor": "https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json",
    "wizardInstallScript": "https://mcp.sap.oobeprotocol.ai/wizard/install.sh"
  },
  "authentication": {
    "schemes": ["none", "x402"],
    "bearerRequired": false
  },
  "security": {
    "keypairBytesExposed": false,
    "storesUserKeypairs": false,
    "rpcSecretsExposed": false,
    "wizardConfigDirectory": "~/.config/mcp-sap"
  }
}
```

Hosted users still need a local SAP MCP profile when they sign x402/pay.sh
payments, SAP transactions, Solana transactions, SNS operations, or settlement
actions. The hosted MCP server is not a wallet custodian.

For hosted paid tools, use the native x402 flow. If the client runtime cannot
attach `PAYMENT-SIGNATURE` itself, use the local SAP MCP `sap_payments` bridge.
Call `sap_payments_readiness` first to verify the active profile, signer,
SOL/USDC balance, policy limits, and bridge status. Then call
`sap_payments_call_paid_tool` for the hosted paid tool. This is not a separate
hosted signing plugin: it is the local SAP MCP process using the user's
configured SAP profile wallet or external signer to sign the x402 payment
payload, retry the hosted tool call, and return the receipt.
`sap_x402_paid_call` is a backward-compatible alias only for older runtime
snippets. Neither helper must be treated as a remote hosted signing service.

When connected to hosted SAP MCP, `signerConfigured: false` on the remote
server means the hosted server is non-custodial. It does not mean the remote
tool surface is unavailable. Do not silently switch to local stdio just because
a hosted call requires x402 payment or because the hosted server does not hold
the user's signer. Use the hosted x402 flow first; ask the user before using a
local stdio fallback.

Hosted remote is accountless. If `sap_profile_current` returns
`accountModel: hosted-remote-accountless`, do not describe `default` as the
user's profile and do not infer the user's wallet from the hosted server. To
inspect the local user profile, wallet, signer status, and payment policy, call
the local `sap_payments.sap_payments_readiness` bridge when it is configured.
Use `sap_payments.sap_payments_profile_current` only as a narrower compatibility
profile check.

Basic wallet reads are free on hosted SAP MCP. Call `sol_get_balance`,
`spl-token_getBalance`, and `spl-token_getTokenAccounts` directly on the hosted
server. Do not send these balance checks through `sap_payments_call_paid_tool`,
and do not summarize a balance read as a facilitator `BlockhashNotFound`
problem unless a paid tool actually returned that error.

If a hosted paid tool returns `BlockhashNotFound`,
`transaction_simulation_failed`, `smart_wallet_simulation_failed`, `node is
behind`, `minimum context slot`, `fetch failed`, `gateway timeout`, or a
response marked `retryable: true`, treat it as a transient x402/Solana RPC
settlement error. Do not claim that SAP MCP is down unless `/health` also
fails. Do not bypass the paid hosted path with terminal/direct RPC. Retry
through the local `sap_payments_call_paid_tool` bridge with the same tool name
and arguments, `confirm: true`, and `maxAttempts: 5` so a fresh payment payload
is created. Use `sap_x402_paid_call` only when a runtime still exposes the
legacy alias.

When a hosted paid/write builder returns `transactionBase64`, `transaction`, or
another unsigned Solana transaction payload, finalize it locally with
`sap_payments_finalize_transaction`. Do not call hosted `sap_sign_transaction`
for a user-owned signer, do not create `.js`/`.mjs` signing scripts, and do not
read keypair JSON.

If hosted SAP MCP returns `hosted_local_signer_required`, no x402 payment was
charged. The tool requires a local user signature or has no hosted unsigned
builder yet. Do not retry the same hosted direct write; use the local SAP MCP
profile or an unsigned hosted builder plus `sap_payments_finalize_transaction`
when one exists.

When summarizing a hosted connection, use language like:
"server is non-custodial; user signatures come from the local SAP profile or
external signer." Avoid saying "signer not configured", "read-only only",
"writes unavailable", or "remote MCP broken" unless a specific tool returns
that exact operational error.

For simple connection questions such as "are you connected to SAP MCP?", answer
briefly. Include connected yes/no, endpoint, mode, non-custodial status, and
one next action. Do not dump the full tool catalog, protocol list, or category
summary unless the user explicitly asks what tools are available. Startup logs
or registration logs prove that the MCP server started; they do not prove that
the current agent runtime injected every tool as callable. If `tools/list`
works but callable functions are missing, report a runtime reload/injection
issue and ask the user to restart the runtime.

If `sap_payments` tools are missing after the user says the wizard completed,
call `sap_runtime_repair_plan`. Do not ask the user to manually rebuild their
runtime config unless the repair plan has already failed or runtime startup logs
show a concrete package/runtime error.

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

Hosted Claude/Codex/OpenClaw-style JSON:

```json
{
  "mcpServers": {
    "sap": {
      "url": "https://mcp.sap.oobeprotocol.ai/mcp",
      "transport": "streamable-http"
    }
  }
}
```

Hosted Hermes global `~/.hermes/mcp.json` JSON:

```json
{
  "sap": {
    "url": "https://mcp.sap.oobeprotocol.ai/mcp",
    "transport": "streamable-http"
  }
}
```

Hosted Hermes profile YAML:

```yaml
mcp_servers:
  sap:
    url: https://mcp.sap.oobeprotocol.ai/mcp
    transport: streamable-http
```

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

Operator-only: start your own remote MCP over Streamable HTTP:

```bash
SAP_MCP_AUTH_TYPE=api_key \
SAP_MCP_API_KEYS=<api-key>=<operator-id> \
npx sap-mcp-remote
```

Do not ask hosted users to run their own HTTP server unless they are deploying
their own VPS/operator instance.

Do not call a local free `stdio` SAP MCP server as an implicit substitute for
hosted paid tools. Local stdio is a developer fallback only when the user asks
for local execution or the client cannot perform remote Streamable HTTP/x402.

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

See `TOOL_REFERENCE.md` in this skill directory for the SAP tool mapping to
the most specific SAP skill domain. Use live `tools/list` for the exact runtime
count because upstream SDK tool registries can evolve.
