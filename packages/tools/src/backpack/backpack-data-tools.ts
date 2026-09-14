/**
 * @name tools/backpack/backpack-data-tools
 * @description Free read-only Backpack Exchange market-data tools (markets,
 * tickers, depth, trades, klines, mark prices, funding, open interest,
 * collateral, assets, securities, market sessions, borrow/lend).
 *
 * All reads are free — no x402 charge. A single shared BackpackApiClient is
 * cached at module level (same pattern as Phoenix).
 *
 * @module tools/backpack/backpack-data-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import { logger } from '../../../core/src/logger.js';
import { BackpackApiClient } from './backpack-client.js';
import {
  registerBackpackPipelineTool,
  backpackPipelineOk,
  backpackPipelineError,
  backpackPipelineException,
} from './backpack-pipeline.js';

/** Upstream Backpack REST API paths (public GET endpoints, no auth). */
export const BACKPACK_PATHS = {
  markets: '/api/v1/markets',
  ticker: '/api/v1/ticker',
  tickers: '/api/v1/tickers',
  depth: '/api/v1/depth',
  trades: '/api/v1/trades',
  klines: '/api/v1/klines',
  markPrices: '/api/v1/markPrices',
  fundingRates: '/api/v1/fundingRates',
  openInterest: '/api/v1/openInterest',
  collateral: '/api/v1/collateral',
  assets: '/api/v1/assets',
  securities: '/api/v1/securities',
  marketSessions: '/api/v1/market-sessions',
  borrowLendMarkets: '/api/v1/borrowLend/markets',
} as const;

/** Valid Backpack kline intervals (lowercase except 1M for monthly). */
const KLINE_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'] as const;
export type BackpackKlineInterval = (typeof KLINE_INTERVALS)[number];

const SYMBOL_CONVENTIONS = 'Backpack symbols: spot SOL_USDC, perp SOL_USDC_PERP (marketType SPOT|PERP), stock spot MU.US_USDC, stock RFQ AAPL.US_USDC_RFQ.';

let cachedClient: BackpackApiClient | null = null;

function getClient(): BackpackApiClient {
  if (!cachedClient) cachedClient = new BackpackApiClient();
  return cachedClient;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Helpers
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Convert ISO-8601 strings or epoch milliseconds into epoch SECONDS for the
 * upstream klines endpoint. Passes through numbers < 1e12 (already seconds).
 */
export function toEpochSeconds(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const raw = String(value).trim();
  const asNumber = Number(raw);
  if (raw !== '' && Number.isFinite(asNumber)) {
    return asNumber >= 1e12 ? Math.floor(asNumber / 1000) : Math.floor(asNumber);
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`${label} must be an ISO-8601 date string or epoch time (received "${raw.slice(0, 50)}")`);
  }
  return Math.floor(parsed / 1000);
}

export function validateKlineInterval(value: unknown): BackpackKlineInterval {
  const interval = String(value ?? '').trim();
  if (!(KLINE_INTERVALS as readonly string[]).includes(interval)) {
    throw new Error(`Invalid interval "${interval}". Valid Backpack kline intervals: ${KLINE_INTERVALS.join(', ')}`);
  }
  return interval as BackpackKlineInterval;
}

/** Market row from /api/v1/markets (fields consumers rely on). */
interface BackpackMarket {
  readonly symbol?: unknown;
  readonly [key: string]: unknown;
}

function filterBySymbol(rows: readonly unknown[], symbol: string): unknown[] {
  return rows.filter((row) =>
    row !== null && typeof row === 'object'
    && typeof (row as BackpackMarket).symbol === 'string'
    && (row as BackpackMarket).symbol === symbol,
  );
}

/**
 * Compact the 2.1MB /api/v1/assets payload server-side: only `symbol` plus
 * token deposit/withdraw fields survive; optional exact-symbol filter.
 */
