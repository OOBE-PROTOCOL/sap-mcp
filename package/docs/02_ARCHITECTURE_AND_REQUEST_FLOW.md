# 02. Architecture And Request Flow

## 02.1 High-Level Architecture

```text
MCP Client
  | stdio or Streamable HTTP
  v
SAP MCP Server
  |-- config/profile manager
  |-- policy engine
  |-- tool registry
  |-- signer resolver
  |-- optional x402 payment gate
  v
OOBE SDKs and Solana RPC
  |-- synapse-sap-sdk
  |-- synapse-client-sdk
  |-- Solana RPC
  v
Solana / SAP Protocol / SNS / AgentKit
```

## 02.2 Runtime Modules

| Directory | Responsibility |
| --- | --- |
| `src/server/` | MCP server factory and capability registration. |
| `src/transports/` | stdio and local HTTP transport helpers. |
| `src/remote/` | Streamable HTTP MCP server. Supports bearerless public mode plus API key/JWT private modes. |
| `src/tools/` | SAP, Solana, AgentKit, SNS, transaction, profile, skill, chat, and payment tool registration. |
| `src/config/` | Runtime config, secure config manager, profile manager, wizard pipeline, and client injection. |
| `src/policy/` | Local policy, Bento policy, hybrid policy, spending limits, and risk evaluation. |
| `src/security/` | Private-key guard, unsafe action guard, approval requirements, and tool permission maps. |
| `src/signer/` | Local keypair signer, external signer, delegated signer, and signing proxy. |
| `src/payments/` | x402 monetization gate, facilitator server, usage ledger, pricing, and pay.sh spec generator. |
| `src/resources/` | MCP resources for current config, registry, reputation, memory, stats, and tool schemas. |
| `src/prompts/` | MCP prompts that teach agents how to use SAP MCP safely. |

## 02.3 Local Stdio Flow

1. Agent client starts `sap-mcp-server` as a child process.
2. Server loads the active profile from `~/.config/mcp-sap`.
3. MCP handshake runs over stdio.
4. Client calls tools through JSON-RPC.
5. Policy and security guards run before tool execution.
6. If a tool needs signing, the signer resolver uses local keypair or external signer mode.
7. Results are returned through MCP content blocks.

Local stdio is not monetized by default. It is the user's own local runtime.

## 02.4 Remote HTTP Flow

1. Client connects to `POST /mcp`, `GET /mcp`, or `DELETE /mcp`.
2. Reverse proxy terminates TLS.
3. Public mode accepts the MCP request without Bearer auth; private modes validate Bearer auth.
4. x402 gate inspects `tools/call` requests when monetization is enabled.
5. Free requests pass through immediately.
6. Paid requests return payment requirements until the client supplies a payment signed by the user's wallet or external signer.
7. Paid requests require a valid `PAYMENT-SIGNATURE` or `X-PAYMENT` header.
8. Tool call executes only after verification.
9. Settlement is attempted after successful handler completion.
10. Usage ledger records the decision, verification, settlement, or cancellation state.

## 02.5 Signing Flow

```text
Tool call
  |
  v
Policy and permission checks
  |
  v
Signer resolver
  |-- readonly: no signing
  |-- local-dev-keypair: dedicated SAP MCP keypair
  |-- external-signer: signer service or signing proxy
  |-- hosted-api: no raw customer keypair in process
  v
Signed transaction or explicit refusal
```

The agent sees public keys, profile names, network, and policy limits. It must never see secret key bytes.

In hosted mode, `mcp.sap.oobeprotocol.ai` is the remote MCP transport and payment verifier, not a custodial signer for customer wallets. Any hosted workflow that needs a user signature must use the wizard-created local profile, a local signing proxy, or an external signer.

## 02.6 Payment Flow

```text
MCP tools/call
  |
  v
Pricing resolver
  |-- free: execute
  |-- paid: build x402 payment requirements
  v
x402 resource server
  |
  v
OOBE facilitator verify
  |
  v
Tool execution
  |
  v
OOBE facilitator settle
```

The facilitator signer pays or sponsors the settlement path when configured. It is not the revenue recipient and not an agent wallet.

## 02.7 Trust Boundaries

| Boundary | Rule |
| --- | --- |
| MCP client to remote server | Public hosted mode can be bearerless; private/enterprise mode can require Bearer auth. Paid tools still require x402. |
| Remote server to facilitator | Use a private facilitator auth token. |
| Server to local keypair | Never print or expose keypair bytes. |
| Agent profile to Solana CLI | Keep SAP MCP keypairs separate from Solana CLI keypairs. |
| pay.sh to SAP MCP | pay.sh can proxy/catalog the HTTP endpoint; SAP MCP still enforces per-tool pricing. |
| Policy to tool handler | Policy must run before sensitive or value-moving calls. |
