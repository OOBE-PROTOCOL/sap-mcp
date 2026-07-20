# SAP Agent Identity Pipeline

This guide is the canonical SAP MCP flow for registering and maintaining an
agent identity on Synapse Agent Protocol, then optionally linking Metaplex and
SNS identity.

Use it when a user asks to register an agent, add a profile picture, update
capabilities, publish pricing, connect a `.sol` name, or bridge an agent into
NFT-backed identity.

## Production Flow

1. Start SAP context.
   - Call `sap_agent_start`.
   - Call `sap_protocol_invariants` before registry writes when treasury,
     protocol fee, hosted/local routing, or lifecycle-complete rules are
     unclear. The current registration invariant is `100000000` lamports
     credited to treasury `J7PyZAGKvprCz4SQ5DKBLAHstJxgVqZcz6kguUoWpP7P`.
   - Call `sap_agent_identity_plan` with the user's intended registration,
     profile-image update, Metaplex, SNS, or full identity goal. It returns the
     exact local-signer tools, normalized fields, metadata contract, forbidden
     actions, and verification checklist without touching chain.
   - Check hosted `sap` and local `sap_payments` readiness.
   - Use hosted `sap` for reads and paid hosted tools.
   - Use local `sap_payments_*` tools for payment signing, registry writes, and
     transaction finalization.
2. Prepare public metadata.
   - Upload images to IPFS, Arweave, Kommodo, or HTTPS.
   - Never use desktop file paths.
   - Prefer a JSON metadata document with `name`, `description`, `image`,
     `external_url`, `attributes`, `sap`, `metaplex`, `sns`, and `x402`.
3. Register the SAP agent.
   - Hosted `sap_register_agent` is accountless and rejects local-signer writes
     before payment.
   - Hosted users should call local
     `sap_payments_register_agent` with `confirm: true`.
   - A complete registration report must separate the confirmed SAP agent
     account from the protocol registration fee audit. The current source-level
     protocol fee invariant expects `100000000` lamports credited to treasury
     `J7PyZAGKvprCz4SQ5DKBLAHstJxgVqZcz6kguUoWpP7P`.
   - If `protocolFee.status` is `missing_or_underpaid`, the agent account may
     still exist, but the registration tool must fail closed with
     `success: false`, `agentRegistered: true`, and `protocolComplete: false`
     until the deployed program/treasury behavior is inspected.
4. Optionally create or link Metaplex identity.
   - Use Metaplex tools only after metadata and authority are clear.
   - For MPL Core or NFT-backed identity, set `agentUri`/`metadataUri` to the
     public metadata that references the Metaplex asset or collection.
5. Optionally link SNS identity.
   - Check availability with `sap_sns_check_domain`.
   - Check ownership with `sap_sns_check_ownership`.
   - Hosted record updates should use unsigned SNS builders, then
     `sap_payments_finalize_transaction`.
   - Direct domain registration requires local signing.
6. Update the SAP profile.
   - Use `sap_payments_update_agent` for name, description, image metadata URI,
     capabilities, protocols, pricing, `agentId`, and `x402Endpoint` updates.
   - Update arrays replace the full on-chain list; do not send only a new item
     unless replacement is intended.
7. Verify the lifecycle.
   - Fetch by owner wallet with `sap_get_agent_profile`.
   - Confirm the transaction signature.
   - For registrations, inspect `protocolFee.status` returned by
     `sap_payments_register_agent`.
   - For updates, fetch the agent again and verify every changed field.
   - For Metaplex identity, verify the NFT/MPL Core asset metadata URI and
     update authority.
   - For SNS identity, verify domain owner, reverse lookup where relevant, and
     public records.

## Register Agent Fields

| Field | Required | Description |
| --- | --- | --- |
| `name` | yes | Public display name. Keep it recognizable and stable. |
| `description` | yes | Public description of the agent purpose, protocols, and safety boundaries. |
| `capabilities` | yes | List of capabilities. Prefer object form with `id`, `description`, `protocolId`, and `version`. |
| `pricing` | no | Agent-advertised pricing tiers. Use USDC + x402 for agent commerce. |
| `protocols` | yes | Protocol tags such as `sap`, `mcp`, `jupiter`, `pyth`, `metaplex`, `sns`, `x402`. |
| `agentId` | no | Stable lowercase id, for example `solking`. |
| `agentUri` | no | Public metadata/profile URI. Never a local file path. |
| `metadataUri` | no | Alias for `agentUri`; prefer this name when the URI points to metadata JSON. |
| `x402Endpoint` | no | Public x402 discovery/payment endpoint, usually `https://host/.well-known/x402`. |
| `confirm` | local bridge | Required `true` for `sap_payments_register_agent`. |

## Protocol Fee Invariant

SAP registration has two separate economic surfaces:

- local on-chain registration fee: the current source-level invariant expects
  `100000000` lamports (`0.1 SOL`) credited by the SAP program to treasury
  `J7PyZAGKvprCz4SQ5DKBLAHstJxgVqZcz6kguUoWpP7P`;
- hosted x402/pay.sh fees: paid only for hosted paid tools. Local
  `sap_payments_register_agent` and `sap_payments_update_agent` do not charge a
  hosted x402 access fee.

The local bridge returns a `protocolFee` audit object after
`sap_payments_register_agent`:

```json
{
  "status": "verified",
  "expectedTreasury": "J7PyZAGKvprCz4SQ5DKBLAHstJxgVqZcz6kguUoWpP7P",
  "expectedLamports": "100000000",
  "observedLamportsDelta": "100000000"
}
```

