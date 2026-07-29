# MagicBlock x SAP MCP — Call Script

## Quick Context

**Who we are:** OOBE Protocol Labs — we build the Synapse Agent Protocol (SAP),
an on-chain agent commerce protocol on Solana. SAP lets AI agents discover,
pay for, and execute on-chain actions through MCP (Model Context Protocol).
Our MCP server (`sap-mcp`) is the gateway: 130+ tools wrapping Solana protocols
(Jupiter, Adrena, MagicBlock, Metaplex, SNS, Streamflow, etc.) with x402/pay.sh
metered payments.

**SAP on-chain program:** `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`
**SAP MCP server:** `https://mcp.sap.oobeprotocol.ai/mcp`
**Repo:** `https://github.com/OOBE-PROTOCOL/sap-mcp`

---

## Topic 1 — Phase 1 Recap (Done) & Phase 2 Plan

### Phase 1 — What We Built (Shipped)

We integrated MagicBlock's API surfaces into SAP MCP as 20 typed tools:

| Domain | Tools | Protocol |
|--------|-------|----------|
| ER Router | 6 (getRoutes, getIdentity, getDelegationStatus, getAccountInfo, getBlockhashForAccounts, getSignatureStatuses) | JSON-RPC 2.0 |
| Private Payments | 12 (health, challenge, login, balance, privateBalance, deposit, transfer, withdraw, swapQuote, swap, initializeMint, isMintInitialized) | REST |
| VRF | 2 (requestRandomness, getRandomnessResult) | On-chain via @solana/web3.js |

**Key design decisions:**
- Every write tool returns an unsigned `transactionBase64` — agents sign
  locally via `sap_payments_finalize_transaction`. SAP MCP is non-custodial.
- Pricing is metered through x402/pay.sh: reads are read-premium tier,
  writes are builder/value-action tier. No hardcoded prices — the central
  pricing registry resolves costs dynamically.
- Safety guardrails: private swaps to wSOL are blocked (shuttle delivery
  can leave funds stuck), private transfers require auth tokens, amounts
  are validated as positive safe integers.
- Fully typed TypeScript — zero `any`, 20 input interfaces, 15 response
  interfaces.
- 10 vitest smoke tests pass. `tsc --noEmit` clean. ESLint clean.

**Files:**
- `src/tools/magicblock-tools.ts` (1,137 lines)
- `src/tools/__tests__/magicblock-tools.test.ts`
- `docs/magicblock-tools.md`

**What this enables today:** any SAP-registered agent can deposit, transfer,
withdraw, and swap SPL tokens privately through MagicBlock's Private ER, get
VRF randomness on-chain, and route reads through the ER Router — all metered
and settled via SAP escrow/x402.

### Phase 2 — What We Want to Build Next

Phase 1 wrapped MagicBlock's **API layer**. Phase 2 goes deeper: modifying the
**SAP on-chain program itself** to use Ephemeral Rollups for state execution.

**The problem we want to solve:**

SAP is an agent commerce protocol. Every agent interaction — tool discovery,
escrow settlement, reputation updates, session delegation — is an on-chain
transaction. As agent activity scales (hundreds of agents calling tools
concurrently), the base-layer throughput becomes a bottleneck:

- Agent registration and updates require on-chain writes
- Escrow accounting (deposit, settle, refund) is base-layer state
- Reputation/score updates happen on every settled tool call
- Session delegation creates and modifies session accounts

All of this is on the base layer today. At scale, this means:
- High latency for real-time agent interactions
- SOL cost per transaction (agents need gas for every state update)
- Contention on popular agent accounts

**What ER integration gives SAP:**

By adding delegation hooks to the SAP program (via MagicBlock's Delegation
Program `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`), we can:

1. **Delegate hot agent state to ER** — agent accounts, escrow vaults,
   reputation accounts, and session accounts become ER-managed. State updates
   (reputation increments, escrow settlements, session mutations) execute at
   ER speed with gasless transactions.

2. **Batch settle tool payments** — instead of settling every x402 payment
   on-chain individually, batch them on the ER and commit periodically. This
   reduces base-layer tx count by 10-100x for high-frequency agent activity.

3. **Real-time reputation updates** — agent reputation/score can update on
   every tool call at ER speed, enabling live leaderboards, dynamic pricing
   tiers, and instant trust signals without waiting for base-layer confirmation.

