# Smithery And MCP Marketplaces

## 1. What Smithery Connects To

Smithery connects to the hosted SAP MCP endpoint:

```txt
https://mcp.sap.oobeprotocol.ai/mcp
```

The hosted endpoint is non-custodial. It can expose tools, prompts, resources,
metadata, free discovery calls, and x402 payment challenges, but it does not
store or load user keypairs.

Marketplace metadata:

```txt
https://mcp.sap.oobeprotocol.ai/server.json
https://mcp.sap.oobeprotocol.ai/.well-known/mcp/server-card.json
https://mcp.sap.oobeprotocol.ai/smithery.config.schema.json
https://mcp.sap.oobeprotocol.ai/.well-known/x402
https://mcp.sap.oobeprotocol.ai/pay/provider.yml
```

## 2. Recommended Smithery Mode

Use Smithery first for free discovery and tool inspection:

- `initialize`
- `tools/list`
- `prompts/list`
- `resources/list`
- `sap_profile_current`
- `sap_skills_list`
- `sap_get_network_overview`
- `sap_payments_readiness` when the local bridge is also installed

Paid/write calls return an x402 challenge. That is expected behavior, not an
authentication error.

## 3. Paid Tool Options

There are three supported paths for paid hosted SAP MCP tools.

| Path | Use When | What Pays |
| --- | --- | --- |
| Free discovery | The user is browsing tools, docs, metadata, or base context. | Nothing. |
| Native x402 client | The agent runtime or marketplace can parse `PAYMENT-REQUIRED`, sign locally, and retry with `PAYMENT-SIGNATURE` or `X-PAYMENT`. | The runtime's x402 wallet or payer. |
| Local `sap_payments` bridge | The runtime can call local MCP tools but does not replay x402 itself. | The user's local SAP MCP profile or external signer. |

The hosted server never signs for the user.

## 4. Smithery Config Schema

SAP MCP publishes a Smithery-friendly JSON schema:

```txt
https://mcp.sap.oobeprotocol.ai/smithery.config.schema.json
```

The schema is intentionally optional because free discovery works immediately.
It asks the user or runtime to declare the intended usage mode:

- `free-discovery`
- `x402-native-client`
- `local-sap-payments-bridge`

When publishing or refreshing SAP MCP on Smithery, pass the same schema file:

```bash
npx --yes smithery mcp publish https://mcp.sap.oobeprotocol.ai/mcp \
  -n oobe-protocol/sap-mcp \
  --config-schema smithery.config.schema.json
```

## 5. Local Bridge Setup

For most users who want paid/write tools, run the wizard locally:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

Choose the recommended full hosted setup. The wizard configures:

- hosted `sap` remote MCP;
- local `sap_payments` MCP bridge;
- active SAP MCP profile;
- local wallet or external signer boundary;
- policy limits for paid/write operations.

After restarting the agent runtime, ask the agent to run:

```txt
sap_payments_readiness
sap_payments_profile_current
```

Then paid hosted calls should be routed through:

```txt
sap_payments_call_paid_tool
```

## 6. Native x402 Client Flow

If the user already has an x402-capable client, the flow is:

1. Call the hosted paid tool normally.
2. Receive `HTTP 402` with `PAYMENT-REQUIRED`.
3. Parse the first accepted requirement from `accepts[0]`.
4. Build and sign a fresh payment payload from that exact requirement.
5. Retry the exact same MCP method and params in the same MCP session.
6. Send the proof as `PAYMENT-SIGNATURE` or `X-PAYMENT`.
7. Read `PAYMENT-RESPONSE` or `X-PAYMENT-RESPONSE` as the receipt.

The JSON-RPC `id` may change during retry, but the method and params must stay
the same. SAP MCP binds payment to the canonical tool request, not to a private
server-side session wallet.

## 7. Why Calls Can Exceed Paid Volume

Marketplace traffic often contains many unpaid probes:

- capability scanning;
- `tools/list`;
- agents trying paid tools without an x402 payer;
- retries that stop after receiving the challenge;
- read-only marketplace analytics.

Those requests count as calls or payment challenges, but they do not count as
settled volume. Settled volume only increases when a valid x402 proof is
verified and settled through the OOBE facilitator.

## 8. Agent Instructions

Agents should summarize SAP MCP marketplace state like this:

> SAP MCP hosted tools are connected. Free discovery works directly. Paid or
> write tools require either a native x402-capable client or the local
> `sap_payments` bridge created by the SAP MCP wizard. OOBE never receives
> user keypair bytes.

Avoid saying the hosted server "has no signer" as if the user is blocked. The
correct trust model is: remote tools, local signatures.

