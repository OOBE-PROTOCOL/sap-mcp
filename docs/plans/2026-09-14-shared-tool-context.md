# Shared context for ALL subagents building Backpack + Sunrise SAP MCP tools

You are implementing part of the Backpack Exchange + Sunrise tool families for SAP MCP
(`/Users/keepeeto/Desktop/sap-mcp-server`). Read this context block fully before starting.

## Repository conventions (MANDATORY)

- TypeScript STRICT mode. NO `any`. No `@ts-ignore`. TSDoc `@name/@description/@module` on every exported symbol (verified by verify:exports).
- Package manager: pnpm. Test: vitest. Imports between packages are RELATIVE (`../../core/src/logger.js`) — package-name imports break Node runtime.
- All tool families use the pipeline pattern. Reference implementations to copy patterns from (READ THEM):
  - `packages/tools/src/phoenix/phoenix-pipeline.ts` (compact responses, registerPhoenixPipelineTool)
  - `packages/tools/src/phoenix/phoenix-data-tools.ts` (free read tool pattern)
  - `packages/tools/src/magicblock-tools.ts` (HTTP client + schema helpers + upstreamError pattern + `f.` schema helpers)
  - `packages/tools/src/tool-family-pipeline.ts` (registerToolFamilyPipelineTool — MagicBlock style)
  - `packages/tools/src/builtin-tool-modules.ts` (module registration + expectedTools)
- Input schemas: JSON Schema objects (like phoenix), NOT zod, for tool inputs.
- Response compaction: arrays >50 entries truncated, strings >500 truncated (EXCEPT base64 Solana txs — preserved via VersionedTransaction.deserialize check), BigInt→string, 30k char cap with `_truncated/_originalSize/_note` fields.
- Error envelope for upstream APIs: parse JSON error bodies, surface code+message compactly (magicblock `upstreamError` pattern).
- Every exported symbol has TSDoc. Run `pnpm run lint && pnpm run typecheck` before committing.
- Commits: conventional, English, professional, no hype. NEVER push — commit only. The orchestrator handles release.
- NEVER read, print, or commit real API keys/secrets. Test fixtures use generated throwaway keys only.

## VERIFIED upstream API facts (live-tested 2026-09-14 — trust these, do not re-derive)

### Sunrise (https://api.sunrise.xyz, no auth, CORS *)
- `GET /v1/tokens?limit=200&cursor=<b64>` → `{success:true, data:{count, tokens:[...], pagination:{limit, nextCursor}}}`; Token = `{chain:'solana', address(mint), symbol, name, decimals, platform:'svm', assetClass:'stock'|'crypto'|'commodity', issuer, icon, tokenProgram:'spl-token'|'token-2022', stock:{ticker,currency,exchange:{marketIdentifierCode,name}}|null}`; 76 tokens live; nextCursor=null when exhausted; error envelope `{success:false, error:{code,message,requestId}, timestamp}`; 429/502 possible.
- `POST /v1/quotes` body `{fromToken, toToken, fromAmount, fromAddress?, toAddress?}` ALL STRINGS, amounts in BASE UNITS, `additionalProperties:false`. Without wallet addresses: price-only quotes (NO unsignedTransaction/providerRequestId/slippageBps in response even though schema declares them). With wallets: quote object adds `unsignedTransaction` (base64), `providerRequestId`, `slippageBps`. Quote fields: `quoteId, routeName (e.g. 'titan'), fromToken, toToken, fromAmount, toAmount, fromAmountUSD, toAmountUSD`. 400 invalid / 403 policy-blocked / 413 too large / 429 / 502.
- Core assets NOT in /v1/tokens but quotable — hardcode: USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 dec), USDT `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`, WETH `7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs`, WBTC `3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh`. SOL is native.
- `POST /v1/execute` body `{signedTransaction (b64, REQUIRED), quoteId, routeName, providerRequestId}` (additionalProperties:false) → `{success, data:{txHash, status:'CONFIRMED'|'SUBMITTED'}}`. POLL: re-POST the IDENTICAL body while status==='SUBMITTED'; stop on 'CONFIRMED'.
- Live example: POST /v1/quotes `{fromToken:USDC, toToken:MON CrAr4RRJMBVwRsZtT62pEhfA9H5utymC2mVx8e7FreP2, fromAmount:'1000000'}` → quotes[0]: `{quoteId:'4250d4b7-...', routeName:'titan', toAmount:'4294862936', fromAmountUSD:0.9998, toAmountUSD:0.9966}`.
- Cache header on /v1/tokens: `public, max-age=60`. On quotes: `no-store`.

