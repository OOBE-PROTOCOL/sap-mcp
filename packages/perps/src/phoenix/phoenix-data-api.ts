/**
 * @name perps/phoenix/phoenix-data-api
 * @description HTTP client wrapper for the Phoenix.trade perp data API.
 *
 * Uses PhoenixHttpClient from @ellipsis-labs/rise to access exchange metadata,
 * market data, orderbooks, trader info, funding rates, fills, and candles.
 *
 * @module perps/phoenix/phoenix-data-api
 */

import { getPhoenixTraderSubaccountAddress, PhoenixHttpClient, PhoenixHttpError } from '@ellipsis-labs/rise';

import { PHOENIX_DATA_API_BASE_URL } from './phoenix-constants.js';

/**
 * Phoenix data API client.
 * Wraps PhoenixHttpClient sub-clients for typed access to Phoenix perp data.
 */
export class PhoenixDataApiClient {
  private readonly client: PhoenixHttpClient;

  /**
   * @param apiUrl — Base URL for the Phoenix perp API. Defaults to perp-api.phoenix.trade.
   */
  constructor(apiUrl: string = PHOENIX_DATA_API_BASE_URL) {
    this.client = new PhoenixHttpClient({ apiUrl });
  }

  /** Underlying PhoenixHttpClient for direct sub-client access. */
  get http(): PhoenixHttpClient {
    return this.client;
  }

  /**
   * Get the full exchange configuration (markets, fees, leverage tiers, etc.).
   * @returns Exchange config object.
   */
  async getExchange() {
    return this.client.exchange().getExchange();
  }

  /**
   * Get a single market's configuration by symbol.
   * @param symbol — Market symbol (e.g. "SOL-PERP").
   * @returns Market config object.
   */
  async getMarket(symbol: string) {
    return this.client.exchange().getMarket(symbol);
  }

  /**
   * Get all market configurations.
   * @returns Array of market config objects.
   */
  async getMarkets() {
    return this.client.exchange().getMarkets();
  }

  /**
   * Get the orderbook for a market.
   * @param symbol — Market symbol.
   * @returns Orderbook view.
   */
  async getOrderbook(symbol: string, params?: { depth?: number }) {
    return this.client.orderbook().getOrderbook(symbol, params as never);
  }

  /**
   * Get the mark price for a market.
   * Uses the markets client's latest stats endpoint.
   * @param symbol — Market symbol.
   * @returns Latest market stats including mark price.
   */
  async getMarkPrice(symbol: string) {
    return this.client.markets().getLatestMarketStats(symbol);
  }

  /**
   * Get market stats history for a symbol.
   * @param symbol — Market symbol.
   * @param params — Optional query parameters (timeframe, start/end time, limit).
   * @returns Market stats history response.
   */
  async getMarketStatsHistory(
    symbol: string,
    params?: { timeframe?: string; start_time?: string; end_time?: string; limit?: number },
  ) {
    return this.client.markets().getMarketStatsHistory(symbol, params);
  }

  /**
   * Get trader info. Accepts either the trader account key (PDA) or the trader
   * authority wallet; the Phoenix perp API only recognizes the trader account
   * key, so an authority input is resolved to its subaccount PDA first.
   *
   * @param pubkey — Trader account key or trader authority wallet (base58).
   * @returns Trader view object.
   */
  async getTrader(pubkey: string) {
    try {
      return await this.client.traders().getTrader(pubkey);
    } catch (error) {
      const isNotFound =
        error instanceof PhoenixHttpError && error.status === 404;
      if (!isNotFound) throw error;
      // 404: the input may be the authority wallet rather than the trader PDA.
      const traderAddress = await getPhoenixTraderSubaccountAddress({
        authority: pubkey,
        traderPdaIndex: 0,
        subaccountIndex: 0,
      } as never);
      return this.client.traders().getTrader(traderAddress as string);
    }
  }

  /**
   * Get trader state snapshot (positions, orders, collateral).
   * @param authority — Trader authority public key (base58).
   * @param traderPdaIndex — Optional trader PDA index (default 0).
   * @returns Trader state snapshot response.
   */
  async getTraderStateSnapshot(authority: string, traderPdaIndex?: number) {
    return this.client.traders().getTraderStateSnapshot(authority, traderPdaIndex !== undefined ? { traderPdaIndex } : undefined);
  }

  /**
   * Get trader PnL history.
   * @param authority — Trader authority public key (base58).
   * @param request — Historical values request (resolution, time range, limit).
   * @returns Array of PnL data points.
   */
  async getTraderPnl(
    authority: string,
    request: { resolution: string; startTime?: number; endTime?: number; limit?: number },
  ) {
    return this.client.traders().getTraderPnl(authority, request);
  }

  /**
   * Get funding rate history for a market.
   * @param symbol — Market symbol.
   * @param params — Optional query parameters.
   * @returns Funding rate history response.
   */
  async getFundingRateHistory(
    symbol: string,
    params?: { startTime?: number; endTime?: number; limit?: number },
  ) {
    return this.client.funding().getFundingRateHistory(symbol, params);
  }

  /**
   * Get recent market fills (trades).
   * @param symbol — Market symbol.
   * @param params — Optional query parameters (limit, cursor, time range).
   * @returns Market fills response.
   */
  async getMarketFills(
    symbol: string,
    params?: { limit?: number; cursor?: string; startTime?: number; endTime?: number },
  ) {
    return this.client.trades().getMarketFills(symbol, params);
  }

  /**
   * Get OHLCV candles for a market.
   * @param symbol — Market symbol.
   * @param params — Query parameters (timeframe required, start/end time, limit).
   * @returns Array of candle objects.
   */
  async getCandles(
    symbol: string,
    params: { timeframe: string; startTime?: number; endTime?: number; limit?: number },
  ) {
    return this.client.candles().getCandles(symbol, params);
  }
}

/**
 * Default Phoenix data API client instance.
 */
export const phoenixDataApi = new PhoenixDataApiClient();