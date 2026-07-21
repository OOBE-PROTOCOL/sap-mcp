# SAP MCP Skill Pack

Production skill pack for agents using the SAP MCP server through Claude,
Hermes, OpenClaw, Codex, or another MCP-capable runtime.

This pack is adapted for `sap-mcp-server` from the upstream Synapse SAP SDK
v1.0.x skill taxonomy:

- `sap-overview`
- `sap-mcp`
- `sap-client`
- `sap-advanced`
- `sap-memory`
- `sap-defi`
- `sap-merchant`
- `sap-nft`
- `sap-metaplex`
- `sap-gaming`
- `sap-enterprise`
- `sap-social`
- `sns-skill`

## Upstream References

Use these upstream references when the agent needs the latest SAP SDK context
or wants to compare this bundled MCP skill pack with the source SDK skills:

- Synapse SAP SDK docs: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs
- Synapse SAP SDK skills: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/skills

## Skills

| Skill | Use For |
| --- | --- |
| `sap-mcp` | MCP setup, profile inspection, wizard/CLI usage, safe signing rules |
| `sap-operations` | SAP registry, memory, reputation, x402, escrow, settlement, staking |
| `sap-agent-chat` | Signed thematic group rooms, manifest discovery, link sharing, ledger history, sealing |
| `sap-sns` | SNS domain checks, records, wallet resolution, agent domain registration |
| `sap-agentkit` | Synapse AgentKit Solana, NFT, DeFi, market, staking, gaming, social tools |
| `sap-agent-registry` | Agent registration, profile inspection, activation, global agent directory |
| `sap-discovery-indexing` | Network overview, global directory, protocol/capability/category indexes |
| `sap-tool-registry` | Publish, update, fetch, deactivate, and report SAP tool descriptors |
| `sap-reputation-attestation` | Feedback, reputation, attestations, FairScale trust gates |
| `sap-memory-vault` | Vaults, sessions, inscriptions, compact memory, epoch pages |
| `sap-ledger-session` | Session continuity and latest durable session reads |
| `sap-payments-x402` | x402 payment context, balances, subscriptions |
| `sap-escrow-settlement` | Escrow V2, settlement, pending settlement, disputes |
| `sap-staking` | SAP stake initialization, deposit, unstake, and stake reads |
| `sap-solana-token` | SOL/SPL balances, transfers, token deploy, mint, burn, token admin |
| `sap-defi` | Jupiter, Drift, Adrena, Lulo, liquidity, orderbooks, bridges, Jito, staking |
| `sap-market-data` | Pyth, CoinGecko, Jupiter token intelligence, prices, OHLCV, risk data |
| `sap-nft-metaplex` | DAS, Metaplex NFT, 3.Land collections, mints, listings, authorities |
| `sap-social-gaming` | Blinks, Gibwork bounties, Send Arcade gaming |

## Agent Behavior

- Answer in the same natural language as the user's latest request.
- Use free exact/base SAP reads before paid discovery when possible:
  `sap_agent_context`, `sap_get_agent`, `sap_get_agent_profile`,
  `sap_get_agent_stats`, `sap_is_agent_active`, `sap_get_global_state`, and
  compact `sap_list_agents` pages with `limit <= 20`.
- Use `sap_discover_agents` for targeted hosted agent search by query, wallet,
  PDA, protocol, capability, capability list, or x402 endpoint presence.
- Use `sap_list_all_agents` for current global SAP ecosystem agent lists only
  when the user needs more than the free compact orientation page, and continue
  with `pagination.nextCursor` when more pages are needed.
- Treat `mcp_sap_<tool>` as a client display prefix; the callable MCP tool name
  inside this server is the suffix, for example `jupiter_getQuote`.
- Call `sap_agent_next_action` before retrying after `payment_required`,
  `hosted_local_signer_required`, transient Solana RPC errors, a missing local
  bridge, or a submitted signature that has not confirmed.
- Use `skills/sap-mcp/TOOL_REFERENCE.md` and `USER_DOCS/05_SKILLS_AND_TOOLS.md`
  as the bundled routing maps when deciding which SAP MCP tool or skill domain
  applies to a user request.

## Install With MCP

Use the MCP tools exposed by this server:

1. `sap_skills_list`
2. `sap_skills_bundle`
3. `sap_skills_install`

For a dry run:

```json
{
  "name": "sap_skills_install",
  "arguments": {
    "agent": "claude",
    "confirm": false
  }
}
```

For a real install:

```json
{
  "name": "sap_skills_install",
  "arguments": {
    "agent": "claude",
    "confirm": true
  }
}
```

For custom agents:

```json
{
  "name": "sap_skills_install",
  "arguments": {
    "agent": "custom",
    "targetDir": "/absolute/path/to/agent/skills",
    "confirm": true
  }
}
```

## Configure SAP MCP Locally

Use the config CLI to create and manage profiles:

```bash
npx sap-mcp-config wizard
npx sap-mcp-config show
npx sap-mcp-config profiles
npx sap-mcp-config profile-info
npx sap-mcp-config pubkey
npx sap-mcp-config wallet
```

For MCP clients such as Claude, Hermes, OpenClaw, or Codex, prefer the dynamic
profile manager. In this mode the server reads `~/.config/mcp-sap/.active-profile`,
so users can change profiles with `sap-mcp-config profile <name>` and then
restart the MCP client:

```yaml
env:
  SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: "false"
  SAP_LOG_LEVEL: info
```

Only pin `SAP_MCP_PROFILE` and `SAP_MCP_CONFIG_PATH` when the MCP client must
always load one fixed profile regardless of the active profile marker.

## Safety Contract

- Agents must never read keypair JSON files.
- Agents must never print secret key bytes, seed phrases, or wallet file paths.
- Agents should use `sap_profile_current`, `sap_profile_list`, and
  `sap_profile_public_key` for context.
- Agents must use `sap_profile_switch` with `confirm: true` when changing
  runtime profile.
- Agents must use `sap_preview_transaction` before signing.
- Agents must treat `sap_sign_transaction` and `sap_submit_signed_transaction`
  as high-risk operations.
