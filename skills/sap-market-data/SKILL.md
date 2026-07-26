# SAP Market Data

Use this skill for token prices, price history, OHLCV, liquidity pools,
trending assets, token metadata, and security/intelligence checks.

## Tools

- `pyth_getPrice`
- `pyth_getPriceHistory`
- `pyth_listPriceFeeds`
- `coingecko_getTokenPrice`
- `coingecko_getTokenInfo`
- `coingecko_getOHLCV`
- `coingecko_getPoolsByToken`
- `coingecko_getTrending`
- `coingecko_getTopGainersLosers`
- `jupiter_getPrice`
- `jupiter_getTokenInfo`
- `jupiter_searchTokens`
- `jupiter_getTokenList`
- `jupiter_programLabels`
- `jupiter_shield`
- `jupiter_getHoldings`

## Flow

1. If the mint/feed id is already known, start with free single-asset snapshots:
   `jupiter_getPrice`, `pyth_getPrice`, or `coingecko_getTokenPrice`.
2. Resolve token mints with `jupiter_searchTokens` only when the user gives
   a ticker or ambiguous asset name; this is broader discovery and may be paid.
3. Use `jupiter_getQuote` for executable route pricing, not as a generic price
   check. Quotes are fresh, paid, and must not be cached as truth.
4. Use Pyth history, CoinGecko OHLCV/pools/trending/gainers/losers, and Jupiter
   token lists only when the user needs broader market context.
5. Use `jupiter_shield` and `jupiter_getTokenInfo` for token risk context.

## Safety

Market data is informational. Do not treat it as financial advice, and do not
execute trades from market data without explicit user intent.
