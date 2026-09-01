/**
 * @name tools/phoenix/phoenix-data-tools
 * @description Read-only Phoenix perp data tools (market data, trader state, funding, fills, candles).
 *
 * All reads are free/sponsored — no x402 charge.
 *
 * @module tools/phoenix/phoenix-data-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import { logger } from '../../../core/src/logger.js';
import { PhoenixDataApiClient } from '../../../perps/src/phoenix/phoenix-data-api.js';
import {
  registerPhoenixPipelineTool,
  phoenixPipelineOk,
  phoenixPipelineException,
} from './phoenix-pipeline.js';
import type { JsonSchema } from './phoenix-helpers.js';

let cachedClient: PhoenixDataApiClient | null = null;

function getClient(): PhoenixDataApiClient {
  if (!cachedClient) cachedClient = new PhoenixDataApiClient();
  return cachedClient;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Exchange reads
 * ═══════════════════════════════════════════════════════════════════ */

export function registerPhoenixExchangeTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_exchange', {
    description: 'Get Phoenix exchange snapshot: all markets, status, configuration. Free read.',
    inputSchema: { type: 'object', properties: {} } as unknown as JsonSchema,
  }, async () => {
    try {
      const data = await getClient().getExchange();
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to get Phoenix exchange', err);
    }
  });
}

export function registerPhoenixMarketTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_market', {
    description: 'Get Phoenix market metadata for a symbol (e.g. SOL, BTC). Free read.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Market symbol (e.g. SOL, BTC, ETH)' } },
      required: ['symbol'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const data = await getClient().getMarket(input.symbol as string);
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to get Phoenix market', err);
    }
  });
}

export function registerPhoenixMarketsTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_markets', {
    description: 'List all Phoenix markets with parameters. Returns a compact summary of available markets (symbols, leverage tiers, fees). For full market details, use sap_phoenix_get_market with a specific symbol. Do NOT call this tool repeatedly — the summary does not change within a session. Free read.',
    inputSchema: { type: 'object', properties: {} } as unknown as JsonSchema,
  }, async () => {
    try {
      const data = await getClient().getMarkets();
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to list Phoenix markets', err);
    }
  });
}

export function registerPhoenixOrderbookTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_orderbook', {
    description: 'Get Phoenix orderbook for a symbol. Use depth to limit the number of bid/ask levels returned (default 20, max 100). Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Market symbol (e.g. SOL)' },
        depth: { type: 'number', description: 'Number of bid/ask levels to return (default 20, max 100)', minimum: 1, maximum: 100 },
      },
      required: ['symbol'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const depth = typeof input.depth === 'number' ? Math.min(input.depth, 100) : 20;
      const data = await getClient().getOrderbook(input.symbol as string, { depth });
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to get Phoenix orderbook', err);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Market stats and funding
 * ═══════════════════════════════════════════════════════════════════ */

export function registerPhoenixMarketStatsTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_market_stats', {
    description: 'Get Phoenix market stats history (24h volume, OI, funding). Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Market symbol' },
        limit: { type: 'number', description: 'Max data points (default 100)', minimum: 1, maximum: 1000 },
      },
      required: ['symbol'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const data = await getClient().getMarketStatsHistory(input.symbol as string);
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to get Phoenix market stats', err);
    }
  });
}

export function registerPhoenixFundingHistoryTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_funding_history', {
    description: 'Get Phoenix funding rate history for a symbol. Free read.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Market symbol' } },
      required: ['symbol'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const data = await getClient().getFundingRateHistory(input.symbol as string);
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to get Phoenix funding history', err);
    }
  });
}

export function registerPhoenixMarketFillsTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_market_fills', {
    description: 'Get recent fills for a Phoenix market. Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Market symbol' },
        limit: { type: 'number', description: 'Max fills (default 100)', minimum: 1, maximum: 500 },
      },
      required: ['symbol'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const data = await getClient().getMarketFills(input.symbol as string);
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to get Phoenix market fills', err);
    }
  });
}

export function registerPhoenixCandlesTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_candles', {
    description: 'Get OHLCV candles for a Phoenix market. Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Market symbol' },
        timeframe: { type: 'string', description: 'Candle timeframe (e.g. 1m, 5m, 1h, 1d)' },
        limit: { type: 'number', description: 'Max candles (default 100)', minimum: 1, maximum: 1000 },
      },
      required: ['symbol', 'timeframe'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const data = await getClient().getCandles(input.symbol as string, { timeframe: input.timeframe as string });
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to get Phoenix candles', err);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Trader reads
 * ═══════════════════════════════════════════════════════════════════ */

export function registerPhoenixTraderTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_trader', {
    description: 'Get Phoenix trader state (positions, orders, collateral). Free read.',
    inputSchema: {
      type: 'object',
      properties: { authority: { type: 'string', description: 'Trader authority public key (base58)' } },
      required: ['authority'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const data = await getClient().getTrader(input.authority as string);
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to get Phoenix trader', err);
    }
  });
}

export function registerPhoenixTraderStateTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_trader_state', {
    description: 'Get Phoenix trader state snapshot (subaccounts, positions, collateral). Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key (base58)' },
        traderPdaIndex: { type: 'number', description: 'Trader PDA index (default 0)', minimum: 0 },
      },
      required: ['authority'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const data = await getClient().getTraderStateSnapshot(input.authority as string);
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to get Phoenix trader state', err);
    }
  });
}

export function registerPhoenixTraderPnlTool(server: Server, context: SapMcpContext): void {
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_trader_pnl', {
    description: 'Get Phoenix trader PnL history. Free read.',
    inputSchema: {
      type: 'object',
      properties: { authority: { type: 'string', description: 'Trader authority public key (base58)' } },
      required: ['authority'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const data = await getClient().getTraderPnl(input.authority as string, { resolution: (input.resolution as string) ?? '1h' });
      return phoenixPipelineOk(data);
    } catch (err) {
      return phoenixPipelineException('Failed to get Phoenix trader PnL', err);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Registration helper
 * ═══════════════════════════════════════════════════════════════════ */

export function registerPhoenixDataTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Phoenix data tools');
  registerPhoenixExchangeTool(server, context);
  registerPhoenixMarketTool(server, context);
  registerPhoenixMarketsTool(server, context);
  registerPhoenixOrderbookTool(server, context);
  registerPhoenixMarketStatsTool(server, context);
  registerPhoenixFundingHistoryTool(server, context);
  registerPhoenixMarketFillsTool(server, context);
  registerPhoenixCandlesTool(server, context);
  registerPhoenixTraderTool(server, context);
  registerPhoenixTraderStateTool(server, context);
  registerPhoenixTraderPnlTool(server, context);
  logger.debug('Phoenix data tools registered', { count: 11 });
}