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

1. Resolve token mints with `jupiter_searchTokens` when the user gives only a
   ticker.
2. Use Pyth for oracle-style price feeds.
3. Use CoinGecko for market data, OHLCV, pools, trending, gainers, and losers.
4. Use `jupiter_shield` and `jupiter_getTokenInfo` for token risk context.

## Safety

Market data is informational. Do not treat it as financial advice, and do not
execute trades from market data without explicit user intent.
