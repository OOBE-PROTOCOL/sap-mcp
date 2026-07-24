# SAP MCP Premium Plugin Runtime

SAP MCP includes a typed premium plugin contract for paid streams, webhooks, and enterprise capabilities. The goal is to let agents discover paid real-time capabilities, validate schemas before spending, and bind future x402/pay.sh receipts to a clear session id without exposing private provider code or user key material.

This layer is deliberately strict:

- no fake stream data
- no implicit provider claims
- no execution of plugin code from user input
- no keypair bytes or provider secrets in public metadata
- no x402 charge for invalid catalog/session planning requests

## What Ships In The Open Server

The public MCP server exposes free discovery and planning tools:

| Tool | Purpose |
| --- | --- |
| `sap_premium_plugin_catalog` | Lists premium plugin manifests, schemas, pricing contracts, provider readiness, and private plugin loader guidance. |
| `sap_stream_catalog` | Lists stream capability contracts such as quote deltas, price ticks, registry events, and x402 ledger events. |
| `sap_webhook_catalog` | Lists webhook delivery contracts and signed callback event types. |
| `sap_premium_validate_plugin_manifest` | Validates a manifest before publication or enterprise loading. |
| `sap_premium_plugin_template` | Builds a strict data-only manifest template for custom stream, webhook, or premium tool contracts. |
| `sap_premium_session_start` | Creates an unpaid, bounded session plan for a premium capability. |
| `sap_premium_session_status` | Reads in-memory premium session planning status. |

Planning is free because it prevents wasted x402 attempts. Live premium delivery should be charged by the delivery rail once the provider is configured and the session is activation-ready.

## Public HTTP Discovery

The hosted server also exposes the same premium contracts as public, machine-readable JSON:

| Endpoint | Purpose |
| --- | --- |
| `/premium/catalog.json` | Full premium plugin catalog with provider readiness, pricing contracts, stream/webhook/tool capability ids, and private loader guidance. |
| `/premium/streams.json` | Stream-only discovery for price ticks, quote deltas, registry events, and x402 ledger streams. |
| `/premium/webhooks.json` | Webhook-only discovery for signed callback subscriptions and event delivery contracts. |

These endpoints are discovery-only. They do not activate paid streams, execute private plugins, expose provider secrets, or return live provider data while readiness is false.

## Provider Readiness

Capabilities that depend on external streaming or webhook infrastructure include explicit provider env vars. If a required env var is missing, the capability returns:

```txt
status: requires-provider
```

Agents must not attempt paid activation when provider readiness is false. They should tell the user that the capability is contract-ready but not live on this deployment.

## Built-In Premium Contracts

The open catalog currently defines contract-level manifests for:

| Plugin | Capability Examples |
| --- | --- |
| `sap-premium-market-data` | Jupiter quote deltas, Pyth price ticks, price threshold webhooks. |
| `sap-premium-agent-events` | SAP agent registry streams and escrow lifecycle webhooks. |
| `sap-premium-x402-ledger` | x402 challenge, receipt, settlement, retry, and facilitator health events. |

These are not mock feeds. They are typed contracts that become live only when the corresponding provider env is configured.

## Private Enterprise Plugins

Enterprise/private plugin code should live outside the public repository. The public server exposes the contract and validation path only.

Supported loader env contract:

```txt
SAP_MCP_ENABLE_PREMIUM_PLUGINS=true
SAP_MCP_PLUGIN_DIR=/secure/path/to/private/plugins
SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY=false
```

Private plugins must provide manifests that pass:

```txt
sap_premium_validate_plugin_manifest
```

The runtime loads private manifests as data only from the configured directory.
It does not execute plugin code supplied through MCP tool input. Private and
enterprise manifests are not exposed in public catalog responses unless
`SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY=true` is set deliberately, which
should be reserved for authenticated or explicitly shared deployments.

Use `sap_premium_plugin_template` to generate a starter manifest, then store the
reviewed JSON in the private plugin subrepo under `manifests/`. Plugging and
unplugging a private capability is a file/deploy operation: add or remove the
manifest, validate it, and restart the hosted server with the intended env.

## Agent Flow

Recommended agent behavior:

1. Call `sap_premium_plugin_catalog` with `includeSchemas:true`.
2. Use `sap_stream_catalog` or `sap_webhook_catalog` to pick an exact capability id.
3. Check `providerStatus` and the capability-level `providerReady` boolean.
4. Call `sap_premium_session_start` to get a bounded session plan and estimated price.
5. Activate only through the future paid delivery rail when provider readiness is true.
6. Bind x402/pay.sh receipt, session id, plugin id, capability id, and event ids in the audit output.

If the provider is not ready, stop cleanly and do not request payment.

## Why This Matters

Agent commerce needs more than one-shot tools. Trading agents, research agents, protocol monitors, and marketplace agents need fast event access with clear payment boundaries. SAP MCP premium plugins create the contract layer for that: typed schemas, bounded sessions, x402/pay.sh pricing, signed delivery, and enterprise provider isolation.
