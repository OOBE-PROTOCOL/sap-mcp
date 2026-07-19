# Payments: x402, pay.sh Pay-Per-Use, And pay.sh Subscriptions

## 1. Payment Layers

SAP MCP supports two complementary payment layers:

| Layer | Purpose |
| --- | --- |
| Native x402 gate | Per-tool pricing inside hosted SAP MCP. Free tools remain free; premium tool calls return `402 Payment Required`. |
| pay.sh gateway | Optional outer HTTP gateway for metered pay-per-use endpoints or subscription-gated endpoints. |

Native SAP MCP x402 is authoritative per tool call. pay.sh is useful when exposing SAP MCP or adjacent HTTP APIs through a cataloged pay gateway.

Recommended split:

- use native SAP MCP x402 when the price depends on the MCP tool being called;
- use pay.sh pay-per-use when a normal HTTP route should charge per request or per measured unit;
- use pay.sh subscriptions when a route should be flat-fee access for a fixed period.

Do not put `metering:` and `subscription:` on the same pay.sh endpoint. Use separate endpoints or separate provider specs.

## 2. Native x402 Tool Pricing

Free:

- `tools/list`
- `prompts/list`
- `resources/list`
- `sap_profile_current`
- basic overview/profile tools

Paid examples:

- premium reads such as `sap_list_all_agents`;
- enriched discovery and network analytics;
- SNS batch checks and builder tools;
- value-changing payment/settlement flows.

Without payment, a paid tool returns:

```txt
HTTP/1.1 402 Payment Required
```

The response contains payment instructions and the caller retries the same MCP method and params with the payment header. Agents must keep the initialized MCP session headers across both the unpaid challenge and the paid retry.

Hosted SAP MCP accepts payment proof headers used by the x402/payment flow and exposes settlement headers back to the caller:

| Direction | Header |
| --- | --- |
| Client payment proof | `PAYMENT-SIGNATURE` or `X-PAYMENT` |
| Server challenge | `PAYMENT-REQUIRED` |
| Server receipt | `PAYMENT-RESPONSE` or `X-PAYMENT-RESPONSE` |

The payment receipt should be treated as part of the tool output provenance. For paid hosted tools, agents should bind the receipt to the canonical request hash, tool name, method params, and returned result. The canonical hash ignores JSON-RPC `id`, so normal agent retries do not invalidate the receipt.

## 3. Local SAP MCP Payment Bridge

Most agent runtimes can connect to hosted SAP MCP directly, but not every runtime can automatically sign an x402 challenge and replay the paid MCP request. The recommended fix is the local `sap_payments` MCP bridge created by the wizard. Agents should call:

```txt
sap_payments_readiness
sap_payments_call_paid_tool
sap_payments_call_external_x402
sap_payments_register_agent
sap_payments_finalize_transaction
```

`sap_payments_readiness` is free. It verifies the hosted endpoint, local bridge,
active profile, signer public key, SOL/USDC balance, and local commerce policy
limits before the agent attempts a paid/write flow. It never returns keypair
bytes.

The standalone CLI helper remains available as a terminal/custom-wrapper fallback:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-x402-paid-call \
  --tool sap_list_all_agents \
  --arguments '{"limit":5}' \
  --max-usd 0.02 \
  --max-attempts 5 \
  --confirm
```

The helper:

1. loads the user's active SAP MCP profile from `~/.config/mcp-sap`;
2. initializes a real MCP session against `https://mcp.sap.oobeprotocol.ai/mcp`;
3. receives the x402 challenge for the requested hosted tool;
4. signs the payment payload locally with the user's SAP MCP profile wallet;
5. retries the same MCP method and params with `PAYMENT-SIGNATURE`;
6. returns the hosted MCP response plus the settlement receipt and an audit
   object containing the intent id, profile, signer public key, payment details,
   receipt, attempts, and retry history.

Install or repair runtime bridge config from the wizard:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