4. **Session delegation at ER speed** — agent session creation and permission
   updates become near-instant, enabling rapid agent onboarding and rotation.

5. **Parallel agent execution** — multiple agents' state can be delegated to
   different ER validators (Asia, EU, US, TEE), enabling horizontal scaling
   of agent commerce across geographic regions.

**Technical approach (what needs to happen):**

The SAP on-chain program is an Anchor program. To integrate ER:

a. Add delegation/commit/undelegate instructions to the SAP program using
   MagicBlock's `#[ephemeral]` Anchor macro (or native Rust equivalent).
   This involves CPI calls to the Delegation Program.

b. Implement the undelegation callback with the exact discriminator
   `[196, 28, 41, 206, 48, 37, 51, 167]` so the Delegation Program can
   revert account ownership on the base layer.

c. Identify which SAP accounts are "hot" (candidates for delegation):
   - `AgentAccount` (agent metadata, reputation, capabilities)
   - `EscrowVault` (per-agent escrow balance for tool payments)
   - `SessionAccount` (delegated session state)
   - `ToolSchemaAccount` (tool registry entries — read-heavy)

d. Cold accounts (registry, protocol config, treasury) stay on base layer.

e. Client-side: SAP MCP would route state-mutating tool calls through the
   Magic Router (which already supports delegation-aware routing) instead
   of direct base-layer RPC. The 6 ER Router tools we built in Phase 1
   already provide the routing infrastructure.

f. Commit strategy: periodic commits of agent reputation and escrow state
   to the base layer. Fraud-proof mechanism ensures correctness.

**What we need from MagicBlock for Phase 2:**

1. **Technical guidance** — which ER validator(s) to target for production
   agent commerce (TEE vs public validators), delegation lifetime parameters,
   commit frequency recommendations for financial state (escrow).

2. **Private ER for escrow** — agent escrow balances are sensitive. We
   want to use Private ER (TEE validator) for escrow state so balances and
   settlement amounts are not publicly visible. We need guidance on the
   Permission Program setup for SAP escrow accounts.

3. **Magic Actions** — for automated commit/crank operations. We want to
   use Magic Actions to automatically commit escrow state back to the base
   layer on a schedule, without requiring an off-chain crank service.

4. **Testing on devnet** — we need to test the delegated SAP program on
   devnet ER validators before mainnet. We need access to devnet TEE if
   available, or confirmation that the public devnet validators support
   our use case.

5. **Program upgrade path** — the SAP program is already deployed on
   mainnet. We need to understand the upgrade path: can we add delegation
   instructions to an existing program via upgrade, or do we need a new
   program deployment? What are the risks for existing agent accounts?

**Timeline estimate:**
- 2-3 weeks: program modifications (add delegation hooks, tests on localnet ER)
- 1 week: devnet ER testing with SAP MCP routing
- 1 week: mainnet rollout + SAP MCP routing update
- Total: ~4-5 weeks with MagicBlock team support

---

## Topic 2 — Co-Marketing

**What we have:**
- Live integration: 20 MagicBlock tools in production SAP MCP server
- Real agent usage: SAP-registered agents can already use MagicBlock Private
  Payments and VRF today
- Public repo with full documentation: `docs/magicblock-tools.md`
- CHANGELOG entries across multiple releases documenting the integration
- SAP MCP is listed in the MCP Registry with MagicBlock as a supported protocol

**Co-marketing proposals:**

1. **Joint announcement** — blog post / Twitter thread co-branded. We
   announce "SAP MCP integrates MagicBlock ER for private agent payments and
   real-time agent commerce." MagicBlock announces "SAP agents can now use
   Ephemeral Rollups for gasless, private, real-time tool execution."

2. **MagicBlock as a featured protocol in SAP** — we can highlight MagicBlock
   in the SAP registry as a "recommended infrastructure provider" for agents
   that need private payments, VRF, or high-speed execution. In the SAP
   explorer town visualization (our Excalibur.js agent world), MagicBlock
   could appear as a featured building/service desk.

3. **Joint demo at a Solana event** — we can demo a live agent executing a
   private swap via MagicBlock ER, settled through SAP x402 payments, with
   real-time reputation updates on the SAP explorer. Good for Breakpoint
   or online hackathons.

4. **Cross-promotion in dev communities** — we can mention MagicBlock in
   SAP developer docs as the recommended ER layer. MagicBlock can mention
   SAP MCP as a production consumer of ER Router + Private Payments API.

