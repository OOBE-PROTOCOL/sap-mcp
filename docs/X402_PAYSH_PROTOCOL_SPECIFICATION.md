# x402 Payment Protocol — Complete Specification

**Source**: Extracted from `@x402/core@2.17.0` and `@x402/svm@2.17.0` TypeScript definitions, implementation source, and READMEs.
**Protocol Version**: V2 (current), V1 (legacy, still supported)

---

## 1. Protocol Overview

x402 is an HTTP-based payment protocol that monetizes API endpoints using the HTTP 402 "Payment Required" status code. The flow involves three actors:

- **Resource Server** — the API that requires payment
- **Client** — the caller that wants to access the resource
- **Facilitator** — a third-party service that verifies and settles payments on-chain

### High-Level Flow

```
Client                              Server                      Facilitator
  |                                    |                            |
  |--- GET /protected-resource ------->|                            |
  |                                    |                            |
  |<-- 402 Payment Required -----------|                            |
  |    (PAYMENT-REQUIRED header)        |                            |
  |                                    |                            |
  |    [client constructs payment]      |                            |
  |                                    |                            |
  |--- GET /protected-resource -------->|                            |
  |    PAYMENT-SIGNATURE: <base64>      |                            |
  |                                    |--- POST /verify ---------->|
  |                                    |    {paymentPayload, reqs}  |
  |                                    |<-- {isValid: true} ---------|
  |                                    |                            |
  |    [server executes handler]        |                            |
  |                                    |--- POST /settle ---------->|
  |                                    |    {paymentPayload, reqs}  |
  |                                    |<-- {success: true, tx} ----|
  |                                    |                            |
  |<-- 200 OK -------------------------|                            |
  |    PAYMENT-RESPONSE: <base64>       |                            |
```

---

## 2. HTTP Headers

### V2 Protocol (Current — version 2)

| Header | Direction | Encoding | Content |
|---|---|---|---|
| `PAYMENT-REQUIRED` | Server → Client (on 402) | Base64-encoded JSON | `PaymentRequired` object |
| `PAYMENT-SIGNATURE` | Client → Server (on retry) | Base64-encoded JSON | `PaymentPayload` object |
| `PAYMENT-RESPONSE` | Server → Client (on 200) | Base64-encoded JSON | `SettleResponse` object |
| `Settlement-Overrides` | Server internal | JSON string | Optional partial settlement amount |

### V1 Protocol (Legacy — version 1)

| Header | Direction | Encoding | Content |
|---|---|---|---|
| `X-PAYMENT` | Client → Server (on retry) | Base64-encoded JSON | `PaymentPayloadV1` object |
| `X-PAYMENT-RESPONSE` | Server → Client (on 200) | Base64-encoded JSON | `SettleResponseV1` object |

**Note**: In V1, the `PaymentRequired` object was placed in the **response body** (JSON), not in a header. In V2, it moved to the `PAYMENT-REQUIRED` header.

### Encoding Implementation

All headers are encoded as:
```typescript
// Encode: JSON stringify → Base64
function encodePaymentSignatureHeader(paymentPayload: PaymentPayload): string {
  return safeBase64Encode(JSON.stringify(paymentPayload));
}

// Decode: Base64 → JSON parse
function decodePaymentSignatureHeader(header: string): PaymentPayload {
  if (!Base64EncodedRegex.test(header)) throw new Error("Invalid payment signature header");
  return JSON.parse(safeBase64Decode(header));
}
```

The same pattern applies to `encodePaymentRequiredHeader` / `decodePaymentRequiredHeader` and `encodePaymentResponseHeader` / `decodePaymentResponseHeader`.

### Server-Side Header Extraction

The server checks for the payment header in a case-insensitive manner:
```typescript
extractPayment(adapter) {
  const header = adapter.getHeader("payment-signature") 
             || adapter.getHeader("PAYMENT-SIGNATURE");
  if (header) {
    return decodePaymentSignatureHeader(header);
  }
  return null;
}
```

