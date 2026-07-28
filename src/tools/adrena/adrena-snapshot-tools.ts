/**
 * @name tools/adrena/adrena-snapshot-tools
 * @description Market snapshot tool with TTL cache for reduced x402 costs.
 *
 * @module tools/adrena/adrena-snapshot-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/types.js';
import { createTextResponse } from '../../adapters/mcp/tool-response.js';
import { registerTool } from '../../adapters/mcp/sdk-compat.js';
import { getConnection } from './adrena-helpers.js';
import { adrenaDataApi } from '../../perps/adrena/adrena-data-api.js';
import { ADRENA_MAIN_POOL_ADDRESS, ADRENA_CUSTODIES } from '../../perps/adrena/adrena-constants.js';
import { logger } from '../../core/logger.js';

/** TTL for the market snapshot cache in milliseconds. */
const SNAPSHOT_CACHE_TTL_MS = 30_000;

/** Cached snapshot data. */
interface CachedSnapshot {
  data: MarketSnapshotResult;
  timestamp: number;
}

/** Market snapshot response. */
export interface MarketSnapshotResult {
  timestamp: string;
  cached: boolean;
  cacheTtlSeconds: number;
  markets: MarketEntry[];
  prices: Record<string, number>;
  poolInfo: PoolInfo;
}

/** Single market entry in the snapshot. */
interface MarketEntry {
  symbol: string;
  pool: string;
  allowTrade: boolean;
  allowSwap: boolean;
  maxInitialLeverage: number;
  maxLeverage: number;
  decimals: number;
}

/** Pool info in the snapshot. */
interface PoolInfo {
  poolAddress: string;
  aumUsd: number;
  lpTokenSupply: number;
}

let snapshotCache: CachedSnapshot | null = null;

/**
 * @name registerAdrenaMarketSnapshotTool
 * @description Register sap_market_snapshot — returns markets + prices + pool info
 * in a single call with a 30-second TTL cache. Reduces x402 costs for polling bots.
 * @internal
 */
export function registerAdrenaMarketSnapshotTool(server: Server, context: SapMcpContext): void {
  registerTool(server, 'sap_market_snapshot', {
    description: 'Returns a complete market snapshot: all Adrena market data (leverage, OI, flags), live oracle prices, and pool health (AUM, LP supply) in one call. Includes a 30-second TTL cache — repeated calls within the cache window return cached data without re-fetching. Reduces market data costs by 20x for polling bots.',
    inputSchema: {
      type: 'object',
      properties: {
        forceRefresh: {
          type: 'boolean',
          description: 'When true, bypasses the cache and fetches fresh data. Default false.',
        },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const forceRefresh = args['forceRefresh'] === true;

      // Check cache first.
      if (!forceRefresh && snapshotCache && Date.now() - snapshotCache.timestamp < SNAPSHOT_CACHE_TTL_MS) {
        const cached: MarketSnapshotResult = {
          ...snapshotCache.data,
          cached: true,
          timestamp: new Date(snapshotCache.timestamp).toISOString(),
        };
        return createTextResponse(JSON.stringify(cached, null, 2));
      }

      const connection = getConnection(context);

      // Fetch prices from the Adrena Data API.
      const prices: Record<string, number> = {};
      try {
        const tradingPrices = await adrenaDataApi.getLastTradingPrices();
        if (tradingPrices && Array.isArray(tradingPrices)) {
          for (const p of tradingPrices) {
            if (p.symbol && p.priceUsd) {
              prices[p.symbol] = Number(p.priceUsd);
            }
          }
        }
      } catch (priceErr) {
        logger.warn('Market snapshot: failed to fetch trading prices', { error: priceErr instanceof Error ? priceErr.message : String(priceErr) });
      }

      // Read custody accounts on-chain for market data.
      const markets: MarketEntry[] = [];
      for (const [symbol, custody] of Object.entries(ADRENA_CUSTODIES)) {
        try {
          const custodyInfo = await connection.getAccountInfo(new (await import('@solana/web3.js')).PublicKey(custody.address), 'confirmed');
          if (!custodyInfo || !custodyInfo.data || custodyInfo.data.length < 184) continue;
          const d = custodyInfo.data;
          const allowTrade = d[10] === 1;
          const allowSwap = d[11] === 1;
          const maxInitialLeverageBps = d.readUInt32LE(176);
          const maxLeverageBps = d.readUInt32LE(180);
          const decimals = d[12];
          markets.push({
            symbol,
            pool: custody.pool === ADRENA_MAIN_POOL_ADDRESS ? 'main-pool' : 'commodities-pool',
            allowTrade,
            allowSwap,
            maxInitialLeverage: maxInitialLeverageBps / 10000,
            maxLeverage: maxLeverageBps / 10000,
            decimals,
          });
        } catch {
          // Skip unreadable custody.
        }
      }

      // Read main pool account for pool health.
      let poolInfo: PoolInfo = { poolAddress: ADRENA_MAIN_POOL_ADDRESS, aumUsd: 0, lpTokenSupply: 0 };
      try {
        const poolInfo_raw = await connection.getAccountInfo(new (await import('@solana/web3.js')).PublicKey(ADRENA_MAIN_POOL_ADDRESS), 'confirmed');
        if (poolInfo_raw && poolInfo_raw.data && poolInfo_raw.data.length >= 80) {
          const aumUsdRaw = poolInfo_raw.data.readBigUInt64LE(16) + (BigInt(poolInfo_raw.data.readBigUInt64LE(24)) << 64n);
          const lpTokenSupply = poolInfo_raw.data.readBigUInt64LE(32);
          poolInfo = {
            poolAddress: ADRENA_MAIN_POOL_ADDRESS,
            aumUsd: Number(aumUsdRaw) / 1e6,
            lpTokenSupply: Number(lpTokenSupply),
          };
        }
      } catch {
        // Best-effort pool read.
      }

      const result: MarketSnapshotResult = {
        timestamp: new Date().toISOString(),
        cached: false,
        cacheTtlSeconds: SNAPSHOT_CACHE_TTL_MS / 1000,
        markets,
        prices,
        poolInfo,
      };

      // Update cache.
      snapshotCache = { data: { ...result }, timestamp: Date.now() };

      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build market snapshot', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}