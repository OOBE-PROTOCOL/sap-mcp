# SAP MCP Agent Stack Bounty Proposal

## 1. Executive Summary

SAP MCP Agent Stack Bounty is a proposed multi-partner Solana agent competition led by OOBE Protocol around SAP MCP, Synapse Agent Protocol, Bento Guard, Metaplex, SNS, and optional agent credit/trading partners such as Krexa.

The bounty should reward builders who create real agentic applications: agents with identity, policy, payments, ownership, and verifiable Solana execution. SAP MCP acts as the coordination layer that connects agent runtimes to Solana protocols and partner infrastructure through MCP.

Why now: MCP is becoming the standard interface for agent tools, x402/pay.sh make paid remote execution practical, and Solana now has the identity, policy, asset, and payment primitives needed for agents to operate as real on-chain participants.

Partner terminology note: final public track names and partner-specific requirements should be confirmed with Bento, Metaplex, SNS, Krexa, and any other participating partner before launch. This draft uses the terminology currently exposed or planned through SAP MCP and the Synapse SAP SDK, and should not imply official partner endorsement until each partner confirms participation.

Primary hosted endpoint:

```txt
https://mcp.sap.oobeprotocol.ai/mcp
```

Public documentation:

```txt
https://mcp.sap.oobeprotocol.ai/docs
```

## 2. Positioning

### 2.1 One-Line Pitch

Build Solana agents with SAP identity, Metaplex 014 and MPL Core identity flows, Bento policy checks, SNS names, x402/pay.sh payments, optional agent credit/trading workflows, and real on-chain execution through SAP MCP.

### 2.2 Narrative

Most agent demos stop at chat or API orchestration. This bounty asks builders to go further: create agents that can register, discover tools, enforce policy, pay for remote resources, link identity across registries, own assets, and execute safely on Solana.

SAP MCP provides the agent-facing standard interface. Partner stacks provide the identity, policy, naming, asset, payment, credit, and trading primitives that make the agent useful and trustworthy.

## 3. What Builders Can Win

Suggested bounty tracks:

| Track | Description |
| --- | --- |
| Best SAP MCP Agent | Best overall agent using SAP MCP for real Solana operations. |
| Best Bento Policy Integration | Best use of Bento Guard for agent safety, action checks, and permission boundaries. |
| Best Metaplex 014 / MPL Core Agent Identity | Best use of SAP MCP/Synapse SAP SDK flows involving Metaplex 014 Agent Registry and MPL Core primitives, with final track naming confirmed by Metaplex. |
| Best SNS Agent Identity | Best use of `.sol` naming, reverse lookup, and human-readable agent discovery. |
| Best x402/pay.sh Monetized Tool | Best paid API or paid agent workflow using hosted SAP MCP. |
| Best Agent Credit / Trading Workflow | Best agent workflow using lending, credit, risk controls, or trading execution through a participating partner such as Krexa, if confirmed. |
| Best Developer Experience | Best documentation, reproducibility, setup flow, and agent runtime integration. |

Full-stack composition should be a bonus multiplier, not a separate category. Builders who combine SAP MCP with multiple partner stacks can receive extra judging weight inside the relevant track, but every winning category should still have a clear primary evaluation target.

## 4. Example Project Ideas

### 4.1 Policy-Gated Trading Agent

An agent that checks balances, uses Jupiter or another Solana DeFi integration, previews a transaction, runs Bento policy checks, asks for approval above thresholds, and signs only when allowed.

Required stack:

- SAP MCP hosted or local
- Solana protocol tools
- Bento Guard
- local signer or external signer

Optional extensions:

- x402 paid analytics
- SAP reputation update
- SNS agent name

### 4.2 Agent Identity Passport

An agent that registers in SAP, uses a Metaplex 014 / MPL Core identity flow exposed through SAP MCP or Synapse SAP SDK, links an SNS `.sol` name, and exposes reputation or proof metadata through SAP MCP resources.

Required stack:

- SAP Agent Registry
- Metaplex 014 Agent Registry or MPL Core through the available SAP MCP/Synapse SAP SDK integration
- SNS

Optional extensions:

- Bento policy for identity updates
- paid verification or analytics tools

### 4.3 Monetized Agent Research Tool

An agent that exposes premium discovery, token, NFT, or analytics flows behind x402/pay.sh, then records usage and settlement through SAP MCP.

Required stack:

- hosted SAP MCP
- x402 or pay.sh
- SAP tool execution

Optional extensions:

- Bento policy for spend caps
- SNS identity for the tool owner
- Metaplex 014 identity or MPL Core access pass

### 4.4 Agent Coordination Room

A thematic group room where registered SAP agents can publish signed messages, reference links, share execution proofs, and retrieve room history.

Required stack:

- SAP agent identity
- signed messages
- fetchable history

Optional extensions:

- Bento moderation policy
- SNS identities
- Metaplex 014 or MPL Core room/membership assets

### 4.5 Credit-Backed Trading Agent

An agent that uses SAP MCP for identity, signing context, policy, and Solana execution, then integrates a participating credit or lending partner such as Krexa for agent credit, borrowing, risk controls, or repayment-aware trading workflows.

Required stack:

- SAP MCP hosted or local
- Solana protocol tools for quotes, balances, or execution
- clear signing and approval boundaries
- participating credit/lending partner integration, if confirmed

Optional extensions:

- Bento policy before trades, borrows, repayments, or venue changes
- x402/pay.sh revenue flow connected to repayment logic
- SAP reputation or proof-of-execution update after profitable/settled activity
- SNS or Metaplex identity for agent discoverability

## 5. Partner Stack

| Partner | Role In The Bounty |
| --- | --- |
| OOBE Protocol / Synapse / SAP | MCP gateway and SAP coordination layer: registry, discovery, reputation, settlement, memory, payments, and proof flows. |
| Bento Guard | Policy evaluation and guardrail layer before sensitive permissions, paid calls, signing, or on-chain execution. |
| Metaplex | Metaplex 014 Agent Registry and MPL Core identity/asset flows as exposed through SAP MCP and Synapse SAP SDK integrations, subject to final Metaplex wording. |
| SNS | `.sol` naming, domain linking, reverse lookup, and agent identity resolution. |
| Krexa | Proposed agent credit, lending, and repayment-aware trading workflows if Krexa confirms participation and integration requirements. |

The bounty should avoid claiming that partner technologies are native SAP modules unless that integration is explicitly implemented in SAP MCP or Synapse SAP SDK. Public language should say "uses", "integrates with", or "is exposed through SAP MCP" unless a partner confirms a stronger claim.

## 6. Technical Architecture

```txt
Agent Runtime
  Claude / Hermes / Codex / OpenClaw / Custom Agent
        |
        | MCP stdio or Streamable HTTP
        v
SAP MCP Server
  - SAP tools
  - Solana protocol tools
  - x402/pay.sh monetization
  - skills and prompts
  - policy hooks
        |
        +--> Synapse Agent Protocol
        |      registry, discovery, reputation, escrow, settlement, memory
        |
        +--> Bento Guard
        |      policy evaluation, action validation, permission boundaries
        |
        +--> Metaplex
        |      014 Agent Registry and MPL Core flows exposed through SAP MCP/Synapse SDK
        |
        +--> SNS
        |      .sol names, reverse lookup, identity resolution
        |
        +--> Krexa or credit/lending partner
        |      agent credit, risk controls, repayment-aware execution if confirmed
        |
        +--> Solana
               RPC, tokens, DeFi protocols, transactions, proofs
```

## 7. SAP MCP Tool Buckets

Builders should compose at least one of these tool buckets.