---

## 3. The 402 Response Body

### Status Code
- **402** — Payment Required (standard case)
- **412** — Precondition Failed (special case: `error === "permit2_allowance_required"`)

### For Browser Requests (Accept: text/html, User-Agent contains "Mozilla")
The server returns an HTML paywall page instead of JSON. If `@x402/paywall` is installed, it generates a wallet-connection UI. Otherwise, a fallback HTML page is returned.

### For API Clients
- **Content-Type**: `application/json` (or custom via `unpaidResponseBody` callback)
- **Body**: Empty object `{}` by default, or custom preview data if `unpaidResponseBody` is configured
- **Headers**: `PAYMENT-REQUIRED: <base64>` always present

### The `PaymentRequired` object (V2):

```typescript
type PaymentRequired = {
  x402Version: 2;
  error?: string;              // Error message (e.g., "Payment required", "No matching payment requirements")
  resource: ResourceInfo;      // What's being paid for
  accepts: PaymentRequirements[]; // Array of acceptable payment options
  extensions?: Record<string, unknown>; // Server-declared extensions
};

type ResourceInfo = {
  url: string;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  iconUrl?: string;
};
```

### The `PaymentRequired` object (V1):

```typescript
type PaymentRequiredV1 = {
  x402Version: 1;
  error?: string;
  accepts: PaymentRequirementsV1[]; // No top-level `resource` field
};
```

---

## 4. Payment Requirements Schema

### V2 PaymentRequirements (current)

```typescript
type PaymentRequirements = {
  scheme: string;           // Payment scheme, e.g., "exact"
  network: Network;          // CAIP-2 format, e.g., "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "eip155:8453"
  amount: string;            // Amount in atomic units (smallest token unit, e.g., lamports/wei)
  asset: string;             // Token identifier (mint address, contract address, etc.)
  payTo: string;             // Recipient address
  maxTimeoutSeconds: number; // Payment validity window
  extra: Record<string, unknown>; // Scheme-specific metadata (e.g., feePayer for SVM)
};
```

**Network format (V2)**: CAIP-2 compliant — `${namespace}:${reference}`, minimum length 3, must contain a colon.
- Solana mainnet: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
- Solana devnet: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`
- Base: `eip155:8453`

### V1 PaymentRequirements (legacy)

```typescript
type PaymentRequirementsV1 = {
  scheme: string;
  network: string;              // Simple name, e.g., "solana", "solana-devnet" (no CAIP-2)
  maxAmountRequired: string;    // V1 uses "maxAmountRequired" instead of "amount"
  resource: string;             // V1 includes resource URL directly in requirements
  description: string;          // V1 includes description in requirements (not in top-level response)
  mimeType?: string;            // V1 includes mimeType in requirements
  outputSchema?: Record<string, unknown>;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: Record<string, unknown>;
};
```

### V1 vs V2 Key Differences

| Field | V1 | V2 |
|---|---|---|
| Version marker | `x402Version: 1` | `x402Version: 2` |
| Amount field | `maxAmountRequired` | `amount` |
| Network format | Simple names (`solana`, `solana-devnet`) | CAIP-2 (`solana:5eykt4Us...`) |
| Network validation | Loose (any non-empty string) | Strict (min length 3, must contain `:`) |
| Resource info | Embedded in each `PaymentRequirements` | Top-level `resource: ResourceInfo` on `PaymentRequired` |
| `description` | Required field on each requirement | Optional, on top-level `ResourceInfo` |
| `mimeType` | Optional field on each requirement | Optional, on top-level `ResourceInfo` |
| `outputSchema` | Present | Removed |
| Payment header | `X-PAYMENT` | `PAYMENT-SIGNATURE` |
| Settlement header | `X-PAYMENT-RESPONSE` | `PAYMENT-RESPONSE` |
| 402 body | `PaymentRequiredV1` JSON in body | `PAYMENT-REQUIRED` header (body is empty/custom) |
| Extensions | Limited | Full support (`extensions` on `PaymentRequired` and `PaymentPayload`) |

### V1→V2 Network Mapping (SVM)

```
solana          → solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
solana-devnet   → solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
solana-testnet  → solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z
```

---

## 5. Payment Payload Schema

### V2 PaymentPayload (what the client sends in `PAYMENT-SIGNATURE`)

```typescript
type PaymentPayload = {
  x402Version: 2;
  resource?: ResourceInfo;          // Echo of what's being paid for (optional)
  accepted: PaymentRequirements;     // The specific requirements the client chose to satisfy
  payload: Record<string, unknown>;  // Scheme-specific payment data
  extensions?: Record<string, unknown>; // Extension echoes/additions
};
```

**For SVM (Solana)**, the `payload` field contains:

```typescript
type ExactSvmPayloadV2 = {
  // (same as V1 currently, reserved for future extensions)
  transaction: string;  // Base64-encoded Solana transaction
};