Repair only hosted `sap` plus local `sap_payments` runtime entries:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config repair
```

The repair command keeps the active SAP MCP profile and only updates OOBE SAP
MCP blocks, so unrelated MCP servers from other projects stay intact.

The wizard can also write a local reference bundle under:

```txt
~/.config/mcp-sap/addons/x402-paid-call
```

Local stdio SAP MCP also exposes the `sap_payments_call_paid_tool` challenge bridge, `sap_payments_register_agent` for local SAP agent registration, `sap_payments_finalize_transaction` for local transaction preview/sign/submit, and the legacy `sap_x402_paid_call` alias when the current process has a user-controlled wallet profile. The OOBE hosted server does not advertise these local signing helpers in non-custodial mode because payment and transaction signing must happen on the user's machine, not on `mcp.sap.oobeprotocol.ai`.

When you call a non-OOBE external x402 HTTP endpoint discovered through SAP
registry metadata, use `sap_payments_call_external_x402` instead of the hosted
MCP paid-tool helper. It signs the external provider's 402 challenge locally,
retries the same HTTP request, and returns the provider response plus the x402
receipt. It is for generic HTTP x402 endpoints, not hosted SAP MCP tool names.

Basic wallet reads do not require x402. Call `sol_get_balance`, `spl-token_getBalance`, and `spl-token_getTokenAccounts` directly on hosted SAP MCP. They should not be routed through the local payment bridge and should not depend on the facilitator.

If hosted SAP MCP returns `hosted_local_signer_required`, no x402 payment was
charged. The requested tool requires a user-owned Solana signature or is not
available as a hosted unsigned builder. Do not retry the same hosted direct
write. Use a local SAP MCP profile, an external signer, or a hosted unsigned
builder followed by `sap_payments_finalize_transaction` when a builder exists.

Security boundaries:

- keypair bytes stay local and are never included in MCP client config;
- every paid call requires `--max-usd` / `maxPriceUsd`;
- every paid call requires `--confirm` / `confirm: true`;
- run `sap_payments_readiness` before paid/write workflows and respect the
  returned local policy limits;
- transient settlement failures such as `BlockhashNotFound`,
  `transaction_simulation_failed`, `node is behind`, or `fetch failed` should
  be retried with a fresh challenge using `--max-attempts 5`;
- encrypted wallet and external signer bridges are not faked; unsupported signing modes fail closed.

## 4. pay.sh Pay-Per-Use

pay.sh pay-per-use uses a provider YAML with `metering:` on paid endpoints. The pay.sh docs describe this as stablecoin-gated HTTP where the first request receives a `402`, the client signs proof locally, and the gateway settles before forwarding upstream.

The hosted SAP MCP deployment publishes the public pay.sh catalog here:

```text
https://mcp.sap.oobeprotocol.ai/pay/provider.yml
```

That hosted YAML is safe to share. It contains the provider name, proxy routing target, network, revenue recipient, and metered `/mcp` endpoint, but not RPC API keys, signer paths, facilitator auth tokens, or wallet bytes.

References:

- https://pay.sh/docs/building-with-pay/getting-started
- https://pay.sh/docs/building-with-pay/pricing
- https://pay.sh/docs/building-with-pay/yaml-specification

Generate a SAP MCP pay.sh spec:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-pay-sh-spec \
  --out sap-mcp-pay-sh.yml \
  --upstream-url https://mcp.sap.oobeprotocol.ai \
  --network mainnet \
  --recipient <OOBE_REVENUE_WALLET>
```

Only publish YAML generated this way if it does not include private `--rpc-url` or `--signer-path` values.

Example metered block:

```yaml
endpoints:
  - method: POST
    path: 'mcp'
    description: 'SAP MCP JSON-RPC endpoint.'
    metering:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.001
```

pay.sh metered rules to keep:

1. Free endpoints omit both `metering:` and `subscription:`.
2. Simple per-call endpoints use `unit: requests` and `scale: 1`.
3. Token, character, page, byte, or variant pricing should only be used when that unit is the real cost driver.
4. Prices must remain representable in 6-decimal stablecoins.
5. With `routing.type: proxy`, the gateway forwards only verified paid requests to the upstream.
6. The gateway endpoint allowlist is explicit; routes not listed in `endpoints[]` are not exposed by pay.sh.