| Bucket | Examples |
| --- | --- |
| Solana protocol tools | Jupiter, Raydium, Orca, Meteora, Drift, Pyth, SPL Token, Metaplex-related identity/asset flows, bridging, staking, DAS, NFTs. |
| Solana RPC and chain methods | Balances, token accounts, transactions, assets, program data, network state, signatures, block data. |
| Synapse Agent Protocol methods | SAP agent registry, bridged identity, discovery, reputation, escrow, settlement, memory, proof-of-execution, x402 tools, SNS identity. |
| Partner credit and monetization flows | x402/pay.sh paid calls, optional Krexa-style agent credit, lending, repayment, and risk-aware execution if the partner integration is confirmed. |

## 8. Bridged Agent Identity

One of the strongest technical themes for this bounty is interoperable agent identity.

The Synapse SAP SDK integrates SAP agent identity with Metaplex identity primitives, including Metaplex 014 Agent Registry and MPL Core flows where exposed by the current SAP MCP/Synapse SDK integration. This lets builders represent an agent across more than one registry while keeping SAP MCP as the operational coordination layer.

Recommended identity graph:

```txt
Signer Wallet
  |
  +-- SAP Agent PDA / SAP Registry Profile
  |
  +-- Metaplex 014 Agent Registry-compatible Identity
  |
  +-- MPL Core Agent Asset / Credential
  |
  +-- SNS .sol Name
```

Identity layers:

| Layer | Purpose |
| --- | --- |
| SAP Agent Registry | Operational identity, discovery, reputation, settlement, memory, and coordination context. |
| Metaplex 014 Agent Registry | Metaplex-native agent identity and registry interoperability where supported by the integration. |
| MPL Core | Agent-owned identity assets, credentials, access passes, collection membership, proof artifacts, or metadata containers. |
| SNS | Human-readable `.sol` naming and reverse lookup for agent discovery. |

This is more valuable than isolated NFT minting because it gives the agent a reusable identity graph across registries, assets, names, policy, and payment flows.

## 9. Hosted And Local Access Model

### 9.1 Hosted Remote MCP

Hosted remote MCP gives builders a public MCP endpoint:

```txt
https://mcp.sap.oobeprotocol.ai/mcp
```

This is the recommended mode for agent runtimes that support Streamable HTTP MCP.

Hosted remote MCP can monetize paid tool calls through x402 and pay.sh. The hosted server does not custody user keypairs.

### 9.2 Local Wizard And Signer

Builders use the wizard to create a local SAP MCP profile:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

The wizard creates isolated profile data under:

```txt
~/.config/mcp-sap
```

The local profile controls:

- active SAP profile
- signer mode
- wallet path or external signer URL
- policy limits
- MCP client injection
- optional x402 paid-call helper

Keypair bytes must never be pasted into MCP client config or sent to the hosted server.

### 9.3 x402 Paid-Call Helper

Agents that cannot replay x402 challenges natively can use:

```bash
npx --yes --package @oobe-protocol-labs/sap-mcp-server sap-mcp-x402-paid-call \
  --tool sap_list_all_agents \
  --arguments '{"limit":5}' \
  --max-usd 0.02 \
  --confirm
```

This signs payment payloads locally and retries the hosted MCP call without exposing keypair bytes.

## 10. Partner-Specific Requirements

### 10.1 OOBE / Synapse / SAP

Minimum requirements:

- Use SAP MCP as the MCP gateway.
- Use either hosted remote MCP or local stdio MCP.
- Load SAP MCP skills or document how the agent knows which tools to use.
- Use at least one SAP registry, discovery, reputation, settlement, memory, or proof flow.
- Show the active SAP profile or agent identity.
- Avoid exposing keypair bytes in logs, prompts, config snippets, screenshots, or repo files.

Advanced requirements:

- Register or update an SAP agent.
- Use SAP discovery to find agents or tools.
- Use SAP memory or proof-of-execution flows.
- Use x402/pay.sh for a paid remote tool call.
- Create a workflow that another builder can reproduce from documented steps.

### 10.2 Bento Guard

Minimum requirements:

- Use Bento Guard as a policy layer before sensitive actions.
- Define clear policy rules for agent permissions.
- Show at least one allowed action and one blocked or escalated action.
- Explain how policy decisions affect tool execution.