function compactAssets(rows: readonly unknown[], symbol?: string): unknown[] {
  const wanted = symbol?.trim();
  const out: unknown[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const asset = row as Record<string, unknown>;
    const assetSymbol = typeof asset.symbol === 'string' ? asset.symbol : undefined;
    if (wanted && assetSymbol !== wanted) continue;
    const tokens = Array.isArray(asset.tokens)
      ? (asset.tokens as unknown[]).map((t) => {
          if (t === null || typeof t !== 'object') return t;
          const tok = t as Record<string, unknown>;
          return {
            blockchain: tok.blockchain,
            address: tok.address ?? tok.contractAddress,
            depositEnabled: tok.depositEnabled,
            withdrawEnabled: tok.withdrawEnabled,
            minimumDeposit: tok.minimumDeposit,
            minimumWithdrawal: tok.minimumWithdrawal,
            nativeDecimals: tok.nativeDecimals,
            withdrawalFee: tok.withdrawalFee,
          };
        })
      : undefined;
    out.push({
      symbol: assetSymbol,
      ...(asset.coingeckoId !== undefined ? { coingeckoId: asset.coingeckoId } : {}),
      ...(tokens !== undefined ? { tokens } : {}),
    });
  }
  return out;
}

/**
 * Compact the 500KB /api/v1/securities payload server-side; optional asset
 * prefix filter (e.g. "AAPL." matches AAPL.US).
 */
function compactSecurities(rows: readonly unknown[], assetPrefix?: string): unknown[] {
  const prefix = assetPrefix?.trim();
  const out: unknown[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const sec = row as Record<string, unknown>;
    const asset = typeof sec.asset === 'string' ? sec.asset : '';
    if (prefix && !asset.startsWith(prefix)) continue;
    out.push({
      asset,
      ...(sec.name !== undefined ? { name: sec.name } : {}),
      ...(sec.sessions !== undefined ? { sessions: sec.sessions } : {}),
      ...(sec.cusip !== undefined ? { cusip: sec.cusip } : {}),
    });
  }
  return out;
}

/** Human-readable hint for the 404-trap guidance. */
function marketNotFound(symbol: string): string {
  return `Market "${symbol}" not found in /api/v1/markets. ${SYMBOL_CONVENTIONS} Note: /api/v1/markets/{symbol} does not exist upstream (404 trap) — markets are always listed, never fetched by symbol path.`;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Tool registrations — all FREE reads
 * ═══════════════════════════════════════════════════════════════════ */

export function registerBackpackMarketsTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_markets', {
    description: `List all Backpack Exchange markets with metadata (tickSize, stepSize, price, volume). Optional marketType filter: SPOT or PERP. ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        marketType: { type: 'string', description: 'Optional market type filter', enum: ['SPOT', 'PERP'] },
      },
    },
  }, async (input) => {
    try {
      const marketType = input.marketType === 'SPOT' || input.marketType === 'PERP'
        ? (input.marketType as 'SPOT' | 'PERP')
        : undefined;
      const data = await getClient().getMarkets(marketType);
      return backpackPipelineOk({ markets: data, count: Array.isArray(data) ? data.length : undefined });
    } catch (err) {
      return backpackPipelineException('Failed to list Backpack markets', err);
    }
  });
}

export function registerBackpackMarketTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_market', {
    description: `Get one Backpack market by exact symbol (e.g. SOL_USDC). Resolved by filtering the full markets list client-side — the upstream /markets/{symbol} path is a 404 trap and is never called. ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Market symbol, e.g. SOL_USDC (spot) or SOL_USDC_PERP (perp)' },
      },
      required: ['symbol'],
    },
  }, async (input) => {
    try {
      const symbol = String(input.symbol ?? '').trim();
      if (!symbol) {
        return backpackPipelineException('Failed to get Backpack market', new Error('symbol is required (e.g. SOL_USDC)'));
      }
      const markets = await getClient().getMarkets();
      const rows = Array.isArray(markets) ? markets : [];
      const matches = filterBySymbol(rows, symbol);
      if (matches.length === 0) {
        return backpackPipelineError({
          error: 'backpack_market_not_found',
          message: marketNotFound(symbol),
        });
      }
      return backpackPipelineOk({ market: matches[0] });
    } catch (err) {
      return backpackPipelineException('Failed to get Backpack market', err);
    }
  });
}

