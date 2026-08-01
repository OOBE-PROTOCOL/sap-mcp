# Agentic Standards Alignment

Reviewed: 2026-08-01

This document maps current agentic standards and emerging protocols to SAP MCP. It is intentionally conservative: SAP MCP should interoperate with standards where they improve execution, trust, payments, user consent, or discovery, but it should not claim broad support for ambiguous or early protocols until the implementation is real and tested.

## Positioning

SAP MCP is the Solana execution, policy, trust, and payment coordination layer for agents.

It should not try to replace MCP, A2A, x402, AP2, AG-UI, A2UI, OASF, ACP, or UCP. Instead, SAP MCP should connect them to Solana-native execution:

| Layer | External Standard | SAP MCP Role |
| --- | --- | --- |
| Agent to tools/data | MCP | Primary execution surface for hosted and local SAP tools. |
| Agent to agent | A2A, ANP | Expose SAP agents and SAP registry metadata to agent networks. |
| Agent to user interface | AG-UI, A2UI, MCP Apps | Power SAP Studio, transaction previews, consent flows, and live operation status. |
| Payments | x402, pay.sh | Pay-per-tool, premium stream, webhook, and external agent payment rails. |
| User authorization | AP2-style mandates | Signed intent, spend limits, trade constraints, and approval proofs before payment or execution. |
| Commerce lifecycle | ACP, UCP | Future retail/B2B checkout integration; not a replacement for x402 or SAP registry flows. |
| Identity/discovery/trust | SAP, OASF, ERC-8004 concepts | Solana-native agent identity, profile metadata, capabilities, pricing, reputation, and attestations. |

## Implementation Tiers

### Tier 1: Production-Critical

These directly reduce user friction or payment/execution failures and should drive near-term releases.

#### MCP

Current SAP MCP already uses Streamable HTTP MCP and stdio for local signing bridges. Next work:

- Track the latest MCP spec and SDK changes before changing protocol behavior.
- Prepare a compatibility layer for Tasks or long-running operations where supported by runtimes.
- Keep `tools/list`, prompts, resources, and base readiness calls free and fast.
- Preserve strict JSON schemas, output schemas, annotations, and descriptions for every tool.
- Do not expose private-key or local-path assumptions through hosted tools.

Recommended SAP MCP primitives:

- `sap_agent_start` for bootstrap.
- `sap_agent_context` / `sap_quick_context` for concise fresh state.
- `sap_prepare_action` for intent-level routing, cost, confirmation policy, and proof-tape requirements.
- `sap_agent_standard_context` for conservative MCP/x402/A2A-style/OASF/AP2-style standards routing and public claim boundaries.
- `sap_prepare_mandate` for unsigned, bounded AP2-style agent-commerce mandate drafts.
- `sap_payments_process_status` and `sap_payments_readiness` for local bridge health.

#### x402 and pay.sh

SAP MCP should remain x402-native. Required behavior:

- Paid hosted tools return standard 402 payment challenges.
- Local `sap_payments` signs x402 proofs and retries paid calls without exposing keypair bytes.
- External x402 endpoints discovered through SAP metadata use `sap_payments_call_external_x402`.
- Free readiness data remains free: balances, single-asset prices, profile status, process status, and basic startup context.
- Every payment attempt returns a proof object: amount, asset, network, settlement signature or failure class, retry status, and tool binding.

Do not describe x402 failures as generic tool errors. Agent-facing errors should distinguish:

- payment required;
- payer balance insufficient;
- facilitator unavailable;
- stale challenge or blockhash;
- local signer unavailable;
- hosted local-signer write rejected before payment.

#### Local Signing And Hosted Unsigned Builders

Hosted SAP MCP is accountless. Every value-moving or wallet-owned write must follow one of these paths:

1. hosted unsigned builder -> `sap_payments_finalize_transaction`;
2. local `sap_payments_*` write helper;
3. local full SAP MCP profile when a hosted builder does not exist yet.

Agents must not create temporary signing scripts, read keypair JSON, or call hosted write tools again after `hosted_local_signer_required`.

### Tier 2: Strategic Interop

These improve distribution and interoperability but should be implemented as clean adapters, not as core rewrites.

#### A2A

A2A is complementary to MCP. SAP MCP should expose SAP agents to A2A-style discovery while keeping tool execution in MCP.

Recommended steps:

- Keep `/.well-known/agent-card.json` public, secret-free, and machine-readable.
- Add A2A-compatible fields where stable: provider identity, version, capabilities, supported transports, auth/payment notes, and task capabilities.
- Consider signed agent cards only after key management and rotation are documented.
- Map SAP agent registry profiles to A2A agent cards without duplicating canonical identity.

#### OASF

OASF-style metadata can make SAP registry discovery easier for external directories.

Recommended steps:

- Use `sap_export_agent_oasf` to export exact owner-wallet SAP profiles into an OASF-style shape.
- Keep SAP canonical fields: owner, PDA, capabilities, protocols, pricing, x402 endpoint, metadata URI, reputation, and attestations.
- Provide adapters rather than replacing SAP schema names.