type ExactSvmPayloadV1 = {
  transaction: string;  // Base64-encoded Solana transaction
};
```

The Solana transaction contains:
- Compute budget instructions (unit limit + priority fee)
- SPL Token `TransferChecked` instruction (source ATA → destination ATA)
- Memo instruction (optional)
- Partial signing by the client; the facilitator adds its signature as fee payer

### V1 PaymentPayload

```typescript
type PaymentPayloadV1 = {
  x402Version: 1;
  scheme: string;                   // e.g., "exact"
  network: Network;                 // e.g., "solana-devnet"
  payload: Record<string, unknown>; // Scheme-specific payment data
};
```

Key difference: V1 has `scheme` and `network` as top-level fields; V2 has `accepted: PaymentRequirements` (which contains scheme/network/amount/etc).

---

## 6. Facilitator Endpoints

### Base URL
Default: `https://x402.org/facilitator`  
Configurable via `HTTPFacilitatorClient({ url: "..." })`

### Authentication
Optional via `createAuthHeaders` callback returning per-path headers:
```typescript
{
  verify: Record<string, string>,
  settle: Record<string, string>,
  supported: Record<string, string>,
  bazaar?: Record<string, string>
}
```

---

### POST `/verify`

**Request:**
```http
POST /verify HTTP/1.1
Content-Type: application/json

{
  "x402Version": 2,
  "paymentPayload": { /* PaymentPayload */ },
  "paymentRequirements": { /* PaymentRequirements */ }
}
```

**Request body type (VerifyRequest):**
```typescript
type VerifyRequest = {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};
```

**Response (200 OK):**
```json
{
  "isValid": true,
  "payer": "optional-payer-address"
}
```

**Response (verify failed — still 200, isValid: false):**
```json
{
  "isValid": false,
  "invalidReason": "amount_mismatch",
  "invalidMessage": "Payment amount does not match requirements"
}
```

**VerifyResponse schema:**
```typescript
type VerifyResponse = {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
  extensions?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};
```

**Error handling**: If the facilitator returns non-200, and the body contains `isValid`, it's thrown as `VerifyError(statusCode, response)`. Otherwise thrown as generic Error.

---

### POST `/settle`

**Request:**
```http
POST /settle HTTP/1.1
Content-Type: application/json

{
  "x402Version": 2,
  "paymentPayload": { /* PaymentPayload */ },
  "paymentRequirements": { /* PaymentRequirements */ }
}
```

**Request body type (SettleRequest):**
```typescript
type SettleRequest = {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};
```

**Response (200 OK):**
```json
{
  "success": true,
  "transaction": "5xK...signature...",
  "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "payer": "optional-payer-address",
  "amount": "1000000"
}
```

**SettleResponse schema:**
```typescript
type SettleResponse = {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  transaction: string;       // On-chain transaction signature/hash
  network: Network;
  amount?: string;            // Actual settled amount (for partial/upto schemes)
  extensions?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};
```

**Error handling**: If facilitator returns non-200 with `success` in body, thrown as `SettleError(statusCode, response)`.