export function registerBackpackTickerTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_ticker', {
    description: `Get one Backpack ticker snapshot (lastPrice, bidPrice, askPrice, volume24h...) by symbol, e.g. SOL_USDC. ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Market symbol, e.g. SOL_USDC or SOL_USDC_PERP' },
      },
      required: ['symbol'],
    },
  }, async (input) => {
    try {
      const symbol = String(input.symbol ?? '').trim();
      if (!symbol) {
        return backpackPipelineException('Failed to get Backpack ticker', new Error('symbol is required (e.g. SOL_USDC)'));
      }
      const data = await getClient().getTicker(symbol);
      return backpackPipelineOk({ ticker: data });
    } catch (err) {
      return backpackPipelineException('Failed to get Backpack ticker', err);
    }
  });
}

export function registerBackpackTickersTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_tickers', {
    description: `List ALL Backpack tickers (every market's lastPrice/bid/ask/24h volume) in one call. ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: { type: 'object', properties: {} },
  }, async () => {
    try {
      const data = await getClient().getTickers();
      return backpackPipelineOk({ tickers: data });
    } catch (err) {
      return backpackPipelineException('Failed to list Backpack tickers', err);
    }
  });
}

export function registerBackpackDepthTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_depth', {
    description: `Get Backpack order book depth ([price, qty] ask/bid string pairs) for a symbol; optional limit caps levels per side (default 20; upstream default 1000, max 5000). ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Market symbol, e.g. SOL_USDC or SOL_USDC_PERP' },
        limit: { type: 'number', description: 'Levels per side (default 20, upstream max 5000)', minimum: 1, maximum: 5000 },
      },
      required: ['symbol'],
    },
  }, async (input) => {
    try {
      const symbol = String(input.symbol ?? '').trim();
      if (!symbol) {
        return backpackPipelineException('Failed to get Backpack depth', new Error('symbol is required (e.g. SOL_USDC)'));
      }
      const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) && input.limit > 0
        ? Math.min(Math.floor(input.limit), 5000)
        : 20;
      const data = await getClient().getDepth(symbol, limit);
      return backpackPipelineOk({ depth: data, levelsPerSide: limit });
    } catch (err) {
      return backpackPipelineException('Failed to get Backpack depth', err);
    }
  });
}

export function registerBackpackTradesTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_trades', {
    description: `Get recent Backpack trades (id, price, quantity, quoteQuantity, timestamp ms, isBuyerMaker) for a symbol; optional limit (default 50). ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Market symbol, e.g. SOL_USDC' },
        limit: { type: 'number', description: 'Max trades (default 50)', minimum: 1, maximum: 1000 },
      },
      required: ['symbol'],
    },
  }, async (input) => {
    try {
      const symbol = String(input.symbol ?? '').trim();
      if (!symbol) {
        return backpackPipelineException('Failed to get Backpack trades', new Error('symbol is required (e.g. SOL_USDC)'));
      }
      const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) && input.limit > 0
        ? Math.min(Math.floor(input.limit), 1000)
        : 50;
      const data = await getClient().getTrades(symbol, limit);
      return backpackPipelineOk({ trades: data, count: Array.isArray(data) ? data.length : undefined });
    } catch (err) {
      return backpackPipelineException('Failed to get Backpack trades', err);
    }
  });
}