#### AP2-Style Mandates

AP2-style mandates are valuable even before full external AP2 support.

Implemented SAP MCP primitive: `sap_prepare_mandate`. It returns an unsigned planning artifact with this shape:

```json
{
  "intentId": "sap-intent-...",
  "userIntent": "Open a BONK short with max 10 USDC collateral",
  "constraints": {
    "maxX402Usd": "0.05",
    "maxTradeUsd": "10",
    "maxSlippageBps": 100,
    "allowedProtocols": ["sap", "jupiter", "adrena"]
  },
  "expiresAt": "ISO-8601",
  "profile": "local-profile-name",
  "wallet": "public-key",
  "requiresConfirmationAboveUsd": "10",
  "proofTape": []
}
```

This should become an agent-readable consent artifact tied to local policy, x402 receipts, unsigned builders, and final transaction signatures.

### Tier 3: Future Product Surface

These are promising but should be productized only when there is a clear SAP use case.

#### AG-UI, A2UI, And MCP Apps

Use these for SAP Studio and wizard-like in-agent experiences:

- live payment challenge status;
- transaction preview and confirmation;
- position/risk dashboard;
- agent profile editor;
- skill refresh and repair view;
- premium stream/webhook subscription setup.

The security rule is simple: hosted SAP MCP can return UI descriptors or state, but it must not ship arbitrary unreviewed code to agent clients.

#### ACP And UCP

The acronym `ACP` is overloaded. Do not claim generic ACP support.

Use precise names:

- Agentic Commerce Protocol for retail checkout/catalog flows.
- Virtuals Agent Commerce Protocol for onchain agent commerce if integrating that ecosystem.
- Agent Connect Protocol for AGNTCY discovery/interconnect if needed.
- Agent Client Protocol for IDE/coding agent integrations.

SAP MCP should adopt ACP/UCP only for actual commerce lifecycle features: catalog, quote, order, checkout, fulfillment, cancellation, and post-purchase status. It should not be used for internal SAP tool pricing where x402 is already the right primitive.

## Public Claims

Safe public language:

- "SAP MCP is MCP-native and x402/pay.sh-enabled."
- "SAP MCP exposes Solana-native agent identity, registry, reputation, tools, payments, and local non-custodial signing."
- "SAP MCP can interoperate with A2A-style agent cards and OASF-style metadata exports."
- "SAP MCP is preparing AP2-style signed mandates for user authorization and auditability."

Avoid:

- "SAP MCP supports every agentic commerce standard."
- "SAP MCP supports ACP" without naming which ACP.
- "Hosted SAP MCP signs user transactions."
- "x402 replaces AP2/ACP/UCP."
- "A2A replaces MCP."

## Engineering Roadmap

### Implemented Control-Plane Scope

1. `sap_agent_standard_context`
   - MCP endpoint and hosted/local transport map;
   - x402/pay.sh discovery and receipt rules;
   - A2A-style agent-card boundary;
   - OASF export availability;
   - AP2-style mandate support flag;
   - safe/unsafe public claims.

2. `sap_export_agent_oasf`
   - exact owner-wallet export;
   - no private paths or keypair material;
   - includes identity, PDA, capabilities, protocols, pricing, x402 endpoint, metadata URI, trust facts, and source fragments when requested.

3. `sap_prepare_mandate`
   - no signing and no payment;
   - returns intent constraints, payment policy, confirmation requirements, expiry, route, forbidden actions, and proof-tape template.

### Next Release Candidate Scope

1. Add A2A card hardening:
   - keep `.well-known/agent-card.json` accurate;
   - add version, capability, payment, and trust-boundary fields;
   - prepare signature support as opt-in.

2. Add SAP Studio readiness hooks:
   - premium stream status;
   - payment challenge lifecycle;
   - local bridge status;
   - transaction preview state.

3. Add optional HTTP resource mirrors for standards consumers:
   - `/agents/{wallet}/oasf.json`;
   - `/mandates/schema.json`;
   - signed agent-card proof endpoint once key rotation is documented.

### Security Requirements

- Never expose keypair bytes or wallet files through hosted endpoints.
- Never let marketplace config require secrets for free discovery.
- Never accept arbitrary plugin code over MCP input.
- Validate every plugin manifest and schema before exposure.
- Bind x402 payments to method, params hash, price, network, asset, and resource.
- Bind transaction finalization to preview, local policy, expected signer, and explicit submit flag.
- Treat standards adapters as serializers/exporters first, not privileged execution paths.

## Summary

SAP MCP should become the Solana-native coordination layer between the agent standards stack and real onchain execution.

The priority is not more buzzwords. The priority is:

1. MCP-native execution that agents understand immediately;
2. x402/pay.sh payments that are smooth, auditable, and cheap enough to use often;
3. local non-custodial signing that never leaks key material;
4. A2A/OASF-compatible discovery so external agent networks can understand SAP agents;
5. AP2-style mandates so users can prove what they authorized;
6. AG-UI/A2UI/MCP Apps for transaction previews and human-in-the-loop flows.