If `protocolFee.status` is `missing_or_underpaid`, report that the agent account
may exist when `agentRegistered` is true, but the SAP registration lifecycle is
not complete. `success` must stay false, `protocolComplete` must stay false, and
the agent must not claim fee capture is working for the deploy. Treat it as a
deployed-program, IDL/SDK, or RPC integrity issue and inspect the transaction
before any retry. If the status is `unavailable`, the registration account may
exist but the fee invariant is unproven; fetch the transaction through another
RPC or explorer before making business claims.

### Capability Object

```json
{
  "id": "jupiter:swap",
  "description": "Jupiter quote and swap execution with user policy limits",
  "protocolId": "jupiter",
  "version": "1.0.0"
}
```

Recommended capability ids use `protocol:action` naming:

- `jupiter:quote`
- `jupiter:swap`
- `jupiter:shield`
- `pyth:price`
- `coingecko:market-data`
- `metaplex:identity`
- `sns:identity`
- `x402:payments`
- `risk:management`

### Pricing Tier Object

```json
{
  "tierId": "standard",
  "pricePerCall": "1000",
  "tokenType": "usdc",
  "tokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "tokenDecimals": 6,
  "settlementMode": "x402",
  "rateLimit": 10,
  "maxCallsPerSession": 100,
  "volumeCurve": [
    { "afterCalls": 100, "pricePerCall": "800" },
    { "afterCalls": 1000, "pricePerCall": "500" }
  ]
}
```

`pricePerCall`, `minPricePerCall`, `maxPricePerCall`, and
`minEscrowDeposit` are always smallest units:

- `sol`: lamports
- `usdc`: micro-USDC
- `spl`: base units of `tokenMint`

Valid `tokenType` values are `sol`, `usdc`, and `spl`.

Valid `settlementMode` values are `instant`, `escrow`, `batched`, and `x402`.

## Update Agent Fields

`sap_payments_update_agent` accepts the same public profile fields as
registration, but every field is optional:

- `name`
- `description`
- `capabilities`
- `pricing`
- `protocols`
- `agentId`
- `agentUri`
- `metadataUri`
- `x402Endpoint`
- `confirmationTimeoutMs`
- `confirm`

Omitted fields stay unchanged. Array fields are full replacements.

For profile images, first publish metadata:

```json
{
  "name": "Solking",
  "description": "Solana spot-trading agent with risk management.",
  "image": "https://example.com/solking.png",
  "external_url": "https://explorer.oobeprotocol.ai/agents/<wallet>",
  "attributes": [
    { "trait_type": "Protocol", "value": "SAP" },
    { "trait_type": "Identity", "value": "Metaplex + SNS" }
  ],
  "sap": {
    "agentId": "solking",
    "wallet": "<owner-wallet>",
    "capabilities": ["jupiter:swap", "pyth:price", "risk:management"]
  },
  "metaplex": {
    "asset": "<mpl-core-or-nft-asset>"
  },
  "sns": {
    "domain": "solking.sol"
  },
  "x402": {
    "endpoint": "https://example.com/.well-known/x402"
  }
}
```

Then call:

```json
{
  "metadataUri": "https://example.com/agent-metadata.json",
  "confirm": true
}
```

## Agent Rules

- Do not call hosted `sap_register_agent` or hosted `sap_update_agent` after
  `hosted_local_signer_required`.
- Prefer `sap_agent_identity_plan` before registration or profile updates so
  the agent has a safe copy-pasteable route.
- Do not call registration complete until `sap_payments_register_agent`
  confirms the agent account and reports a non-failing `protocolFee` audit.
- Do not call profile/image update complete until `sap_payments_update_agent`
  confirms and a fresh `sap_get_agent_profile` read shows the intended fields.
- Do not create temporary signing scripts.
- Do not read keypair JSON.
- Do not pay x402 for writes that the hosted server says require local signer.
- Prefer local bridge tools:
  - `sap_payments_register_agent`
  - `sap_payments_update_agent`
  - `sap_payments_finalize_transaction`
- If a transaction is submitted but not confirmed, inspect the returned
  signature and confirmation status before retrying. Ask the user before a
  fresh write attempt.

## Copy-Paste Registration

```json
{
  "name": "Solking",
  "description": "Solana spot-trading agent with risk management, SAP-Metaplex bridged identity, and SNS identity.",
  "capabilities": [
    {
      "id": "jupiter:quote",
      "description": "Fetch Jupiter quotes for spot trading.",
      "protocolId": "jupiter",
      "version": "1.0.0"
    },
    {
      "id": "jupiter:swap",
      "description": "Build and execute user-approved Jupiter swaps.",
      "protocolId": "jupiter",
      "version": "1.0.0"
    },
    {
      "id": "risk:management",
      "description": "Apply user-defined limits before trading actions.",
      "protocolId": "sap",
      "version": "1.0.0"
    },
    {
      "id": "metaplex:identity",
      "description": "Expose NFT-backed or MPL Core identity metadata.",
      "protocolId": "metaplex",
      "version": "1.0.0"
    }
  ],
  "pricing": [
    {
      "tierId": "standard",
      "pricePerCall": "1000",
      "tokenType": "usdc",
      "tokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "tokenDecimals": 6,
      "settlementMode": "x402",
      "rateLimit": 10,
      "maxCallsPerSession": 100
    }
  ],
  "protocols": ["sap", "mcp", "jupiter", "pyth", "metaplex"],
  "agentId": "solking",
  "metadataUri": "https://example.com/agent-metadata.json",
  "confirm": true
}
```