export function registerBackpackKlinesTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_klines', {
    description: `Get Backpack OHLCV klines for a symbol. interval is one of 1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M (case-sensitive: 'M' = month). startTime/endTime accept ISO-8601 strings or epoch milliseconds and are converted to epoch SECONDS upstream. ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Market symbol, e.g. SOL_USDC or SOL_USDC_PERP' },
        interval: { type: 'string', description: `Kline interval (${KLINE_INTERVALS.join(' ')})`, enum: [...KLINE_INTERVALS] },
        startTime: { type: 'string', description: 'Range start: ISO-8601 string or epoch (seconds or milliseconds)' },
        endTime: { type: 'string', description: 'Range end: ISO-8601 string or epoch (seconds or milliseconds)' },
      },
      required: ['symbol', 'interval'],
    },
  }, async (input) => {
    try {
      const symbol = String(input.symbol ?? '').trim();
      if (!symbol) {
        return backpackPipelineException('Failed to get Backpack klines', new Error('symbol is required (e.g. SOL_USDC)'));
      }
      const interval = validateKlineInterval(input.interval);
      const startSec = toEpochSeconds(input.startTime, 'startTime');
      const endSec = toEpochSeconds(input.endTime, 'endTime');
      if (startSec === undefined || endSec === undefined) {
        return backpackPipelineException(
          'Failed to get Backpack klines',
          new Error('startTime and endTime are required (ISO-8601 strings or epoch times)'),
        );
      }
      const data = await getClient().getKlines(symbol, interval, startSec, endSec);
      return backpackPipelineOk({
        klines: data,
        interval,
        startTimeSec: startSec,
        endTimeSec: endSec,
        count: Array.isArray(data) ? data.length : undefined,
      });
    } catch (err) {
      return backpackPipelineException('Failed to get Backpack klines', err);
    }
  });
}

export function registerBackpackMarkPriceTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_mark_price', {
    description: `Get Backpack mark price, index price, funding rate and next funding timestamp for a PERP symbol (e.g. SOL_USDC_PERP). ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Perp market symbol, e.g. SOL_USDC_PERP' },
      },
      required: ['symbol'],
    },
  }, async (input) => {
    try {
      const symbol = String(input.symbol ?? '').trim();
      if (!symbol) {
        return backpackPipelineException('Failed to get Backpack mark price', new Error('symbol is required (e.g. SOL_USDC_PERP)'));
      }
      const data = await getClient().getMarkPrices(symbol);
      return backpackPipelineOk({ markPrices: data });
    } catch (err) {
      return backpackPipelineException('Failed to get Backpack mark price', err);
    }
  });
}

export function registerBackpackFundingRatesTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_funding_rates', {
    description: `Get Backpack funding-rate history for a perp symbol (e.g. SOL_USDC_PERP). ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Perp market symbol, e.g. SOL_USDC_PERP' },
      },
      required: ['symbol'],
    },
  }, async (input) => {
    try {
      const symbol = String(input.symbol ?? '').trim();
      if (!symbol) {
        return backpackPipelineException('Failed to get Backpack funding rates', new Error('symbol is required (e.g. SOL_USDC_PERP)'));
      }
      const data = await getClient().getFundingRates(symbol);
      return backpackPipelineOk({ fundingRates: data });
    } catch (err) {
      return backpackPipelineException('Failed to get Backpack funding rates', err);
    }
  });
}

export function registerBackpackOpenInterestTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_open_interest', {
    description: `Get Backpack open interest for a perp symbol (e.g. SOL_USDC_PERP). ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Perp market symbol, e.g. SOL_USDC_PERP' },
      },
      required: ['symbol'],
    },
  }, async (input) => {
    try {
      const symbol = String(input.symbol ?? '').trim();
      if (!symbol) {
        return backpackPipelineException('Failed to get Backpack open interest', new Error('symbol is required (e.g. SOL_USDC_PERP)'));
      }
      const data = await getClient().getOpenInterest(symbol);
      return backpackPipelineOk({ openInterest: data });
    } catch (err) {
      return backpackPipelineException('Failed to get Backpack open interest', err);
    }
  });
}

export function registerBackpackCollateralTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_collateral', {
    description: `Get Backpack collateral requirements per asset: haircut/imf/mmf functions and weights. Backpack symbols: spot SOL_USDC, perp SOL_USDC_PERP. No arguments. Free read.`,
    inputSchema: { type: 'object', properties: {} },
  }, async () => {
    try {
      const data = await getClient().getCollateral();
      return backpackPipelineOk({ collateral: data });
    } catch (err) {
      return backpackPipelineException('Failed to get Backpack collateral', err);
    }
  });
}

