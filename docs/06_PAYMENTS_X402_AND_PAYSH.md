# 06. Payments, x402, And pay.sh

## 06.1 Payment Principles

SAP MCP monetization is remote-only by default. Local stdio remains a local developer/operator experience.

The server does not charge for connecting. Payment is evaluated per MCP request, primarily for `tools/call`.

## 06.2 Initial Pricing Model

| Tier | Examples | Price |
| --- | --- | --- |
| Free | `tools/list`, `prompts/list`, `resources/list`, `sap_profile_current`, base overview | Free |
| Premium read | `sap_list_all_agents`, enriched network stats, indexed discovery | `$0.007` to `$0.01` |
| Builder or batch | complex builders, SNS/domain batch checks, enriched analytics | `$0.01` to `$0.10` |
| Value action | settlement-like or value-linked operations where appropriate | fixed `$0.20` plus optional `0.5%` |

Do not apply percentage fees blindly to swaps or financial routing. Those workflows may create compliance, custody, and routing implications.

## 06.3 x402 Role

x402 is the native payment gate used by SAP MCP for paid hosted requests.

For hosted users, the x402/pay.sh payment authorization is signed by the user's wizard-created SAP profile wallet or external signer. The hosted MCP server verifies and settles payments; it does not hold or receive customer keypair bytes.

Flow:

1. Client sends a JSON-RPC request to `POST /mcp`.
2. SAP MCP parses the request and resolves the tool pricing tier.
3. Free requests execute without payment.
4. Paid requests return payment requirements when no valid payment is provided.
5. The client signs the payment with the user's configured local wallet or external signer.
6. Client retries with `PAYMENT-SIGNATURE` or `X-PAYMENT`.
7. SAP MCP verifies the payment with the configured facilitator.
8. Tool executes.
9. SAP MCP settles or cancels the payment based on handler result.

SAP MCP accepts both header names:

```text
PAYMENT-SIGNATURE: <x402 payment payload>
X-PAYMENT: <x402 payment payload>
```

The retry must preserve the initialized `mcp-session-id` and the same MCP method
and params that produced the challenge. JSON-RPC `id` is not part of the
canonical paid request hash.

## 06.4 Local x402 Challenge Toolchain

Some clients can connect to hosted Streamable HTTP MCP but cannot yet sign and
replay x402 challenges natively. SAP MCP ships a local challenge toolchain for
that case. The recommended high-level MCP tool is:

```text
sap_payments_call_paid_tool
```

It obtains the hosted x402 challenge, validates the price and payment
coordinates, signs locally, retries the exact hosted MCP request, and returns
the tool result plus receipt. The legacy alias `sap_x402_paid_call` remains for
existing runtimes.

CLI equivalent:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-x402-paid-call \
  --tool sap_list_all_agents \
  --arguments '{"limit":5}' \
  --max-usd 0.02 \
  --max-attempts 5 \
  --confirm