---

### GET `/supported`

**Request:**
```http
GET /supported HTTP/1.1
Content-Type: application/json
```

**Response:**
```json
{
  "kinds": [
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      "extra": { "feePayer": "FacilitatorWalletAddress..." }
    }
  ],
  "extensions": ["bazaar"],
  "signers": {
    "solana:*": ["FacilitatorWallet1...", "FacilitatorWallet2..."]
  }
}
```

**SupportedResponse schema:**
```typescript
type SupportedResponse = {
  kinds: SupportedKind[];
  extensions: string[];
  signers: Record<string, string[]>;
};

type SupportedKind = {
  x402Version: number;
  scheme: string;
  network: Network;
  extra?: Record<string, unknown>;
};
```

**Retry**: Retries up to 3 times with exponential backoff on HTTP 429, respecting `Retry-After` header.

---

## 7. Server-Side Payment Processing Flow

### Step 1: Request arrives at protected route

```
processHTTPRequest(context) →
  1. Match route against compiled routes (method + path regex)
  2. If no route match → "no-payment-required" (pass through)
  3. Run protected request hooks (can grant access or abort)
  4. Build payment requirements from route config
  5. Enrich extensions if declared
  6. Create PaymentRequired response
```

### Step 2: Check for payment header

```
  7. Extract payment from PAYMENT-SIGNATURE header
  8. If no payment header:
     → Return 402 with PAYMENT-REQUIRED header
       (HTML paywall for browsers, JSON for API clients)
  9. If payment header present:
     → Find matching requirements from paymentPayload
     → Validate extension echoes
     → Call facilitator /verify
```

### Step 3: Verify payment

```
 10. verifyPayment(payload, matchingRequirements, extensions, transportContext)
 11. If verify fails → Return 402 with error in PAYMENT-REQUIRED
 12. If verify succeeds → Return "payment-verified" to middleware
 13. Middleware executes route handler
```

### Step 4: Settle after handler completes

```
 14. processSettlement(payload, requirements, extensions, transportContext, overrides)
 15. Check for Settlement-Overrides header in response headers
 16. Call facilitator /settle
 17. If settle succeeds:
     → Add PAYMENT-RESPONSE header to response
     → Return 200 with actual response body
 18. If settle fails:
     → Return 402 with settle error in PAYMENT-REQUIRED header
     → Body: settlement failure response (or custom via settlementFailedResponseBody)
```

---

## 8. Client-Side Payment Flow

### Step 1: Make initial request

```typescript
const response = await fetch('https://api.example.com/protected');
```

### Step 2: Handle 402 response

```typescript
if (response.status === 402) {
  // Extract PaymentRequired from PAYMENT-REQUIRED header (V2)
  // or from response body (V1)
  const paymentRequired = client.getPaymentRequiredResponse(
    (name) => response.headers.get(name),
    await response.json()  // V1 body fallback
  );
```

### Step 3: Create payment payload

```typescript
  // Client selects matching requirements and creates payment
  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  // For SVM: builds a Solana transaction with TransferChecked, signs it
```

### Step 4: Retry with payment

```typescript
  const headers = client.encodePaymentSignatureHeader(paymentPayload);
  // V2: { "PAYMENT-SIGNATURE": "<base64>" }
  // V1: { "X-PAYMENT": "<base64>" }

  const paidResponse = await fetch('https://api.example.com/protected', {
    headers: headers
  });
```

### Step 5: Extract settlement

```typescript
  if (paidResponse.status === 200) {
    const settlement = client.getPaymentSettleResponse(
      (name) => paidResponse.headers.get(name)
    );
    // V2: decode PAYMENT-RESPONSE header
    // V1: decode X-PAYMENT-RESPONSE header
    console.log('Transaction:', settlement.transaction);
  }
```

### Version-aware header encoding (client-side):