### Backpack (https://api.backpack.exchange REST, wss://ws.backpack.exchange WS)
- PUBLIC GET endpoints (no auth): `/api/v1/markets` (+`?marketType=SPOT|PERP`), `/api/v1/tickers`, `/api/v1/ticker?symbol=`, `/api/v1/depth?symbol=X&limit=N` (asks/bids arrays of [price,qty] strings; default 1000, max 5000 levels), `/api/v1/trades?symbol=X&limit=N` (objects `{id,isBuyerMaker,price,quantity,quoteQuantity,timestamp(ms epoch)}`), `/api/v1/klines?symbol=X&interval=1h&startTime=<EPOCH SECONDS>&endTime=<EPOCH SECONDS>` (interval lowercase: 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M; returns `[{open,high,low,close,volume,quoteVolume,trades,start:'YYYY-MM-DD HH:mm:ss',end}]`), `/api/v1/markPrices?symbol=SOL_USDC_PERP` (`[{fundingRate,indexPrice,markPrice,nextFundingTimestamp,symbol}]`), `/api/v1/fundingRates?symbol=`, `/api/v1/openInterest?symbol=`, `/api/v1/collateral` (`[{symbol,haircutFunction{kind{...},weight},imfFunction{base,factor,type:sqrt},mmfFunction}]`), `/api/v1/assets` (2.1MB! MUST compact: symbol, tokens[{blockchain,contractAddress,depositEnabled,withdrawEnabled,minimumDeposit,minimumWithdrawal,nativeDecimals,withdrawalFee}], coingeckoId), `/api/v1/securities` (500KB! `[{asset:'AAPL.US',cusip,name,sessions:[{name,maxQuantity,minQuantity,stepSize}]}]` — sessions: US_EQUITIES_PRE_MARKET/REGULAR/POST_MARKET/OVERNIGHT), `/api/v1/market-sessions`, `/api/v1/market-holidays`, `/api/v1/borrowLend/markets` (`[{symbol,assetMarkPrice,borrowInterestRate,lendInterestRate,utilization,optimalUtilization:0.7,fee:0.15,state,openBorrowLendLimit,...}]`), `/api/v1/status` (`{"message":null,"status":"Ok"}`), `/api/v1/ping` (plain `pong`), `/api/v1/time` (epoch ms as number).
- **404 TRAPS** (do not call): `/api/v1/orderbook/{sym}` ❌, `/api/v1/trades/{sym}` ❌, `/api/v1/markets/{sym}` ❌ (use `/api/v1/market?symbol=`), `/api/v1/system/*` ❌. Depth/trades ALWAYS query-param.
- Market symbols: spot `SOL_USDC`, perp `SOL_USDC_PERP` (marketType:'SPOT'|'PERP'), stock RFQ `<SEC>_USDC_RFQ` (NOT in /markets), stock spot book in /markets with `rwaMarketType:'STOCK'` (e.g. `MU.US_USDC`).
- AUTH (Ed25519, only when apiKey configured): headers `X-Timestamp` (ms string), `X-Window` (ms, default '5000', max 60000), `X-API-Key` (base64 32-byte verifying key), `X-Signature` (base64 Ed25519 sig). Signing string EXACT: `instruction=<TYPE>&<param1>=<v1>&...&<paramN>=<vN>&timestamp=<ms>&window=<w>` with params sorted ALPHABETICALLY; when no params, string is just `instruction=<TYPE>&timestamp=<ms>&window=<w>`. Instruction types: accountQuery, accountUpdate, balanceQuery, borrowLendExecute, borrowHistoryQueryAll, borrowLendPositionQuery, borrowPositionHistoryQueryAll, collateralQuery, convertDust, depositAddressQuery, depositQueryAll, dustHistoryQueryAll, fillHistoryQueryAll, fundingHistoryQueryAll, interestHistoryQueryAll, maxBorrowQuantity, maxOrderQuantity, maxWithdrawalQuantity, orderCancel, orderCancelAll, orderExecute, orderHistoryQueryAll, orderQuery, orderQueryAll, positionHistoryQueryAll, positionQuery, quoteAccept, quoteFillHistoryQueryAll, quoteHistoryQueryAll, quoteSubmit, rfqCancel, rfqFillHistoryQueryAll, rfqHistoryQueryAll, rfqQuery, rfqRefresh, rfqSubmit, settlementHistoryQueryAll, strategyCancel, strategyCancelAll, strategyCreate, strategyHistoryQueryAll, strategyQuery, strategyQueryAll, withdraw, withdrawalQueryAll.
- AUTH BEHAVIOR (live-tested): corrupt signature → 400 `{code:'INVALID_CLIENT_REQUEST', message:'Invalid X-Signature header'}`; valid sig over wrong instruction → 400 'Invalid signature'; NO-AUTH request to protected endpoint → 401 UNAUTHORIZED; VALID signature with UNREGISTERED key → **200 with `{}`** (empty balances — Backpack auto-provisions unknown keys as empty accounts, it does NOT 401). NEVER treat a 200-empty response as proof the API key is registered.
- Signed endpoints paths: GET `/api/v1/capital` (balances, instruction balanceQuery), `/api/v1/orders` (orderQueryAll), `/api/v1/historicalOrders/{...}` etc. per docs.backpack.exchange. POST `/api/v1/order` (orderExecute), `/api/v1/orders` (batch), DELETE `/api/v1/order` (orderCancel), `/api/v1/orders` (orderCancelAll), GET `/api/v1/fills`, POST `/api/v1/w capital/withdrawal` (withdraw — check exact path in docs: it is `/api/v1/w capital`? NO — exact path is POST `/api/v1/capital/withdrawal` with instruction `withdraw`), GET `/api/v1/deposit/address?asset=` (depositAddressQuery), GET `/api/v1/maxOrderQuantity?symbol=&side=` (maxOrderQuantity). For any path you are not 100% sure of, VERIFY against the OpenAPI saved at `~/.hermes/profiles/software-engineer/skills/solana/backpack-exchange-api/references/openapi-full.md` (grep it — do not guess).
- Order body: `{symbol, side:'Bid'|'Ask', orderType:'Market'|'Limit'|'IOC'|'PostOnly'|'ReduceOnly'|'Scale'|'TWAP', quantity, price?, clientOrderId?, postOnly?, timeInForce?, stopPrice?, triggerCondition?, selfTradePreventionMode?}`. For stocks RFQ: `POST /api/v1/rfq` body `{symbol:'AAPL.US_USDC_RFQ', side, quantity}` (quoteQuantity NOT supported for stock RFQs), quote accept `POST /api/v1/rfq/accept` `{rfqId, quoteId}` — accept is BINDING with deferred settlement.
- Taker speed bump: 100ms delay on ALL non-postOnly orders (spot+futures). postOnly exempt. Cancels exempt.
- Errors: non-JSON `not found` body for unknown paths; JSON errors otherwise.