```

The wizard can install local bridge reference metadata and snippets for Hermes,
Claude, Codex, OpenClaw, or custom runtimes:

```text
~/.config/mcp-sap/addons/x402-paid-call
```

The helper initializes the hosted MCP session, receives the x402 challenge,
signs the payment payload with the user's local SAP MCP profile wallet, retries
the hosted call, and prints the settlement receipt. It does not send keypair
bytes to the hosted server. It fails closed when the active profile has no
supported local payment signer.

Local stdio SAP MCP may expose these free payment bridge tools when the process
has a user-controlled wallet profile:

| Tool | Purpose |
| --- | --- |
| `sap_payments_readiness` | Free local readiness check for hosted MCP, active profile, signer, SOL/USDC balance, and commerce policy limits. Call this first for paid/write workflows. |
| `sap_payments_call_paid_tool` | End-to-end paid hosted tool execution; preferred for agents. |
| `sap_payments_prepare_challenge` | Fetch and parse a hosted x402 challenge without signing. |
| `sap_payments_sign_challenge` | Sign a parsed challenge with the local SAP profile signer. |
| `sap_payments_verify_receipt` | Decode a payment response/receipt header for inspection. |
| `sap_x402_paid_call` | Backward-compatible alias for the high-level paid-call tool. |

The public hosted server should not advertise the signing helpers in
non-custodial mode because signing belongs on the user's machine.

Transient settlement errors such as `BlockhashNotFound`,
`transaction_simulation_failed`, `smart_wallet_simulation_failed`, `node is
behind`, `minimum context slot`, or `fetch failed` should be retried with a
fresh x402 challenge and payment payload. Do not reuse old signed payment
payloads, and do not bypass the hosted paid path with direct RPC calls unless
the user explicitly asks for local execution.

## 06.5 Payment Test Matrix

Before mainnet launch, verify these cases on devnet:

| Case | Expected result |
| --- | --- |
| `initialize` | Free, no payment challenge. |
| `tools/list` | Free, no payment challenge. |
| Free tool such as `sap_profile_current` | Free, no payment challenge. |
| Paid tool without payment | HTTP payment-required response with x402 instructions. |
| Paid tool with no user signer configured | Client cannot produce a valid payment signature; run the wizard or configure an external signer. |
| Paid tool with valid payment | Tool executes, facilitator verifies, settlement is attempted. |
| Paid tool with handler failure | Payment is canceled and tool error is returned. |
| Paid batch call | Price is aggregated and route is bound to request hash. |
| Facilitator unavailable | Paid call fails closed, not free. |
| pay.sh checkout configured | 402 body includes checkout URL, but SAP MCP remains pricing authority. |

## 06.6 pay.sh Role

pay.sh is useful as a provider/catalog/proxy layer for public distribution and checkout UX.

Important distinction:

1. pay.sh can expose and route the hosted SAP MCP endpoint.
2. pay.sh can provide a checkout or provider YAML surface.
3. SAP MCP still performs per-tool x402 pricing internally.
4. A raw endpoint-level pay.sh charge on `/mcp` can accidentally charge free protocol calls if the proxy is not body-aware.

For that reason, SAP MCP should remain the pricing source of truth for MCP `tools/call` requests.

## 06.7 Enable Monetization

Configure monetization through a private environment store. Public docs should not include live facilitator URLs, auth tokens, payment recipients, RPC credentials, or signer paths.

Required categories:

```bash
SAP_MCP_MONETIZATION_ENABLED=true
SAP_MCP_MONETIZATION_PROVIDER=x402
SAP_MCP_MONETIZATION_PAY_TO=<revenue-recipient>
SAP_MCP_MONETIZATION_NETWORK=<x402-network-id>
SAP_MCP_X402_FACILITATOR_URL=<private-or-hosted-facilitator-url>
SAP_MCP_X402_FACILITATOR_AUTH_TOKEN=<private-facilitator-auth-token>
SAP_MCP_X402_MAX_TIMEOUT_SECONDS=<timeout-seconds>
SAP_MCP_PAY_SH_CHECKOUT_URL=<optional-pay-sh-checkout-url>
```

`SAP_MCP_MONETIZATION_PAY_TO` is the revenue recipient. It is not the facilitator signer, not a customer payment signer, and not an agent wallet.

## 06.8 Facilitator Keypair

The facilitator needs its own dedicated signer. Initialize it:

```bash
npx sap-mcp-facilitator init
```

Then fund the printed facilitator public key with SOL on the configured network. Store the facilitator signer path in private deployment config, not in public docs.

```text
<private-facilitator-signer-path>
```

The facilitator signer is used for facilitator operations. It must be separate from:

1. SAP agent profile wallets.
2. Solana CLI `id.json`.
3. Revenue recipient wallet.
4. Customer wallets.

## 06.9 Start Facilitator

Start the facilitator through PM2, systemd, or a container supervisor with private environment injection:

```bash
npx sap-mcp-facilitator start
```

If the facilitator binds to a non-loopback host or is reachable across a network boundary, an auth token is required.

Facilitator settlement depends on Solana RPC health. Production deployments should configure at least one private primary RPC and one or more fallback endpoints:

```bash
SAP_MCP_FACILITATOR_RPC_URL=<private-primary-rpc-url>
SAP_MCP_FACILITATOR_RPC_FALLBACK_URLS=<private-backup-rpc-url>,https://api.mainnet-beta.solana.com
```

The facilitator retries only transient RPC failures such as transport failures, throttling, lagging nodes, skipped slots, or blockhash visibility issues. It does not retry business failures such as insufficient funds, invalid signatures, or program errors. RPC URLs are redacted in logs and CLI output.

## 06.10 Generate pay.sh Provider YAML

The hosted OOBE deployment publishes a public, secret-free provider catalog at:

```text
https://mcp.sap.oobeprotocol.ai/pay/provider.yml
```

Use that URL for catalog discovery and pay.sh proxy configuration. It intentionally omits private RPC URLs, signer paths, facilitator auth tokens, and VPS-local paths.

For private operator files, generate a provider YAML locally:

```bash
npx sap-mcp-pay-sh-spec \
  --out sap-mcp-pay-sh.yml \
  --upstream-url https://mcp.sap.oobeprotocol.ai \
  --network mainnet \
  --recipient YOUR_SOLANA_USDC_RECIPIENT \
  --subdomain oobe-sap-mcp \
  --title "OOBE SAP MCP Server"
```

Options:

| Option | Meaning |
| --- | --- |
| `--config <path>` | Load a specific SAP MCP config JSON. |
| `--out <path>` | Write YAML to a file. |
| `--upstream-url <url>` | Hosted SAP MCP base URL. |
| `--network <name>` | `mainnet`, `devnet`, or `localnet`. |
| `--recipient <pubkey>` | Revenue wallet override. |
| `--rpc-url <url>` | pay.sh operator RPC URL. |
| `--signer-path <path>` | pay.sh operator signer file. |
| `--subdomain <slug>` | pay.sh provider slug. |
| `--title <text>` | pay.sh provider title. |
| `--no-fee-payer` | Disable operator fee-payer sponsorship. |

Do not publish generated YAML files that include `--rpc-url` or `--signer-path`.

## 06.11 Usage Ledger

Payment decisions are written to the usage ledger. The ledger should store:

1. Request hash.
2. Tool name.
3. Pricing decision.
4. Verification status.
5. Settlement or cancellation state.

It must not store raw keypair bytes, raw private keys, raw payment secrets, or sensitive full request payloads.
