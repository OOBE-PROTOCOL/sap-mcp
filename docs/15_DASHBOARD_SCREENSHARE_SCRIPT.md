# SAP MCP Dashboard Screenshare Script

## Purpose

Use this script for a 4-6 minute product walkthrough of <https://mcp.sap.oobeprotocol.ai/>. The tone should be direct, technical, and commercial: SAP MCP is not just another MCP server; it is a Solana-native operations gateway for agent runtimes.

## 0. Opening Hook

**Screen:** Open <https://mcp.sap.oobeprotocol.ai/>.

**Say:**

Agent runtimes are moving from chat and retrieval into real execution. The missing piece is a clean operations layer: identity, wallet boundaries, payments, protocol tools, and a way to keep user keys under user control.

This is SAP MCP by OOBE Protocol: a hosted Solana-native MCP gateway for agents. It gives Claude, Codex, Hermes, OpenClaw, and custom agents one standard endpoint for Solana DeFi, Solana RPC, and Synapse Agent Protocol operations.

## 1. Dashboard Overview

**Screen:** Point to the hero, hosted endpoint, payment counters, and public navigation.

**Say:**

The hosted MCP endpoint is `https://mcp.sap.oobeprotocol.ai/mcp`. Agents connect through standard Streamable HTTP MCP. The public dashboard gives builders the important operational signals without exposing secrets: endpoint metadata, docs, downloads, x402 discovery, pay.sh provider data, and live payment activity.

The model is remote tools, local signatures. The hosted server provides the tool surface and monetization rails, while the user's local SAP profile or external signer authorizes paid and value-moving calls.

## 2. Three Protocol Buckets

**Screen:** Scroll to the protocol surface / bento grid section.

**Say:**

SAP MCP is organized around three core buckets.

First: Solana DeFi protocols. Agents can access integrations across Jupiter, Raydium, Orca, Meteora, Drift, market data, swaps, quotes, and related execution flows.

Second: Solana RPC and asset primitives. Balances, token accounts, DAS assets, NFT metadata, program reads, transactions, simulations, and chain inspection are exposed as MCP tools.

Third: Synapse Agent Protocol. This is the coordination layer: agent registry, reputation, tool registry, escrow, settlement, attestations, SNS identity, x402 flows, pay.sh metadata, skills, and proof-oriented agent operations.

The point is simple: one MCP gateway can turn a normal agent runtime into a protocol-aware on-chain operator.

## 3. Installation Path

**Screen:** Scroll to the integration/install section and download cards.

**Say:**

There are two installation paths.

For most users, use the native desktop wizard. Download Windows, macOS, or Linux directly from the GitHub release. The wizard creates an isolated SAP MCP profile, wallet boundary, policy defaults, hosted MCP config, and the local `sap_payments` bridge for paid calls.

For developers and servers, use the TUI from npm:

```bash
npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard
```

The desktop GUI and the TUI both end in the same production model: hosted MCP at `/mcp`, plus local non-custodial signing and x402 payment handling.

## 4. Wizard Walkthrough

**Screen:** Open the SAP MCP Wizard.

**Say:**

The wizard is built for both normal users and technical operators.

The default path is full hosted SAP MCP setup. It creates or repairs the local profile, configures the selected runtime, and installs the local payment bridge.

If a user already has a profile, they can choose the repair path. That fixes only the SAP MCP runtime entries, keeps other MCP servers intact, and updates only OOBE's own `sap` and `sap_payments` blocks.

The important security rule is that keypair bytes are never pasted into remote configs. The hosted server never custodies user keys. Paid and write tools require the user-controlled local profile or an external signer.

## 5. Runtime Connection

**Screen:** Show Codex, Hermes, Claude, or another runtime with SAP MCP connected.

**Say:**

Once the runtime restarts, it gets two surfaces.

The remote SAP MCP namespace exposes the full hosted tool catalog. Read tools work immediately.

The local `sap_payments` bridge handles paid or write calls when the runtime cannot natively replay x402 challenges. It signs the payment proof locally, retries the hosted MCP call, and returns the receipt and tool output without sending private key material to OOBE.

That is the trust boundary: global hosted tools, local authorization.

## 6. Payments And Monetization

**Screen:** Point to payment/x402/pay.sh cards and `.well-known/x402`.

**Say:**

SAP MCP supports x402 and pay.sh for agent-native monetization.

Paid tools return a standard HTTP 402 challenge. The local bridge or a native x402-capable runtime resolves the challenge, settles through the OOBE facilitator, and binds payment to the tool call.

This lets hosted MCP tools become revenue-generating APIs without bearer tokens, custodial wallets, or hardcoded runtime secrets.

For builders, this means paid discovery, premium analytics, transaction builders, registry operations, SNS checks, settlement flows, and future subscription-style products can all live behind one MCP interface.

## 7. Solana Value Proposition

**Screen:** Return to the hero or protocol surface.

**Say:**

For Solana, SAP MCP is a distribution layer for protocols.

Instead of every agent integration being custom, protocols can be exposed as well-described MCP tools, enriched with skills and docs, and monetized with x402 or pay.sh.

For agents, it is a coordination layer. They can discover tools, inspect state, register identity, link SNS, handle payments, and execute operations through a standard interface.

For users, it is non-custodial by default. The remote server provides access; the local signer controls authorization.

## 8. Closing CTA

**Screen:** Show install button and docs.

**Say:**

You can try SAP MCP today at `mcp.sap.oobeprotocol.ai`.

Download the native wizard, or run the TUI from npm. Connect your agent runtime, keep signing local, and start building Solana-native agent operations with SAP MCP.

This is the path from agent profiles to on-chain operators.

## Short Social Cut

SAP MCP turns agent runtimes into Solana-native operators.

One hosted MCP endpoint gives agents access to Solana DeFi, Solana RPC, and Synapse Agent Protocol tools. The wizard creates the local profile, signer boundary, runtime config, and x402 payment bridge.

Remote tools. Local signatures. Smooth payments. No custodial key handling.

Try it at <https://mcp.sap.oobeprotocol.ai/>.