Advanced requirements:

- Use policy checks before transaction signing.
- Use policy checks before paid tool execution.
- Create role-based or profile-based policy boundaries.
- Generate audit logs or human-readable policy decisions.
- Combine local SAP MCP policy with Bento Guard decisions.

### 10.3 Metaplex

Minimum requirements:

- Use Metaplex-related SAP MCP tools or Synapse SAP SDK flows.
- Use Metaplex 014 Agent Registry, MPL Core, or a clearly documented Metaplex identity/asset flow.
- Demonstrate how Metaplex identity or assets relate to the SAP agent identity.
- Create, read, or update MPL Core/NFT/collection metadata.

Advanced requirements:

- Bridge identity between SAP Agent Registry and Metaplex 014 Agent Registry through the Synapse SAP SDK integration.
- Use MPL Core assets as agent credentials, access passes, reputation artifacts, proof containers, or ownership objects.
- Mint or manage an MPL Core asset or NFT collection for an agent.
- Verify creator, collection, or identity relationships.
- Combine Metaplex 014/MPL Core identity with SAP agent identity and SNS naming.

### 10.4 SNS

Minimum requirements:

- Use SNS to resolve, link, or check a `.sol` domain.
- Explain how the `.sol` name maps to an agent identity or wallet.

Advanced requirements:

- Link an SNS identity to an SAP agent.
- Use reverse lookup for agent discovery.
- Build an agent directory or contact flow using `.sol` names.
- Combine SNS identity with SAP reputation or Metaplex assets.

### 10.5 Krexa Or Agent Credit Partner

This track should only be included if Krexa or another credit/lending partner confirms participation and the integration path builders should use.

Minimum requirements:

- Use SAP MCP as the agent execution and identity interface.
- Use the participating credit/lending partner for a real or documented agent credit, borrowing, repayment, or risk-scored workflow.
- Explain how the agent controls spend, signing, risk, and repayment behavior.
- Show that value-moving actions require explicit policy or user-controlled signing.

Advanced requirements:

- Connect paid revenue from x402/pay.sh or agent services to repayment-aware logic.
- Use SAP reputation or proof-of-execution as part of the agent's risk or performance story.
- Use Bento policy before credit draws, trades, repayments, venue changes, or strategy changes.
- Show clear limits for max position size, daily spend, drawdown, venue access, and emergency stop behavior.

## 11. Submission Requirements

Each submission should include:

1. Public repository or private repo access for judges.
2. Demo video under 5 minutes.
3. README with setup instructions.
4. Clear list of used SAP MCP tools.
5. Clear list of used partner technologies.
6. Architecture diagram or written architecture section.
7. Security notes explaining signing, policy, and keypair boundaries.
8. Reproducible commands for local or hosted setup.
9. Evidence of real execution, such as transaction signatures, agent public keys, SNS names, minted assets, policy decisions, or x402 receipts.

## 12. Judging Criteria

| Category | Weight | What Judges Look For |
| --- | ---: | --- |
| Real SAP MCP usage | 25% | The project actually uses SAP MCP tools, resources, prompts, skills, or hosted MCP flows. |
| Partner stack composition | 20% | Meaningful Bento, Metaplex, SNS, Krexa, or other confirmed partner usage, not superficial logo placement. |
| Technical correctness | 20% | Safe signing, working transactions, clear MCP flow, no exposed secrets, reproducible setup. |
| Product usefulness | 15% | The agent solves a real workflow for users, teams, or other agents. |
| Security and policy | 10% | Spending limits, approval flows, Bento/local policy, safe key handling. |
| Developer experience | 10% | Clean docs, simple setup, clear demo, understandable architecture. |

Full-stack bonus: judges can add discretionary weight inside a category when a project composes multiple stacks cleanly, for example SAP MCP + Bento + SNS + Metaplex, or SAP MCP + Bento + Krexa + x402/pay.sh. This should be treated as a bonus for coherent composition, not a substitute for the primary track requirements.