For SAP MCP, keep pay.sh upstream credentials in environment variables, not in the public YAML:

```yaml
routing:
  type: proxy
  url: https://mcp.sap.oobeprotocol.ai/
operator:
  currencies:
    usd: ['USDC']
  network: mainnet
  recipient: '<OOBE_REVENUE_WALLET>'
```

## 5. pay.sh Subscriptions

pay.sh subscriptions use `subscription:` instead of `metering:`. A subscription gates an endpoint behind recurring flat-fee access for a fixed period. According to pay.sh docs, `metering:` and `subscription:` are mutually exclusive on the same endpoint, so use separate endpoints or separate provider specs when offering both.

References:

- https://pay.sh/docs/building-with-pay/subscriptions/concept
- https://pay.sh/docs/building-with-pay/subscriptions/yaml-specification
- https://pay.sh/docs/building-with-pay/subscriptions/examples

Example subscription endpoint:

```yaml
endpoints:
  - method: POST
    path: 'mcp/subscription'
    description: 'SAP MCP subscription access. Proxy/rewrite this endpoint to the MCP upstream when enabled.'
    subscription:
      period: '30d'
      price_usd: 49.00
      currency: USDC
```

Operational notes:

1. `period` accepts fixed days or weeks such as `30d`, `1w`, or `52w`.
2. Month units are not valid because pay.sh periods are fixed elapsed time.
3. The first launch publishes an on-chain Plan PDA when no `plan_id` exists.
4. The generated `plan_id`, numeric plan metadata, and created-at metadata may be written back into the YAML by pay.sh.
5. Use separate endpoints for pay-per-use and subscription access.
6. A subscription endpoint is one price, one period, one endpoint. Build tier upgrades or prorations in your own product layer if needed.
7. Subscription tiers are separate endpoints, each with its own `Plan` PDA.
8. The subscriber activates once; repeated calls during the active period should not prompt for another payment.

Example product split for SAP MCP remote access:

```yaml
endpoints:
  - method: POST
    path: 'mcp'
    description: 'SAP MCP metered tool access.'
    metering:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.001

  - method: POST
    path: 'mcp/pro'
    description: 'SAP MCP pro subscription access, 30-day billing period.'
    subscription:
      period: '30d'
      price_usd: 49.00
      currency: USDC
```

When using a subscription route in front of MCP, route or rewrite it to the upstream MCP server after pay.sh verifies the subscription. The MCP protocol endpoint itself remains `/mcp` on the upstream server.

Subscriber commands:

```bash
# First call activates the subscription.
pay curl https://<pay-sh-provider-host>/mcp/pro

# Inspect active subscriptions.
pay subscriptions list
pay subscriptions list --network mainnet
pay subscriptions list --json
```

## 6. Recommended OOBE Product Split

| Product | Payment Model |
| --- | --- |
| Basic hosted discovery | Free |
| Premium reads | Native x402 per tool |
| Heavy analytics/builders | Native x402 per tool or pay.sh metered endpoint |
| Pro remote access | pay.sh subscription endpoint |
| Enterprise/custom routing | Dedicated subscription endpoint or private contract |

## 7. Official pay.sh References Used

- Getting started: https://pay.sh/docs/building-with-pay/getting-started
- Pricing: https://pay.sh/docs/building-with-pay/pricing
- Provider YAML specification: https://pay.sh/docs/building-with-pay/yaml-specification
- Subscriptions concept: https://pay.sh/docs/building-with-pay/subscriptions/concept
- Subscriptions YAML specification: https://pay.sh/docs/building-with-pay/subscriptions/yaml-specification
- Subscription examples: https://pay.sh/docs/building-with-pay/subscriptions/examples

## 8. Security Requirements

- Never put RPC API keys in public YAML.
- Never put private keypair paths in public docs.
- Use environment variables for upstream credentials.
- Keep facilitator and pay.sh operator keypairs separate from SAP agent wallets.
- Rotate any API key that appeared in logs before redaction was enabled.
