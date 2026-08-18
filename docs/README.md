# SAP MCP Documentation

SAP MCP is the hosted and local Model Context Protocol gateway for Synapse Agent Protocol, Solana execution tools, x402/pay.sh monetization, SNS identity, and agent operations.

The primary hosted endpoint is:

```txt
https://mcp.sap.oobeprotocol.ai/mcp
```

Use this documentation when you need to install the wizard, connect Claude/Hermes/Codex/OpenClaw or another MCP client, configure a local SAP profile and signer, understand hosted payments, or operate the server on a VPS.

## Fastest Hosted Setup

Most users should connect agents to the hosted remote MCP server while keeping signing local and user-controlled.

Choose one integration path:

| Path | Best For | Steps |
| --- | --- | --- |
| Native Desktop Wizard | Non-technical users and first-time setup | Download the app, choose **Full hosted SAP MCP setup**, select detected runtimes, then restart the agent. |
| CLI Wizard | Developers and terminal users | Run the npm command, accept hosted `hosted-api`, and let the wizard install hosted `sap` plus local `sap_payments`. |

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

Users who prefer a GUI can download the Desktop Wizard from GitHub releases:

```txt
https://github.com/OOBE-PROTOCOL/sap-mcp/releases
```

The desktop wizard creates the same local SAP MCP profile, signer boundary, hosted MCP client config, and local `sap_payments` bridge as the CLI wizard.

Native download metadata:

```txt
https://mcp.sap.oobeprotocol.ai/wizard/downloads.json
```

The wizard creates an isolated SAP MCP profile under:

```txt
~/.config/mcp-sap
```

Then configure your MCP client with:

```json
{
  "mcpServers": {
    "sap": {
      "url": "https://mcp.sap.oobeprotocol.ai/mcp",
      "transport": "streamable-http"
    }
  }
}
```

For paid/write hosted tools, also configure the local `sap_payments` bridge. The wizard does this automatically for supported runtimes. See:

- [Desktop Wizard Install Runbook](user/06_DESKTOP_WIZARD_INSTALL_RUNBOOK.md)
- [MCP Client Configuration Matrix](user/04_MCP_CLIENT_CONFIGURATION_MATRIX.md)
- [x402/pay.sh Paid Tool Runbook](user/03_X402_PAYSH_PAID_TOOL_RUNBOOK.md)
- [Smithery Marketplace Integration](user/07_SMITHERY_MARKETPLACE_INTEGRATION.md)
- [Agent Identity Registry Pipeline](16_AGENT_IDENTITY_REGISTRY_PIPELINE.md)
- [Premium Plugin Runtime Contracts](18_PREMIUM_PLUGIN_RUNTIME_CONTRACTS.md)
- [Agentic Standards Interoperability](19_AGENTIC_STANDARDS_INTEROPERABILITY.md)
- [Engineering Operating Model Boundaries](20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md)

## What The Hosted Server Provides

SAP MCP groups tools into three practical buckets:

| Bucket | What Agents Can Do |
| --- | --- |
| Solana DeFi protocol tools | Use Jupiter, Raydium, Orca, Meteora, Pyth, Metaplex, SPL Token, bridging, staking, and related Solana protocol integrations. |
| Solana RPC and chain methods | Read balances, token accounts, transactions, DAS assets, NFTs, network state, program data, and chain metadata. |
| Synapse Agent Protocol methods | Register and discover agents, use SAP reputation, escrow, settlement, memory, proofs, SNS identity, policy context, and coordination flows. |

## Trust Boundary

The hosted server does not custody user wallets. Users create a local SAP MCP profile and signer with the wizard. Value-moving flows, x402/pay.sh payment payloads, and transaction signatures remain authorized by the user machine or an external signer.

Keypair bytes must never be pasted into MCP client config, sent to the hosted server, logged, or shown to agents.

## Remote Payment Model

Hosted paid tools use x402 and pay.sh:

- free: MCP handshake, `tools/list`, prompts, resources, base profile/context tools
- paid reads: premium registry, discovery, and analytics tools
- builders: batch/domain/enriched operations
- value flows: fixed or percentage pricing only where it is operationally appropriate

For agents that cannot replay x402 challenges natively, configure the local
`sap_payments` MCP bridge. Call `sap_payments_wallet_guard` and
`sap_payments_readiness` first: they expose signer capability, profile status,
balances, and policy without returning wallet paths or keypair bytes. Then call
`sap_payments_call_paid_tool`. If a hosted builder returns an unsigned
transaction, finalize it with `sap_payments_finalize_transaction` so the local
signer previews, signs, and optionally submits without exposing keypair bytes.
The standalone helper remains
available as a terminal/custom-wrapper fallback:

```bash
npx --yes --package @oobe-protocol-labs/sap-mcp-server sap-mcp-x402-paid-call \
  --tool sap_list_all_agents \
  --arguments '{"limit":5}' \
  --max-usd 0.02 \
  --confirm
```

## Start Here

Read these first:

1. [Hosted MCP Local Bridge Setup](user/01_HOSTED_MCP_LOCAL_BRIDGE_SETUP.md)
2. [MCP Client Configuration Matrix](user/04_MCP_CLIENT_CONFIGURATION_MATRIX.md)
3. [x402/pay.sh Paid Tool Runbook](user/03_X402_PAYSH_PAID_TOOL_RUNBOOK.md)
4. [Smithery Marketplace Integration](user/07_SMITHERY_MARKETPLACE_INTEGRATION.md)
5. [Desktop Wizard Install Runbook](user/06_DESKTOP_WIZARD_INSTALL_RUNBOOK.md)
6. [Profile Config Wizard Injection](03_PROFILE_CONFIG_WIZARD_INJECTION.md)
7. [HTTP Endpoints, MCP Clients, And Smoke Tests](07_HTTP_ENDPOINTS_MCP_CLIENTS_SMOKE_TESTS.md)
8. [Agent Identity Registry Pipeline](16_AGENT_IDENTITY_REGISTRY_PIPELINE.md)
9. [Premium Plugin Runtime Contracts](18_PREMIUM_PLUGIN_RUNTIME_CONTRACTS.md)
10. [Agentic Standards Interoperability](19_AGENTIC_STANDARDS_INTEROPERABILITY.md)
11. [Engineering Operating Model Boundaries](20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md)

## Public Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Public landing page and payment/server overview. |
| `GET /docs` | This documentation site. |
| `POST /mcp` | Streamable HTTP MCP endpoint for agents. |
| `GET /server.json` | Public, secret-free machine-readable server metadata. |
| `GET /.well-known/sap-mcp-tool-catalog.json` | Public, secret-free hosted runtime tool module and policy catalog for wizard, UI, and agent discovery. |
| `GET /premium/catalog.json` | Public premium plugin contracts, pricing models, schemas, and provider readiness. |
| `GET /premium/streams.json` | Public premium stream contracts for future x402/pay.sh real-time delivery rails. |
| `GET /premium/webhooks.json` | Public premium webhook contracts with signed delivery expectations. |

Premium plugin authors can use `sap_premium_plugin_template` and
`sap_premium_validate_plugin_manifest` to build strict data-only contracts,
then deploy reviewed manifests from a private plugin directory. The public
server never executes plugin code supplied through MCP input and does not expose
private/enterprise manifests unless the operator explicitly enables private
discovery.
| `GET /smithery.config.schema.json` | Optional Smithery setup schema for free discovery, native x402 clients, and local `sap_payments` bridge users. |
| `GET /.well-known/agent-card.json` | A2A-style agent card. |
| `GET /.well-known/sap-mcp-wizard.json` | Wizard install descriptor for agents that cannot see local config. |
| `GET /wizard/install.sh` | One-line wizard installer. |
