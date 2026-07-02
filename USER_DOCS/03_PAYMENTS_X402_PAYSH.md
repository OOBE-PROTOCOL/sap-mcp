# Payments: x402, pay.sh Pay-Per-Use, And pay.sh Subscriptions

## 1. Payment Layers

SAP MCP supports two complementary payment layers:

| Layer | Purpose |
| --- | --- |
| Native x402 gate | Per-tool pricing inside hosted SAP MCP. Free tools remain free; premium tool calls return `402 Payment Required`. |
| pay.sh gateway | Optional outer HTTP gateway for metered pay-per-use endpoints or subscription-gated endpoints. |

Native SAP MCP x402 is authoritative per tool call. pay.sh is useful when exposing SAP MCP or adjacent HTTP APIs through a cataloged pay gateway.

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

The response contains payment instructions and the caller replays the same request with the payment header.

## 3. pay.sh Pay-Per-Use

pay.sh pay-per-use uses a provider YAML with `metering:` on paid endpoints. The pay.sh docs describe this as stablecoin-gated HTTP where the first request receives a `402`, the client signs proof locally, and the gateway settles before forwarding upstream.

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
            - price_usd: 0.008
```

## 4. pay.sh Subscriptions

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
4. The generated `plan_id` becomes part of the provider contract and should be committed only if the provider YAML is public-safe.
5. Use separate endpoints for pay-per-use and subscription access.

## 5. Recommended OOBE Product Split

| Product | Payment Model |
| --- | --- |
| Basic hosted discovery | Free |
| Premium reads | Native x402 per tool |
| Heavy analytics/builders | Native x402 per tool or pay.sh metered endpoint |
| Pro remote access | pay.sh subscription endpoint |
| Enterprise/custom routing | Dedicated subscription endpoint or private contract |

## 6. Security Requirements

- Never put RPC API keys in public YAML.
- Never put private keypair paths in public docs.
- Use environment variables for upstream credentials.
- Keep facilitator and pay.sh operator keypairs separate from SAP agent wallets.
- Rotate any API key that appeared in logs before redaction was enabled.
