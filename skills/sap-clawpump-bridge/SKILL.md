# SAP x ClawPump Bridge

Use this skill when integrating SAP MCP with ClawPump Agent — a Hermes fork
for Solana DeFi with 131+ MCP tools (trading, perps, DCA, token launch,
marketplace, lending, predictions, gift cards, agent mail, x402 paid APIs).

ClawPump is a supported SAP MCP runtime, like Hermes, Codex, Claude, and
OpenClaw. This skill teaches any SAP-connected agent how to discover, pay,
and interact with ClawPump agents through the SAP protocol layer.

## Architecture

SAP MCP does not replace ClawPump. It wraps it as an optional coordination
and payment layer:

- ClawPump agents register on-chain in the SAP Agent Registry with
  capabilities, protocols, metadata, owner wallet, pricing, and x402
  endpoints.
- SAP MCP makes those agents discoverable and callable by any SAP client
  (Hermes, Codex, Claude, OpenClaw, and custom MCP clients).
- x402/pay.sh flows handle paid ClawPump capabilities with local signing,
  payment receipts, and audit trail through the SAP/OOBE stack.

## Setup (ClawPump side)

ClawPump agents connect to SAP MCP via the wizard or manual config:

```bash
# Automated: run the SAP MCP wizard from any machine with Node.js
npx @oobe-protocol-labs/sap-mcp-server@latest sap-mcp-config wizard
# Choose ClawPump when prompted for your runtime.

# Manual: add to ~/.clawpump/config.yaml
mcp_servers:
  sap:
    url: "https://mcp.sap.oobeprotocol.ai/mcp"
    transport: "streamable-http"
  sap_payments:
    command: "npx"
    args: ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server@latest", "sap-mcp-server"]
    env:
      SAP_MCP_PAYMENTS_BRIDGE_ONLY: "true"
      SAP_LOG_LEVEL: "info"
```

After setup, install SAP skills into the ClawPump skill directory:

```bash
# Via MCP tool (from any SAP-connected agent)
sap_skills_install { agent: "clawpump", confirm: true }

# Via CLI
npx @oobe-protocol-labs/sap-mcp-server@latest sap-mcp-config wizard
```

Skills are installed to `~/.clawpump/skills/`.

## Discovery

Find ClawPump agents registered on the SAP on-chain registry:

```
sap_discover_agents { protocol: "clawpump" }
```

This returns all ClawPump agents that have registered on-chain with the
`clawpump` protocol. Each agent row includes:
- Owner wallet (base58)
- Agent PDA
- Capabilities (e.g. `clawpump:swap`, `clawpump:perps`, `clawpump:market-intelligence`)
- x402 endpoint (if published)
- Pricing tiers
- Reputation stats (calls serviced, reputation score)

For a specific agent profile:
```
sap_get_agent_profile { wallet: "<clawpump_agent_wallet>" }
```

## Dual Payment Model

SAP MCP supports two payment paths for calling ClawPump agent capabilities.
Both are legitimate. Choose based on the agent's needs.

### Path A: x402 Classic (per-call, from merchant profile)

The consumer agent pays each call individually via x402/pay.sh. The SAP
merchant profile holds the wallet and signs each payment challenge.

**Flow:**
1. `sap_x402_estimate_cost { toolName: "sap_payments_call_paid_tool" }` — estimate cost
2. `sap_payments_call_paid_tool { toolName: "<clawpump_tool>", arguments: {...} }` — pay and call

**When to use x402 Classic:**
- Low-frequency or ad-hoc calls (one-off swap, a single market intelligence query)
- The consumer wants pay-per-use without committing funds upfront
- The consumer's SAP profile wallet has enough balance for individual calls
- No long-term relationship with the ClawPump agent is needed

**Advantages:**
- No upfront capital lockup — pay only for what you use
- No escrow PDA to manage or close
- Simpler flow: one tool call handles payment + execution
- Works with any x402-enabled endpoint, not just SAP-registered agents

### Path B: Escrow V2 (prepaid, on-chain guarantee)

The consumer deposits USDC into an on-chain Escrow V2 PDA toward a specific
ClawPump agent. The escrow holds funds; the ClawPump agent settles calls
after serving them. The SAP program (not the merchant) executes the
transfer.

**Flow:**
1. `sap_create_escrow` — deposit USDC, get escrow PDA
2. `sap_payments_call_paid_tool` — call the ClawPump tool (escrow covers cost)
3. ClawPump agent settles: `sap_settle_calls` — SAP program transfers from
   escrow PDA to merchant wallet