```typescript
encodePaymentSignatureHeader(paymentPayload) {
  switch (paymentPayload.x402Version) {
    case 2:
      return { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(paymentPayload) };
    case 1:
      return { "X-PAYMENT": encodePaymentSignatureHeader(paymentPayload) };
  }
}
```

---

## 9. SVM (Solana) Implementation Details

### `@x402/svm` Package

The SVM implementation uses the **"exact"** scheme — meaning the exact amount specified in `PaymentRequirements.amount` must be transferred via SPL Token `TransferChecked`.

### Network Identifiers

| V1 Name | V2 CAIP-2 |
|---|---|
| `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| `solana-testnet` | `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` |

### USDC Token Mints

- Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Devnet/Testnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

### Transaction Structure

The Solana transaction in the payment payload contains:

1. **ComputeBudget** instructions:
   - `SetComputeUnitLimit` (default: 20,000 units)
   - `SetComputeUnitPrice` (default: 1 microlamport/CU, max: 5,000,000)

2. **SPL Token `TransferChecked`** instruction:
   - Program: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` (Token) or `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (Token-2022)
   - Source: client's ATA for the payment asset
   - Destination: `payTo` address's ATA
   - Amount: exact `PaymentRequirements.amount` in atomic units
   - Decimals: from token mint

3. **Memo** instruction (optional, max 256 bytes):
   - Program: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`

4. **Partial signing**: Client signs with their keypair; the facilitator adds its signature as fee payer before submitting on-chain.

### Allowed Programs (Static Path)

Only these programs are allowed in the transaction (static verification path):
- `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` (SPL Token)
- `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (Token-2022)
- `ComputeBudget111111111111111111111111111111`
- `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`
- `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95` (Lighthouse — Phantom/Solflare wallet protection)

### Smart Wallet Verification (Simulation Path)

When `enableSmartWalletVerification: true` and static verification rejects:
1. Assert fee payer is isolated (not in any instruction accounts)
2. Validate compute budget limits
3. Simulate transaction with inner instructions
4. Extract `TransferChecked` from CPI trace
5. Verify the transfer matches requirements

Supported smart wallet programs: Squads Multisig v4, Squads Smart Account, Swig, SPL Governance, Metaplex Core.

### Duplicate Settlement Protection

A `SettlementCache` prevents the same transaction from being settled twice. Keyed by SHA-256 hash of transaction message bytes. TTL: 120 seconds. Returns `duplicate_settlement` error for concurrent retries.

### Facilitator Extra Data

The SVM facilitator's `getExtra()` returns:
```json
{ "feePayer": "<randomly-selected-facilitator-signer-address>" }
```

This is included in the `SupportedKind.extra` and propagated to `PaymentRequirements.extra.feePayer`, so the client knows which address to use as the transaction fee payer.

### Post-Settlement Verification

After on-chain confirmation:
1. Inspect confirmed transaction's inner instructions for `TransferChecked`
2. Fallback to balance-delta checking if RPC transaction index has lag
3. Closes TOCTOU gap where simulation could pass but on-chain execution differs

---

## 10. Settlement Overrides

The server can override the settlement amount via the `Settlement-Overrides` response header or `SettlementOverrides` parameter:

```typescript
type SettlementOverrides = {
  amount?: string;  // Raw atomic units, percentage ("50%"), or dollar price ("$0.05")
};
```

Amount resolution:
- **Raw**: `"1000"` → settle exactly 1000 atomic units
- **Percent**: `"50%"` → 50% of `PaymentRequirements.amount` (floored)
- **Dollar**: `"$0.05"` → convert to atomic units using asset decimals (default 6 for USDC)

Only valid for schemes that support partial settlement (e.g., `upto` scheme).

---

## 11. Extensions System

Extensions allow protocol-level features to be layered on top of the base payment flow.

### Server-declared Extensions

```typescript
// In RouteConfig:
extensions: {
  "bazaar": { /* discovery metadata */ },
  "gas-sponsor": { /* EIP-2612 gasless */ }
}
```

These appear in `PaymentRequired.extensions` and the client echoes them back in `PaymentPayload.extensions`.

### Extension Validation

The server validates that client-echoed extension info preserves server-advertised values:
- Client may omit extensions entirely (passes)
- If present, must match server-advertised values for static fields
- Dynamic fields (nonces, timestamps) are excluded from echo validation

### Extension Hooks

Extensions can hook into the lifecycle:
- `enrichDeclaration` — transform declaration before processing
- `enrichPaymentRequiredResponse` — modify `accepts` (allowlisted: vacant `payTo`/`amount`/`asset` may be filled; `scheme`/`network`/`maxTimeoutSeconds` are immutable)
- `enrichSettlementResponse` — add to `settleResult.extensions` (facilitator fields are immutable)
- `onBeforeVerify`, `onAfterVerify`, `onVerifyFailure`
- `onBeforeSettle`, `onAfterSettle`, `onSettleFailure`
- `onProtectedRequest` (HTTP transport hook)
- `onPaymentRequired` (HTTP client transport hook)

---

## 12. Complete Type Reference

### Core Types (V2)

```typescript
type Network = `${string}:${string}`;

