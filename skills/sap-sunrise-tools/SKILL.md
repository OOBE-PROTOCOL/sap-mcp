# Sunrise Gateway Tools

Use this skill for `sap_sunrise_*` tools: canonical token discovery, swap
quotes, and swap execution over the Sunrise API (Solana's day-one asset
gateway by Wormhole Labs). No auth on the API layer — signing happens at the
Solana transaction level in the user's wallet.

## First Steps

1. All reads are FREE. Quote/execute tools are BUILDER tier (x402-paying
   agents: run `sap_estimate_tool_cost` first).
2. ALWAYS resolve mints with `sap_sunrise_list_tokens` or
   `sap_sunrise_resolve_token` — never accept mints from social media, DEX
   search results, or user paste without verification. Spoofed tokens appear
   within hours of hyped launches.
3. Amounts are STRINGS in BASE UNITS: `'1000000'` = 1 USDC (6 decimals) but
   0.01 MON (8 decimals). Numbers are rejected to avoid float precision loss.
4. Core assets (USDC, USDT, WETH, WBTC) are NOT in the token list but are
   quotable — `resolve_token` knows them. SOL is native.

## Tools — full parameter reference

### sap_sunrise_list_tokens (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| assetClass | enum | no | `stock`, `crypto`, or `commodity` filter |
| symbol | string | no | case-insensitive exact-symbol filter |
| limit | number | no | upstream page size, 1-200 (default 200) |
| cursor | string | no | pagination cursor from a previous call |

Returns `{count, tokens, pagination:{nextCursor}}`; token fields: `chain`,
`address` (canonical mint), `symbol`, `name`, `decimals`, `platform`,
`assetClass`, `issuer`, `icon`, `tokenProgram` (spl-token | token-2022),
`stock {ticker, currency, exchange {marketIdentifierCode, name}}`.
76 tokens live at integration time (45 stock via Backpack Securities,
30 crypto, 1 commodity PAXG). The response carries the canonical-mint
spoof warning — relay it when suggesting mints.

### sap_sunrise_resolve_token (FREE)
| Param | Type | Required | Notes |
|---|---|---|---|
| symbolOrMint | string | yes | token symbol (e.g. MON, USDC) or mint address |

Matches the token list plus core assets. Unknown symbols return a
structured `token_not_found` error with the spoof warning.

### sap_sunrise_get_quote (BUILDER)
| Param | Type | Required | Notes |
|---|---|---|---|
| fromToken | string (mint) | yes | resolve symbols first with sap_sunrise_resolve_token |
| toToken | string (mint) | yes | |
| fromAmount | string | yes | base units, matches `/^\d+(\.\d+)?$/` — numbers are rejected |
| fromAddress | string | no | include (with toAddress) to receive unsignedTransaction |
| toAddress | string | no | |

Returns `quotes[]`: `quoteId`, `routeName` (e.g. `titan`), `fromAmount`,
`toAmount`, `fromAmountUSD`, `toAmountUSD` — plus `unsignedTransaction`
(base64), `providerRequestId`, `slippageBps` ONLY when wallet addresses were
provided. Response includes `nextStep` guidance for the next action.

### sap_sunrise_execute_quote (BUILDER)
| Param | Type | Required | Notes |
|---|---|---|---|
| signedTransaction | string | yes | base64 transaction signed by the user wallet |
| quoteId | string | yes | from the quote |
| routeName | string | yes | from the quote |
| providerRequestId | string | no | from the quote |

Returns `{txHash, status}`. Poll by re-calling with IDENTICAL arguments
while `status === 'SUBMITTED'`; on `'CONFIRMED'` the response includes a
Solscan link. Never mutate the transaction between polls.

### sap_sunrise_swap_intent (BUILDER)
| Param | Type | Required |
|---|---|---|
| fromSymbol | string | yes |
| toSymbol | string | yes |
| fromAmount | string (base units of FROM token) | yes |
| fromAddress | string | yes |
| toAddress | string | yes |

One-call convenience: resolves both symbols to canonical mints, quotes with
wallets, and returns `unsignedTransaction` + `quoteId` + `routeName` +
`providerRequestId` + the explicit note that the transaction was NOT
broadcast — sign and execute with `sap_sunrise_execute_quote`.

## Swap Flow (canonical)

1. Resolve tokens: `sap_sunrise_resolve_token` for both legs.
2. Quote: `sap_sunrise_get_quote` with both wallet addresses.
3. Sign: user wallet signs `unsignedTransaction` (do NOT mutate it).
4. Execute: `sap_sunrise_execute_quote` with the signed transaction.
5. Poll: re-call with IDENTICAL arguments while `status === 'SUBMITTED'`.
6. Confirm: `status === 'CONFIRMED'` + `txHash` (Solscan link in response).

## Error Handling

- Quote expired → fetch a fresh quote; never reuse a stale `quoteId`.
- Poll timeout → check wallet activity FIRST before any retry: blind
  retries cause duplicate swaps (`sunrise_poll_timeout` error carries this
  warning).
- Onchain revert (price moved past tolerance) → funds unchanged; re-quote.
- No route → smaller amount or different pair.
- Upstream error envelope: `{success:false, error:{code,message,requestId}}`;
  429/502 need backoff.
- `POST` bodies reject unknown fields (`additionalProperties:false`) — the
  client strips them; keep schemas exact.
- USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, USDT
  `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`, WETH
  `7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs`, WBTC
  `3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh` are core assets NOT in the
  token list but always quotable.

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