5. **Content** — we can write a technical blog post: "How to build
   pay-per-call AI agents on Solana with MagicBlock ER and SAP MCP." You
   get developer mindshare, we get ER usage.

**What we'd like from MagicBlock:**
- Retweet/quote-tweet our integration announcement
- Feature SAP MCP in MagicBlock's "Built on MagicBlock" showcase
- Co-author or review the technical blog post
- Mention SAP MCP in MagicBlock's community (Telegram, Discord)

---

## Topic 3 — Support / Builder Incentive Programs

**Current situation:**
- We are self-funded, building SAP full-time
- We have a working production integration (Phase 1) with real usage
- We want to build Phase 2 (ER-native SAP program) but it requires
  significant engineering effort + MagicBlock team support

**Questions for MagicBlock:**

1. **VIP Builder Program** — we saw the MagicBlock VIP Builder Program with
   Superteam Malaysia (applications closing July 31). Are we eligible? Can
   we still apply? Or is there a separate track for production integrations
   that are already live?

2. **Direct support without a formal program** — given that we already have
   a live, production integration with real agent usage, can we get
   direct technical support and potentially a grant without going through
   the formal builder program application? We need:
   - Dedicated engineering contact at MagicBlock for Phase 2 ER integration
     questions (delegation hooks, commit strategy, Private ER permissions)
   - Devnet ER validator access for testing
   - Potentially: co-funded developer time for the program upgrade

3. **Grant use** — if we apply for and receive a grant, the funds would go
   toward:
   - Engineering time for SAP program ER integration (delegation hooks,
     commit/undelegate logic, client-side routing updates)
   - Security audit of the upgraded SAP program before mainnet
   - Infrastructure costs (RPC, monitoring) for the Phase 2 rollout

4. **What we offer in return:**
   - Production ER usage: SAP agents executing real transactions on MagicBlock
     ER, generating real ER activity and demonstrating the value proposition
   - Reference architecture: SAP as the canonical example of a Solana program
     upgraded with ER for agent commerce
   - Ongoing tooling: we maintain the MCP tools and will add new MagicBlock
     features (stealth pools, pricing oracle, Magic Actions) as they ship
   - Ecosystem growth: every agent onboarded to SAP is a potential MagicBlock
     ER user

**Our ask:** can we get a direct partnership/support arrangement, or do we
need to apply for the formal builder program? If both, what does the
application look like and what's the timeline?

---

## Talking Points Summary

| Topic | Key Message |
|-------|-------------|
| Phase 1 | Already shipped. 20 tools, production, real usage. Non-custodial, x402-metered, fully typed. |
| Phase 2 | Deeper integration: SAP program itself uses ER for agent state. Gasless, private, real-time agent commerce. Needs MagicBlock engineering support. |
| Co-marketing | Joint announcement, featured protocol in SAP registry, technical blog post, event demos. |
| Support/grants | We have a live integration. Can we get direct support or do we need to apply for the VIP Builder Program? What's the process? |

---

## Q&A Prep — Likely Questions from MagicBlock

**"How many agents are using MagicBlock tools today?"**
→ SAP MCP is live. Agent usage is growing as we onboard partners. We can
share specific usage metrics if needed.

**"Why do you need Private ER for escrow?"**
→ Agent escrow balances and settlement amounts are financial data. Making
them public on the base layer means anyone can see which agent is paying
what to which tool. Private ER keeps this confidential, which is critical
for enterprise agent adoption.

**"What happens if the ER validator goes down?"**
→ Delegated accounts can be undelegated back to the base layer. The SAP
program retains its base-layer fallback logic. The commit/fraud-proof
mechanism ensures state correctness. We'd implement monitoring + auto-
undelegation on validator health issues.

**"How does x402 pricing work with ER?"**
→ SAP meters every tool call via x402/pay.sh. Reads cost less than writes.
On ER, we can batch settlements (multiple tool calls per commit), reducing
per-call overhead. The pricing model stays the same for agents — they pay
per tool call, SAP handles the ER routing internally.

**"Are you using MagicBlock's SDK or raw API?"**
→ Phase 1 uses raw HTTP/JSON-RPC (no SDK dependency, zero external deps
beyond @solana/web3.js for VRF). Phase 2 would use the MagicBlock Anchor
SDK (`#[ephemeral]` macro) for the program-side delegation hooks, and the
existing ER Router tools for client-side routing.