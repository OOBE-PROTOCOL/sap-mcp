# SAP MCP Documentation

SAP MCP is the hosted and local Model Context Protocol gateway for Synapse Agent Protocol, Solana execution tools, x402/pay.sh monetization, SNS identity, and agent operations.

The primary hosted endpoint is:

```txt
https://mcp.sap.oobeprotocol.ai/mcp
```

Use this documentation when you need to install the wizard, connect Claude/Hermes/Codex/OpenClaw or another MCP client, configure a local SAP profile and signer, understand hosted payments, or operate the server on a VPS.

## Fastest Hosted Setup

Most users should connect agents to the hosted remote MCP server while keeping signing local and user-controlled.

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
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

## What The Hosted Server Provides

SAP MCP groups tools into three practical buckets:

| Bucket | What Agents Can Do |
| --- | --- |
| Solana DeFi protocol tools | Use Jupiter, Raydium, Orca, Meteora, Drift, Pyth, Metaplex, SPL Token, bridging, staking, and related Solana protocol integrations. |
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

For agents that cannot replay x402 challenges natively, install the optional paid-call helper:

```bash
npx --yes --package @oobe-protocol-labs/sap-mcp-server sap-mcp-x402-paid-call \
  --tool sap_list_all_agents \
  --arguments '{"limit":5}' \
  --max-usd 0.02 \
  --confirm
```

## Start Here

Read these first:

1. [Hosted Remote MCP](user/01_HOSTED_REMOTE_MCP.md)
2. [Client Configs](user/04_CLIENT_CONFIGS.md)
3. [Payments: x402 And pay.sh](user/03_PAYMENTS_X402_PAYSH.md)
4. [Configuration And Wizard](03_CONFIGURATION_AND_WIZARD.md)
5. [Endpoints And Clients](07_ENDPOINTS_AND_CLIENTS.md)

## Public Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Public landing page and payment/server overview. |
| `GET /docs` | This documentation site. |
| `POST /mcp` | Streamable HTTP MCP endpoint for agents. |
| `GET /server.json` | Public, secret-free machine-readable server metadata. |
| `GET /.well-known/agent-card.json` | A2A-style agent card. |
| `GET /.well-known/sap-mcp-wizard.json` | Wizard install descriptor for agents that cannot see local config. |
| `GET /wizard/install.sh` | One-line wizard installer. |

