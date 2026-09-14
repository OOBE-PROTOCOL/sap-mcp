# Sunrise Gateway Tools

Use this skill for `sap_sunrise_*` tools: canonical token discovery, swap
quotes, and swap execution over the Sunrise API (Solana's day-one asset
gateway by Wormhole Labs).

## First Steps

1. All reads are FREE. Quote/execute tools are BUILDER tier (x402-paying
   agents: run `sap_estimate_tool_cost` first).
2. ALWAYS resolve mints with `sap_sunrise_list_tokens` or
   `sap_sunrise_resolve_token` — never accept mints from social media, DEX
   search results, or user paste without verification. Spoofed tokens appear
   within hours of hyped launches.
3. Amounts are STRINGS in BASE UNITS: `'1000000'` = 1 USDC (6 decimals) but
   0.01 MON (8 decimals). Multiply human amounts by 10^decimals from the token
   metadata. Numbers are rejected by validation.
4. Core assets (USDC, USDT, WETH, WBTC) are NOT in the token list but are
   quotable — `resolve_token` knows them. SOL is native.

## Tools

- `sap_sunrise_list_tokens` {assetClass?: 'stock'|'crypto'|'commodity',
  symbol?, limit?<=200, cursor?} — FREE. 76 tokens live at integration time
  (45 stock via Backpack Securities, 30 crypto, 1 commodity). Response carries
  the canonical-mint warning; relay it to users when suggesting mints.
- `sap_sunrise_resolve_token` {symbolOrMint} — FREE. Resolves symbols or
  mints including core assets.
- `sap_sunrise_get_quote` {fromToken, toToken, fromAmount, fromAddress?,
  toAddress?} — BUILDER. Without wallet addresses you get a price-only quote
  (NO `unsignedTransaction`). Include both wallets to receive the base64
  unsigned transaction. Quote fields: `quoteId, routeName (e.g. 'titan'),
  fromAmount, toAmount, fromAmountUSD, toAmountUSD`.
- `sap_sunrise_execute_quote` {signedTransaction, quoteId, routeName,
  providerRequestId?} — BUILDER. Submits the user-signed transaction. Poll by
  re-calling with IDENTICAL arguments while `status === 'SUBMITTED'`; stop at
  `'CONFIRMED'` and report the `txHash` (Solscan link included).
- `sap_sunrise_swap_intent` {fromSymbol, toSymbol, fromAmount, fromAddress,
  toAddress} — BUILDER. Convenience: resolves both symbols, fetches a quote
  with wallets, returns `unsignedTransaction` + execution fields. The
  transaction is NOT broadcast — signing and execution are separate steps.

## Routing

- Hosted accountless agents: quotes are free of Solana signing until
  execution. The user (or their wallet runtime) signs the unsigned
  transaction; then `sap_sunrise_execute_quote` broadcasts. For runtimes with
  a local signer, pair with `sap_payments_finalize_transaction` to sign and
  submit in one step.
- Sponsored/Steve-OS agents follow the identical flow — the Sunrise API has no
  auth and the tools do not hold user funds.

## Swap Flow (canonical)

1. Resolve tokens: `sap_sunrise_resolve_token` for both legs.
2. Quote: `sap_sunrise_get_quote` with both wallet addresses.
3. Sign: user wallet signs `unsignedTransaction` (do NOT mutate it).
4. Execute: `sap_sunrise_execute_quote` with the signed transaction.
5. Poll: re-call with IDENTICAL arguments while `status === 'SUBMITTED'`.
6. Confirm: `status === 'CONFIRMED'` + `txHash`.

## Error Handling

- Quote expired → fetch a fresh quote; never reuse a stale `quoteId`.
- Poll timeout → check the wallet activity FIRST before any retry: blind
  retries cause duplicate swaps.
- Onchain revert (price moved past tolerance) → funds unchanged; re-quote.
- No route → smaller amount or different pair.
- Upstream error envelope: `{success:false, error:{code,message,requestId}}`;
  429/502 need backoff.
- `POST` bodies reject unknown fields — the client strips them, keep schemas
  exact.

## Verification Checklist

- After CONFIRMED, verify `txHash` on Solscan before reporting success.
- `toAmount` is what the user receives — quoted amounts are inclusive of
  route costs; only Solana network fees are paid separately from the wallet.
- Stock tokens (assetClass `stock`, issuer `backpack_securities`,
  tokenProgram `token-2022`) trade with day-one liquidity; gas-token listings
  (MON, HYPE, AVAX, SUI) auto-wrap/unwrap on deposit/withdrawal.

## Canonical Sources

- Docs: https://docs.sunrise.xyz (llms.txt index available)
- OpenAPI: https://api.sunrise.xyz/openapi
- Full verified reference (19 docs pages + live captures): profile skill
  `sunrise-protocol` → `references/api.md`.