type PaymentRequirements = {
  scheme: string;
  network: Network;
  asset: string;
  amount: string;          // atomic units
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

type PaymentRequired = {
  x402Version: 2;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
};

type PaymentPayload = {
  x402Version: 2;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};

type VerifyRequest = {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

type VerifyResponse = {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
  extensions?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

type SettleRequest = {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

type SettleResponse = {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  transaction: string;
  network: Network;
  amount?: string;
  extensions?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

type SupportedKind = {
  x402Version: number;
  scheme: string;
  network: Network;
  extra?: Record<string, unknown>;
};

type SupportedResponse = {
  kinds: SupportedKind[];
  extensions: string[];
  signers: Record<string, string[]>;
};

type ResourceInfo = {
  url: string;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  iconUrl?: string;
};
```

### Core Types (V1)

```typescript
type PaymentRequirementsV1 = {
  scheme: string;
  network: string;           // simple name
  maxAmountRequired: string; // V1 field name
  resource: string;
  description: string;
  mimeType?: string;
  outputSchema?: Record<string, unknown>;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: Record<string, unknown>;
};

type PaymentRequiredV1 = {
  x402Version: 1;
  error?: string;
  accepts: PaymentRequirementsV1[];
  // No top-level resource field
};

type PaymentPayloadV1 = {
  x402Version: 1;
  scheme: string;
  network: string;
  payload: Record<string, unknown>;
};

type VerifyRequestV1 = {
  x402Version: number;       // always 1
  paymentPayload: PaymentPayloadV1;
  paymentRequirements: PaymentRequirementsV1;
};

type SettleRequestV1 = {
  x402Version: number;
  paymentPayload: PaymentPayloadV1;
  paymentRequirements: PaymentRequirementsV1;
};

type SettleResponseV1 = {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  transaction: string;
  network: Network;
  // No amount field in V1
};
```

---

## 13. Route Configuration (Server-Side)

```typescript
type RoutesConfig = Record<string, RouteConfig> | RouteConfig;

interface RouteConfig {
  accepts: PaymentOption | PaymentOption[];  // one or more payment options
  resource?: string;          // override resource URL
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  iconUrl?: string;
  customPaywallHtml?: string;
  unpaidResponseBody?: (context: HTTPRequestContext) => HTTPResponseBody | Promise<HTTPResponseBody>;
  settlementFailedResponseBody?: (context: HTTPRequestContext, settleResult) => HTTPResponseBody | Promise<HTTPResponseBody>;
  extensions?: Record<string, unknown>;
}

interface PaymentOption {
  scheme: string;                    // "exact"
  payTo: string | DynamicPayTo;      // recipient address or function
  price: Price | DynamicPrice;        // "$0.01", "1000000", { asset: "USDC", amount: "100000" }
  network: Network;                   // "solana:5eykt4Us..."
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

type Price = Money | AssetAmount;
type Money = string | number;
type AssetAmount = { asset: string; amount: string; extra?: Record<string, unknown> };
```

### Route Pattern Matching

```
"GET /api/data"     → verb=GET, regex=/^\/api\/data$/i
"POST /api/*"       → verb=POST, regex=/^\/api\/.*?$/i
"/api/:id"          → verb=*,  regex=/^\/api\/[^/]+$/i
"/api/[id]"         → verb=*,  regex=/^\/api\/[^/]+$/i
"*"                 → verb=*,  regex=/^.+$/i (matches everything)
```

---

## 14. Quick Implementation Guide for SAP MCP Server

### Server-side gate (Express middleware pattern):

```typescript
// 1. Create facilitator client
const facilitator = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

// 2. Create resource server + register SVM scheme
const resourceServer = new x402ResourceServer(facilitator);
registerExactSvmScheme(resourceServer); // registers "exact" scheme for solana:*

// 3. Create HTTP server with routes
const httpServer = new x402HTTPResourceServer(resourceServer, {
  "POST /mcp": {
    accepts: {
      scheme: "exact",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      payTo: agentWalletAddress,
      price: "$0.01",  // or raw amount in atomic units
    },
    description: "MCP tool call",
    mimeType: "application/json",
  },
});

// 4. Initialize (fetches /supported from facilitator)
await httpServer.initialize();

// 5. In Express middleware:
const result = await httpServer.processHTTPRequest(context);
if (result.type === "payment-error") {
  // Return 402/403 with result.response
  res.status(result.response.status).set(result.response.headers).send(result.response.body);
  return;
}
if (result.type === "payment-verified") {
  // Execute handler, then settle
  // ... handler runs ...
  const settleResult = await httpServer.processSettlement(
    result.paymentPayload,
    result.paymentRequirements,
    result.declaredExtensions,
    transportContext
  );
  // Add PAYMENT-RESPONSE header
  res.set(settleResult.headers);
}
```

### Client-side plugin:

```typescript
// 1. Create client + register SVM scheme
const coreClient = new x402Client()
  .register("solana:*", new ExactSvmScheme(clientSvmSigner));

// 2. Wrap with HTTP client
const client = new x402HTTPClient(coreClient);

// 3. Make request
const response = await fetch(endpoint);
if (response.status === 402) {
  const paymentRequired = client.getPaymentRequiredResponse(
    (name) => response.headers.get(name),
    await response.json()
  );
  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  const paidResponse = await fetch(endpoint, {
    headers: client.encodePaymentSignatureHeader(paymentPayload),
  });
  const settlement = client.getPaymentSettleResponse(
    (name) => paidResponse.headers.get(name)
  );
}
```

---

## 15. Coinbase x402 / x402 Foundation

The `@x402/*` packages are published by the **x402 Foundation** (originally Coinbase x402, now an independent project at `github.com/x402-foundation/x402`).

### Architecture

```
@x402/core        — Transport-agnostic client, server, facilitator, schemas
@x402/svm         — Solana implementation (exact scheme, SPL Token transfers)
@x402/evm         — Ethereum/EVM implementation (exact scheme, ERC-20 transfers)
@x402/avm         — Algorand implementation
@x402/express     — Express.js middleware
@x402/hono        — Hono middleware
@x402/next        — Next.js integration
@x402/axios       — Axios interceptor
@x402/fetch       — Fetch wrapper
@x402/paywall     — Browser paywall UI
```

### Default Facilitator

`https://x402.org/facilitator` — the x402 Foundation's hosted facilitator that supports both EVM and SVM chains. Self-hosted facilitators are possible using `x402Facilitator` from `@x402/core/facilitator` with chain-specific scheme registrations.

### Coinbase Origin

The protocol was originally developed at Coinbase as "x402" (HTTP 402 Payments Required). It has since been open-sourced under the x402 Foundation. The GitHub repo at `github.com/coinbase/x402` redirects to `github.com/x402-foundation/x402`.