## Tool naming + pricing contract (do not deviate)

- All tools prefixed `sap_backpack_` or `sap_sunrise_`.
- Data reads = FREE tier (add to FREE_TOOLS in packages/payments/src/pricing.ts).
- Sunrise quote/execute/swap_intent + Backpack signed wrappers = BUILDER tier (BUILDER_TOOLS set).
- Never let an amount parse to float — strings only, validated with regex `^\d+(\.\d+)?$`.

## Verification commands

- `pnpm vitest run packages/tools/src/backpack packages/tools/src/sunrise` (unit tests)
- `pnpm run lint && pnpm run typecheck`
- Live flag tests: `SAP_LIVE_TESTS=1 pnpm vitest run -t 'live'` (opt-in only)

## Output style

- TSDoc every export. No magic strings — constants object per protocol (SUNRISE_CORE_MINTS, BACKPACK_PATHS, etc.).
- If uncertain about an exact upstream path/param, GREP the OpenAPI reference file rather than guessing: `~/.hermes/profiles/software-engineer/skills/solana/backpack-exchange-api/references/openapi-full.md` (Backpack) and `/Users/keepeeto/sunrise_docs/` (Sunrise, including SUNRISE_API_REFERENCE.md).
- Report at the end: files created, test count passing, any deviations from this context.