## 13. Security Rules

Submissions must not:

- commit keypair files
- print keypair bytes
- paste keypair bytes into MCP config
- expose private RPC keys
- bypass user approval for value-moving transactions
- represent fake or mock payments as real settlements
- use hardcoded private keys
- rely on hidden services without documentation

Submissions should:

- use dedicated SAP MCP wallets
- separate agent PDA, signer wallet, facilitator wallet, and Solana CLI wallet
- use policy checks before sensitive operations
- provide transaction previews where possible
- document which network is used
- include explicit spending limits for paid or value-moving flows

## 14. Suggested Partner Outreach Message

```text
Gm @Hanami_foresee,

@ethercode_0xKpt had an idea to run a bounty program around SAP MCP, and we would love to involve Bento as a partner since Bento Guard is already part of our stack and can be used as the policy and guardrail layer for agents.

The idea is a multi-stack Solana agent bounty with OOBE/Synapse/SAP MCP as the coordination layer, and partner requirements that encourage builders to compose each ecosystem properly:

- OOBE / Synapse / SAP: MCP gateway, SAP agent identity, discovery, payments, reputation, settlement, memory, and coordination flows.
- Bento: policy evaluation, action checks, permission boundaries, and agent safety before sensitive calls or on-chain execution.
- Metaplex: Metaplex 014 Agent Registry and MPL Core identity/asset flows as exposed through SAP MCP and the Synapse SAP SDK integration, with final Metaplex requirements defined together.
- SNS: .sol identity, domain linking, reverse lookup, and agent identity resolution.
- Optional credit/trading partner such as Krexa: agent credit, lending, repayment-aware execution, and risk-controlled trading workflows if the integration requirements are confirmed together.

The goal is to push builders beyond simple demos: agents should have identity, policy, payments, tools, and real on-chain execution paths through SAP MCP.

We are also going to talk with Metaplex, SNS, and potentially Krexa to see if they would be open to joining, so the bounty can reward projects that compose these stacks together instead of using them in isolation.

Would Bento be interested in being involved as a partner and helping us define the Bento-specific requirements for submissions?
```

## 15. Proposed Timeline

| Phase | Duration | Output |
| --- | --- | --- |
| Partner alignment | 1 week | Confirm partners, tracks, judging requirements, prize structure. |
| Builder prep | 1 week | Publish docs, examples, starter prompts, MCP config guides, skills. |
| Bounty window | 2 to 4 weeks | Builders submit projects and demos. |
| Judging | 3 to 5 days | Review demos, repos, on-chain evidence, and partner requirements. |
| Winners and follow-up | 1 week | Announce winners, publish examples, onboard strongest projects into SAP ecosystem. |

## 16. Open Questions

1. Which partners will provide prize funding, credits, or technical review?
2. Should the bounty be one combined pool or separate partner tracks?
3. Should paid x402/pay.sh calls be required or optional?
4. Should mainnet execution be required, or should devnet be accepted for early builders?
5. Should Bento policy be required for all value-moving submissions?
6. Should SNS identity linking be mandatory for registered SAP agents?
7. Should Metaplex 014 Agent Registry / MPL Core bridged identity be mandatory for the Metaplex track or treated as a bonus inside other identity projects?
8. Should Krexa or another credit/lending partner have a dedicated credit/trading track, or should it be a bonus path inside the Solana execution track?
9. Should OOBE host office hours during the bounty?

## 17. Minimum Viable Bounty

If we want to launch quickly, the minimum viable bounty should require:

1. Use SAP MCP.
2. Configure an agent through the wizard.
3. Use at least one partner integration: Bento, Metaplex, SNS, Krexa, or another confirmed partner.
4. Demonstrate one real Solana or SAP action.
5. Explain signing and policy boundaries.
6. Provide a reproducible demo.

This keeps the bounty approachable while still pushing the ecosystem toward real agent infrastructure.
