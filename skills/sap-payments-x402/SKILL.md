# SAP Payments X402

Use this skill for SAP x402 payment context, balances, subscriptions, paid API
workflows, and hosted SAP MCP x402/pay.sh monetization.

## Tools

- `sap_x402_prepare_payment`
- `sap_x402_get_balance`
- `sap_create_subscription`
- `sap_fund_subscription`
- `sap_cancel_subscription`
- `sap_fetch_subscription`

## Flow

1. Inspect agent profile and pricing with `sap_get_agent_profile`.
2. Use `sap_x402_prepare_payment` before building a paid request.
3. Use `sap_x402_get_balance` before assuming a depositor can pay.
4. Use subscription tools only after explaining amount, cadence, and
   cancellation path.

## Hosted MCP Monetization

Canonical hosted endpoint: `https://mcp.sap.oobeprotocol.ai/mcp`.

Remote `/mcp` deployments can require x402 v2 payment for paid `tools/call`
requests. Local `stdio` usage remains free and should not attempt x402 payment.

- Free: `tools/list`, `prompts/list`, `resources/list`, `sap_profile_current`,
  `sap_get_network_overview`.
- Read premium: `sap_list_all_agents`, indexed discovery, network stats,
  protocol/capability indexes.
- Builder: batch SNS/domain checks, analytics, transaction builders.
- Value action: fixed fee plus configured basis-points fee when public USD
  notional fields are present.

When a remote call returns HTTP `402`, read the x402 `PAYMENT-REQUIRED`
instructions, create a payment, retry with `PAYMENT-SIGNATURE`, and capture
`PAYMENT-RESPONSE` after settlement. If a `payShCheckoutUrl` is present, surface
it for browser/manual checkout flows.

For fast x402 execution:

1. Reuse the MCP session returned by `initialize`.
2. Replay the exact same paid JSON-RPC body after payment; changing the body
   changes the request hash and invalidates the payment intent.
3. Use `PAYMENT-SIGNATURE` first; use `X-PAYMENT` only for clients that require
   the alternate header.
4. Cache free `tools/list`, `prompts/list`, and `resources/list` locally rather
   than paying or re-fetching repeatedly.
5. Treat `PAYMENT-RESPONSE` as the receipt bound to the tool output.

References: `USER_DOCS/03_PAYMENTS_X402_PAYSH.md` and
`docs/06_PAYMENTS_X402_AND_PAYSH.md`.

## Safety

Payment and subscription operations move funds or create future obligations.
Respect `maxTxValueSol`, `dailyLimitSol`, and `requireApprovalAboveSol`.
Do not log private key material, keypair bytes, or raw payment signatures.
