# MagicBlock Tools

> 20 MCP tools wrapping the MagicBlock ER Router, Private Payment API, and Solana VRF.

---

## Overview

The SAP MCP server now includes 20 MagicBlock tools that wrap two MagicBlock
API surfaces:

1. **ER Router** — JSON-RPC 2.0 at `https://(devnet-)router.magicblock.app`
2. **Private Payment API** — REST at `https://payments.magicblock.app`

A third protocol (VRF) is implemented on-chain using `@solana/web3.js` —
it builds unsigned transactions that invoke the VRF program
(`Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz`) and reads
`RandomnessRequest` accounts to check fulfillment.

All tools are registered automatically when the MCP server starts — no
additional configuration needed.

---

## Pricing

Hosted pricing is resolved centrally by `src/payments/pricing.ts` and returned
as an x402/pay.sh challenge before the paid tool executes.

| Tier | Tools |
|------|-------|
| Free/readiness | MCP discovery, SAP skill bootstrap, payment readiness, transaction decode/preview |
| Read-premium | ER Router queries, balances, swap quotes, mint checks, VRF result |
| Builder | Deposit, transfer, withdraw, initialize mint, VRF request transaction builders |
| Value-action | Public/private swap transaction builders and other value-moving actions |

Do not hard-code MagicBlock prices in agents. Call `sap_x402_estimate_cost` or
the local `sap_payments_call_paid_tool` helper and enforce the user profile's
`maxPriceUsd` / spend policy.

Successful MagicBlock tool payloads intentionally do not report their own
price. Hosted cost is authoritative only in the SAP MCP x402 challenge and the
payment receipt returned by `sap_payments_call_paid_tool`.

When a hosted MagicBlock builder returns an unsigned transaction, hosted SAP MCP
remains non-custodial. Finalize the returned `transactionBase64` with the local
`sap_payments_finalize_transaction` bridge. Do not call hosted
`sap_sign_transaction`, create temporary signing scripts, or read keypair JSON.

---

## Tools (20 total)

### ER Router (6 read-only)

| Tool | Description |
|------|-------------|
| `magicblock_getRoutes` | List available ER nodes (identity, FQDN, fee, block time, country) |
| `magicblock_getIdentity` | Get the identity and FQDN of the current ER validator |
| `magicblock_getDelegationStatus` | Check if a Solana account is delegated to an ER |
| `magicblock_getAccountInfo` | Fetch account info via the Magic Router |
| `magicblock_getBlockhashForAccounts` | Get a blockhash for a batch of accounts (max 100) |
| `magicblock_getSignatureStatuses` | Check transaction confirmation status |

### Private Payments — Meta & Auth (3)

| Tool | Description |
|------|-------------|
| `magicblock_health` | Check Private Payments API health |
| `magicblock_challenge` | Generate a challenge string for wallet auth |
| `magicblock_login` | Exchange signed challenge for bearer token |

### Private Payments — Balance (2)

| Tool | Description |
|------|-------------|
| `magicblock_balance` | Read base-chain SPL token balance |
| `magicblock_privateBalance` | Read ephemeral-rollup SPL balance (requires auth) |

### Private Payments — SPL Token Flows (3)

| Tool | Description |
|------|-------------|
| `magicblock_deposit` | Build unsigned deposit tx (Solana → ER) |
| `magicblock_transfer` | Build unsigned SPL transfer (public or private) |
| `magicblock_withdraw` | Build unsigned withdraw tx (ER → Solana) |

### Private Payments — Swap (2)

| Tool | Description |
|------|-------------|
| `magicblock_swapQuote` | Get a swap quote between two SPL mints |
| `magicblock_swap` | Build unsigned swap tx (public or private) |

### Private Payments — Mint Init (2)

| Tool | Description |
|------|-------------|
| `magicblock_initializeMint` | Build unsigned mint transfer queue init tx |
| `magicblock_isMintInitialized` | Check if a mint's transfer queue exists |

### VRF (2 — on-chain via @solana/web3.js)

| Tool | Description |
|------|-------------|
| `magicblock_requestRandomness` | Build unsigned tx invoking request_randomness on the VRF program (Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz) |
| `magicblock_getRandomnessResult` | Read the RandomnessRequest account on-chain to check fulfillment and retrieve random bytes |

---

## Auth Flow (Private Ephemeral Rollup)

```
1. magicblock_challenge({ pubkey })          → { challenge: "..." }
2. Wallet signs the challenge string
3. magicblock_login({ pubkey, challenge, signature })  → { token: "..." }
4. Pass authToken on magicblock_privateBalance and magicblock_transfer (private)
```

---

## Transaction Flow (Write Tools)

Write tools return an unsigned transaction:

```json
{
  "kind": "deposit",
  "version": "legacy",
  "transactionBase64": "AQAAAA...",
  "sendTo": "base",
  "recentBlockhash": "9A4VhP8M...",
  "lastValidBlockHeight": 284512337,
  "instructionCount": 3,
  "requiredSigners": ["3rXKwQ1kpjBd..."]
}
```

Expected flow:

1. Call the MagicBlock tool (e.g. `magicblock_deposit`) → get `transactionBase64`
2. If the transaction came from hosted SAP MCP, call local
   `sap_payments_finalize_transaction` with `confirm: true` and `submit: false`
   for preview/sign, or `submit: true` after user approval.
3. If the transaction came from local stdio SAP MCP, use
   `sap_preview_transaction` → `sap_sign_transaction` →
   `sap_submit_signed_transaction`.
4. Record the signed transaction or submitted signature in the audit trail.

Agents must not create temporary JavaScript signing scripts, read keypair JSON,
or sign raw message bytes outside SAP MCP transaction tools.

## Safety Guardrails

SAP MCP fails closed for MagicBlock flows that live testing has shown to be
unsafe:

- `magicblock_swap` with `visibility: "private"` requires a valid
  `destination`. The server rejects the request before contacting MagicBlock if
  the destination is missing or invalid.
- `magicblock_swap` with `visibility: "private"` and
  `quoteResponse.outputMint = So11111111111111111111111111111111111111112`
  is blocked. Mainnet testing found that private swaps outputting wSOL can leave
  funds stuck in the Hydra mixer pool when shuttle delivery fails. Use
  `visibility: "public"` for SOL output, or swap privately into a non-SOL SPL
  token until MagicBlock provides shuttle delivery recovery.
- `magicblock_transfer` requires `from`, `to`, `mint`, `amount`,
  `visibility`, `fromBalance`, and `toBalance`. `amount` must be a positive
  JavaScript-safe integer in token base units because the upstream API expects a
  JSON number, not a string.
- Private transfers require a bearer token from `magicblock_challenge` and
  `magicblock_login`. Private SOL transfers may deliver wSOL, not native SOL;
  agents should say that clearly before asking for confirmation.

---

## Response Format

Successful tool responses are wrapped by SAP MCP:

```json
{
  "success": true,
  "tool": "magicblock_deposit",
  "data": { ... }
}
```

Error responses:

```json
{
  "error": "MagicBlock tool magicblock_deposit failed",
  "message": "MagicBlock API 400: ..."
}
```

---

## File Reference

| File | Description |
|------|-------------|
| `src/tools/magicblock-tools.ts` | 20 tool registrations with HTTP client |
| `src/tools/__tests__/magicblock-tools.test.ts` | 10 smoke tests |
| `src/tools/index.ts` | Barrel export |
| `src/tools/register-tools.ts` | Registration call during server init |