export function registerBackpackAssetsTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_assets', {
    description: `List Backpack assets (raw response is 2.1MB — compacted server-side to symbol + per-token deposit/withdraw fields; optional exact-symbol filter). ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional exact asset symbol filter, e.g. SOL' },
      },
    },
  }, async (input) => {
    try {
      const symbol = typeof input.symbol === 'string' && input.symbol.trim() !== ''
        ? input.symbol.trim()
        : undefined;
      const assets = await getClient().getAssets();
      const rows = Array.isArray(assets) ? assets : [];
      const compacted = compactAssets(rows, symbol);
      if (symbol !== undefined && compacted.length === 0) {
        return backpackPipelineError({
          error: 'backpack_asset_not_found',
          message: `Asset "${symbol}" not found in /api/v1/assets. Use sap_backpack_get_tickers to discover valid symbols.`,
        });
      }
      return backpackPipelineOk({ assets: compacted, count: compacted.length });
    } catch (err) {
      return backpackPipelineException('Failed to list Backpack assets', err);
    }
  });
}

export function registerBackpackSecuritiesTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_securities', {
    description: `List Backpack tradable securities/stocks (raw response is 500KB — compacted server-side; optional asset prefix filter, e.g. "AAPL." matches AAPL.US): cusip, name, trading sessions with max/min quantity and stepSize. ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: 'Optional asset prefix filter, e.g. AAPL. or AAPL.US' },
      },
    },
  }, async (input) => {
    try {
      const assetPrefix = typeof input.asset === 'string' && input.asset.trim() !== ''
        ? input.asset.trim()
        : undefined;
      const securities = await getClient().getSecurities();
      const rows = Array.isArray(securities) ? securities : [];
      const compacted = compactSecurities(rows, assetPrefix);
      return backpackPipelineOk({ securities: compacted, count: compacted.length });
    } catch (err) {
      return backpackPipelineException('Failed to list Backpack securities', err);
    }
  });
}

export function registerBackpackMarketSessionsTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_market_sessions', {
    description: `List Backpack market sessions (e.g. US_EQUITIES_PRE_MARKET, US_EQUITIES_REGULAR, US_EQUITIES_POST_MARKET, US_EQUITIES_OVERNIGHT) governing stock market availability. Backpack symbols: stock spot MU.US_USDC, stock RFQ AAPL.US_USDC_RFQ. No arguments. Free read.`,
    inputSchema: { type: 'object', properties: {} },
  }, async () => {
    try {
      const data = await getClient().getMarketSessions();
      return backpackPipelineOk({ marketSessions: data });
    } catch (err) {
      return backpackPipelineException('Failed to get Backpack market sessions', err);
    }
  });
}

export function registerBackpackBorrowLendTool(server: Server, context: SapMcpContext): void {
  registerBackpackPipelineTool(server, context, 'sap_backpack_get_borrow_lend_markets', {
    description: `List Backpack borrow/lend markets: borrow/lend interest rates, utilization, optimal utilization, limits per asset; optional symbol filter (e.g. SOL). ${SYMBOL_CONVENTIONS} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional asset symbol filter, e.g. SOL' },
      },
    },
  }, async (input) => {
    try {
      const symbolFilter = typeof input.symbol === 'string' && input.symbol.trim() !== ''
        ? input.symbol.trim()
        : undefined;
      const markets = await getClient().getBorrowLendMarkets();
      const rows = Array.isArray(markets) ? markets : [];
      const filtered = symbolFilter === undefined
        ? rows
        : rows.filter((row) => {
            if (row === null || typeof row !== 'object') return false;
            const s = (row as Record<string, unknown>).symbol;
            return typeof s === 'string' && s.includes(symbolFilter);
          });
      return backpackPipelineOk({ borrowLendMarkets: filtered, count: filtered.length });
    } catch (err) {
      return backpackPipelineException('Failed to list Backpack borrow/lend markets', err);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Registration helper
 * ═══════════════════════════════════════════════════════════════════ */

export function registerBackpackDataTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Backpack data tools');
  registerBackpackMarketsTool(server, context);
  registerBackpackMarketTool(server, context);
  registerBackpackTickerTool(server, context);
  registerBackpackTickersTool(server, context);
  registerBackpackDepthTool(server, context);
  registerBackpackTradesTool(server, context);
  registerBackpackKlinesTool(server, context);
  registerBackpackMarkPriceTool(server, context);
  registerBackpackFundingRatesTool(server, context);
  registerBackpackOpenInterestTool(server, context);
  registerBackpackCollateralTool(server, context);
  registerBackpackAssetsTool(server, context);
  registerBackpackSecuritiesTool(server, context);
  registerBackpackMarketSessionsTool(server, context);
  registerBackpackBorrowLendTool(server, context);
  logger.debug('Backpack data tools registered', { count: 15 });
}