# SAP Payments X402

Use this skill for SAP x402 payment context, balances, subscriptions, paid API
workflows, and hosted SAP MCP x402/pay.sh monetization.

## Tools

- `sap_x402_prepare_payment`
- `sap_x402_get_balance`
- `sap_payments_profile_current`
- `sap_payments_call_paid_tool`
- `sap_payments_call_external_x402`
- `sap_payments_finalize_transaction`
- `sap_payments_prepare_challenge`
- `sap_payments_sign_challenge`
- `sap_payments_verify_receipt`
- `sap_x402_paid_call`
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
Do not treat hosted `402 Payment Required` as a failure; it is the expected
payment handshake. Do not silently bypass hosted paid tools by switching to a
local free stdio MCP server unless the user explicitly asks for local execution.
If `sap_profile_current` says the hosted server has no signer, treat that as
the non-custodial model: OOBE does not hold user keys. Paid and value-moving
hosted calls still proceed through x402/pay.sh plus the user's local SAP profile
or external signer.

- Free: `tools/list`, `prompts/list`, `resources/list`, `sap_profile_current`,
  `sap_get_network_overview`, `sol_get_balance`, `spl-token_getBalance`, and
  `spl-token_getTokenAccounts`.
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
2. Retry the same MCP method and params after payment. The JSON-RPC `id` may
   change, but the tool name and arguments must match the challenge.
3. Use `PAYMENT-SIGNATURE` first; use `X-PAYMENT` only for clients that require
   the alternate header.
4. Cache free `tools/list`, `prompts/list`, and `resources/list` locally rather
   than paying or re-fetching repeatedly.
5. Treat `PAYMENT-RESPONSE` as the receipt bound to the tool output.
6. If the client runtime cannot sign or attach x402 payment headers itself, use
   the local SAP MCP `sap_payments_call_paid_tool` bridge configured by the SAP
   MCP wizard instead of falling back to local stdio automatically.

Do not use x402 for basic balance reads. `sol_get_balance`,
`spl-token_getBalance`, and `spl-token_getTokenAccounts` are free hosted tools
and should be called directly through the remote SAP MCP connection.

When available locally, call `sap_payments_call_paid_tool` with `toolName`,
`arguments`, `maxPriceUsd`, and `confirm: true`. It initializes the hosted MCP
session, obtains the x402 challenge, signs with the user SAP MCP profile wallet
or external signer, retries the hosted tool call, and returns the settlement
receipt. Do not ask the user to install a separate x402 plugin when the local
SAP MCP `sap_payments` bridge is already configured. The legacy
`sap_x402_paid_call` alias is acceptable only when a runtime has not refreshed
to the new tool name.

For external x402 agents discovered through SAP registry metadata, do not
hand-roll HTTP payment scripts. Call `sap_payments_call_external_x402` with
`url`, `method`, optional JSON `body`, `maxPriceUsd`, `maxAttempts`, and
`confirm: true`. Use this for non-SAP-hosted HTTP providers such as another
agent's own x402 endpoint. It fetches the external 402 challenge, signs locally,
retries the same HTTP request with `PAYMENT-SIGNATURE`, and returns the response
plus receipt without exposing keypair bytes.

If the hosted paid tool returns `transactionBase64`, `transaction`, or an
unsigned transaction object, call `sap_payments_finalize_transaction` with
`confirm: true`. Set `submit: false` for preview/sign only, or `submit: true`
after the user approves execution. Never create temporary signing scripts, read
keypair JSON, or call hosted `sap_sign_transaction` for user-owned signatures.

Use low-level helpers only for custom clients:

- `sap_payments_prepare_challenge` returns the parsed hosted x402 challenge
  without signing.
- `sap_payments_sign_challenge` signs a parsed challenge and returns a one-time
  payment header. Treat that header as authorization material.
- `sap_payments_verify_receipt` decodes a `PAYMENT-RESPONSE` or
  `X-PAYMENT-RESPONSE` receipt.

The OOBE hosted server should not expose local signing helpers when it has no
local user wallet because payment signing belongs on the user's machine.

## Transient Settlement Errors

If a hosted paid call fails with `BlockhashNotFound`,
`transaction_simulation_failed`, `smart_wallet_simulation_failed`, `node is
behind`, `minimum context slot`, `fetch failed`, `gateway timeout`, or a
response marked `retryable: true`, treat it as a transient x402/Solana RPC
settlement failure. Do not say the SAP MCP server is down unless `/health`
also fails. Do not switch to terminal/direct RPC to bypass payment, and do not
reuse the old signed payment payload.

Correct recovery:

1. Call the local `sap_payments_call_paid_tool` bridge again with the same
   `toolName` and `arguments`.
2. Set `maxAttempts: 5` when the runtime supports it.
3. Let the helper create a fresh x402 challenge and payment payload for each
   attempt.
4. If all attempts fail, report that x402 settlement is temporarily unavailable
   and ask the user to retry or repair the facilitator/RPC deployment.

References: `USER_DOCS/03_PAYMENTS_X402_PAYSH.md` and
`docs/06_PAYMENTS_X402_AND_PAYSH.md`.

## Safety

Payment and subscription operations move funds or create future obligations.
Respect `maxTxValueSol`, `dailyLimitSol`, and `requireApprovalAboveSol`.
Do not log private key material, keypair bytes, or raw payment signatures.