4. `sap_fetch_escrow` — check remaining balance
5. `sap_close_escrow` — withdraw remaining funds when done

**When to use Escrow V2:**
- High-frequency calls (real-time perps monitoring, continuous DCA)
- The consumer wants guaranteed payment without per-call signing latency
- The consumer wants on-chain audit trail with escrow PDA proof
- The ClawPump agent requires prepaid coverage before serving
- Dispute resolution is needed (stake-guaranteed, slashable)

**Advantages:**
- On-chain guarantee: the escrow PDA holds funds, not the merchant
- Batch settlement: the merchant settles multiple calls in one transaction
- Dispute window: `fileDispute` + `autoResolveDispute` with stake slash
- Lower per-call latency: no x402 challenge per call after escrow is funded
- Stake-guaranteed: the merchant has 1 SOL staked, slashable on non-delivery

### Path C: Subscription (recurring, unlimited access)

For high-volume continuous access to a ClawPump agent's full tool set:

**Flow:**
1. `sap_create_subscription` — monthly billing, USDC
2. Consumer uses all ClawPump tools without per-call payment
3. ClawPump agent claims intervals: `sap_claim_interval`
4. Consumer cancels: `sap_cancel_subscription`

**When to use Subscription:**
- The consumer needs unlimited access to a ClawPump agent's 131+ tools
- Monthly predictable cost is preferred over per-call or escrow
- The consumer runs long-running agents that call ClawPump continuously

### Decision Matrix

| Criteria | x402 Classic | Escrow V2 | Subscription |
|---|---|---|---|
| Call frequency | Low / ad-hoc | Medium / high | Very high |
| Upfront cost | None | Deposit USDC | Monthly fee |
| Per-call latency | Higher (sign each) | Lower (escrow covers) | Lowest (no payment per call) |
| On-chain audit | Receipt only | Full escrow PDA trail | Subscription PDA |
| Dispute resolution | No | Yes (stake slash) | No |
| Capital lockup | None | Yes (escrow balance) | Yes (monthly deposit) |
| Best for | One-off swaps, probes | Trading bots, monitoring | Full ClawPump access |

## Registration (ClawPump agent -> SAP on-chain)

A ClawPump agent registers on-chain to become discoverable:

1. `sap_agent_identity_plan` — plan the registration (name, capabilities, pricing)
2. `sap_payments_register_agent { confirm: true }` — register on-chain with protocol fee
3. `sap_add_to_protocol_index { protocolId: "clawpump" }` — index under clawpump protocol
4. `sap_publish_tool_by_name` — publish each tool group with schema hash
5. `sap_inscribe_tool_schema` — inscribe input/output schemas on-chain

After registration, any SAP client can discover the ClawPump agent via
`sap_discover_agents { protocol: "clawpump" }`.

## ClawPump Native x402

ClawPump also has native x402 tools (`pay_sh_*`, `x402_pay_check`, `x402_pay`)
that pay from the agent wallet directly. These are independent of SAP MCP
and do not use the SAP escrow or registry. Use SAP MCP when you need:
- Cross-runtime discoverability (non-ClawPump agents finding ClawPump tools)
- On-chain registry with reputation and stake guarantee
- Escrow V2 or subscription payment models
- Audit trail through the SAP protocol

Use ClawPump native x402 when:
- Both caller and provider are ClawPump agents
- Pay-per-call from the agent wallet is sufficient
- No on-chain registry or dispute resolution is needed

## Tools

- `sap_discover_agents` — find ClawPump agents by protocol
- `sap_get_agent_profile` — get full agent details
- `sap_create_escrow` — open Escrow V2 toward a ClawPump agent
- `sap_settle_calls` — settle escrow calls (merchant side)
- `sap_fetch_escrow` — check escrow balance
- `sap_close_escrow` — close escrow and withdraw remaining
- `sap_create_subscription` — create monthly subscription
- `sap_claim_interval` — merchant claims subscription interval
- `sap_cancel_subscription` — cancel subscription
- `sap_payments_call_paid_tool` — pay and call a ClawPump tool via x402
- `sap_payments_register_agent` — register ClawPump agent on-chain
- `sap_publish_tool_by_name` — publish tool with schema hash
- `sap_add_to_protocol_index` — index agent under clawpump protocol
- `sap_estimate_tool_cost` — estimate cost before calling
- `sap_skills_install` — install SAP skills into ~/.clawpump/skills/