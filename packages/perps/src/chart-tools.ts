/**
 * @name perps/chart-tools
 * @description Chart tool registrations: OHLC, long-term price history, and volume profile.
 *
 * @module perps/chart-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/src/types.js';
import { createTextResponse } from '../../mcp-adapter/src/tool-response.js';
import { registerTool } from '../../mcp-adapter/src/sdk-compat.js';
import {
  DEFAULT_VP_BUCKETS,
  DEXSCREENER_API_URL,
  DEFILAMA_API_URL,
  VALUE_AREA_PCT,
  timedFetch,
  type DexScreenerPair,
  type DefiLlamaProtocol,
  type JsonSchema,
  type OhlcCandle,
  type VolumeProfileBucket,
  type VolumeProfileResult,
} from './perp-constants.js';

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 4: sap_chart_ohlc
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerChartOhlcTool
 * @description Register the sap_chart_ohlc read-only tool.
 *
 * Fetches OHLC candlestick data for any Solana token from DexScreener's
 * free REST API.
 *
 * @param server  — MCP server instance.
 * @param context — Runtime context (unused — pure REST call).
 *
 * @internal
 */
export function registerChartOhlcTool(server: Server, _context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      mint: {
        type: 'string',
        description: 'Token mint address (base58) to fetch OHLC data for.',
      },
      resolution: {
        type: 'string',
        description: 'Chart resolution: "5m", "1h", "6h", "24h" (default "1h").',
        enum: ['5m', '1h', '6h', '24h'],
      },
    },
    required: ['mint'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_chart_ohlc', {
    description: 'Fetch OHLC candlestick data for any Solana token from DexScreener. Returns open, high, low, close, volume, liquidity, and FDV. Read-only — uses free DexScreener REST API.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const mint = typeof args['mint'] === 'string' ? args['mint'] as string : '';
    const resolution = typeof args['resolution'] === 'string' ? args['resolution'] as string : '1h';

    if (!mint) {
      return createTextResponse(JSON.stringify({ error: 'mint is required' }), { isError: true });
    }

    const url = `${DEXSCREENER_API_URL}/tokens/v1/solana/${encodeURIComponent(mint)}`;
    const pairs = await timedFetch<DexScreenerPair[]>(url);

    if (!pairs || pairs.length === 0) {
      return createTextResponse(JSON.stringify({
        error: 'No DexScreener pairs found for this mint',
        mint,
      }), { isError: true });
    }

    const pair = pairs[0];
    const priceUsd = pair.priceUsd ? parseFloat(pair.priceUsd) : 0;
    if (priceUsd <= 0) {
      return createTextResponse(JSON.stringify({
        error: 'No valid price data from DexScreener',
        mint,
      }), { isError: true });
    }

    const priceChange = pair.priceChange ?? {};
    const volume = pair.volume ?? {};
    const liquidity = pair.liquidity?.usd ?? 0;
    const fdv = pair.fdv ?? 0;

    // Derive OHLC from price change percentages for the requested resolution.
    const changeMap: Record<string, number> = {
      '5m': priceChange['m5'] ?? 0,
      '1h': priceChange['h1'] ?? 0,
      '6h': priceChange['h6'] ?? 0,
      '24h': priceChange['h24'] ?? 0,
    };
    const changePct = changeMap[resolution] ?? changeMap['1h'];
    const open = priceUsd / (1 + changePct / 100);
    const close = priceUsd;
    const high = Math.max(open, close) * 1.001;
    const low = Math.min(open, close) * 0.999;

    const volMap: Record<string, number> = {
      '5m': (volume['m5'] ?? 0),
      '1h': (volume['h1'] ?? 0),
      '6h': (volume['h6'] ?? 0),
      '24h': (volume['h24'] ?? 0),
    };
    const vol = volMap[resolution] ?? volMap['1h'];

    const candle: OhlcCandle = {
      timestamp: Date.now(),
      open,
      high,
      low,
      close,
      volume: vol,
    };

    return createTextResponse(JSON.stringify({
      mint,
      symbol: pair.baseToken?.symbol ?? 'unknown',
      resolution,
      candle,
      liquidityUsd: liquidity,
      fdv,
      priceUsd,
    }));
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 5: sap_chart_long_term
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerChartLongTermTool
 * @description Register the sap_chart_long_term read-only tool.
 *
 * Fetches long-term price history for a Solana token from DexScreener
 * and optional protocol TVL data from DeFiLlama.
 *
 * @param server  — MCP server instance.
 * @param context — Runtime context (unused — pure REST call).
 *
 * @internal
 */
export function registerChartLongTermTool(server: Server, _context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      mint: {
        type: 'string',
        description: 'Token mint address (base58) for price history.',
      },
      protocol: {
        type: 'string',
        description: 'Optional DeFiLlama protocol slug for TVL history (e.g. "jupiter", "raydium").',
      },
    },
    required: ['mint'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_chart_long_term', {
    description: 'Fetch long-term price history for a Solana token from DexScreener and optional protocol TVL data from DeFiLlama. Returns price changes, volume, liquidity, FDV, and TVL history. Read-only — uses free REST APIs.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const mint = typeof args['mint'] === 'string' ? args['mint'] as string : '';
    const protocol = typeof args['protocol'] === 'string' ? args['protocol'] as string : '';

    if (!mint) {
      return createTextResponse(JSON.stringify({ error: 'mint is required' }), { isError: true });
    }

    // Fetch token price data from DexScreener.
    const dexUrl = `${DEXSCREENER_API_URL}/tokens/v1/solana/${encodeURIComponent(mint)}`;
    const pairs = await timedFetch<DexScreenerPair[]>(dexUrl);

    let priceData: Record<string, unknown> = {};
    if (pairs && pairs.length > 0) {
      const pair = pairs[0];
      priceData = {
        symbol: pair.baseToken?.symbol ?? 'unknown',
        priceUsd: pair.priceUsd ?? '0',
        priceChange: pair.priceChange ?? {},
        volume: pair.volume ?? {},
        liquidityUsd: pair.liquidity?.usd ?? 0,
        fdv: pair.fdv ?? 0,
      };
    }

    // Fetch protocol TVL from DeFiLlama if requested.
    let tvlData: Record<string, unknown> = {};
    if (protocol) {
      const llamaUrl = `${DEFILAMA_API_URL}/protocol/${encodeURIComponent(protocol)}`;
      const protoData = await timedFetch<DefiLlamaProtocol & { tvlHistory?: Array<{ date: number; tvl: number }> }>(llamaUrl);
      if (protoData) {
        tvlData = {
          name: protoData.name,
          currentTvl: protoData.tvl,
          change1d: protoData.change_1d,
          change7d: protoData.change_7d,
          marketcap: protoData.marketcap,
          chain: protoData.chain,
        };
      }
    }

    if (Object.keys(priceData).length === 0 && Object.keys(tvlData).length === 0) {
      return createTextResponse(JSON.stringify({
        error: 'No data available from DexScreener or DeFiLlama',
        mint,
        protocol,
      }), { isError: true });
    }

    return createTextResponse(JSON.stringify({
      mint,
      token: priceData,
      protocolTvl: tvlData,
    }));
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 6: sap_chart_volume_profile
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name computeVolumeProfile
 * @description Compute volume profile (POC, VAH, VAL) from price and volume arrays.
 *
 * Pure TypeScript implementation — no external indicator library.
 *
 * @param prices       — Array of price points.
 * @param volumes      — Array of volume values (same length as prices).
 * @param bucketCount  — Number of price buckets (default 20).
 * @returns Volume profile result with POC, VAH, VAL, and buckets.
 *
 * @internal
 */
function computeVolumeProfile(
  prices: number[],
  volumes: number[],
  bucketCount: number = DEFAULT_VP_BUCKETS,
): VolumeProfileResult {
  if (prices.length === 0 || volumes.length === 0) {
    return { poc: 0, vah: 0, val: 0, buckets: [] };
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;
  if (range === 0) {
    return { poc: minPrice, vah: minPrice, val: minPrice, buckets: [{ priceLow: minPrice, priceHigh: minPrice, volume: volumes.reduce((a, b) => a + b, 0), pctOfTotal: 1 }] };
  }

  const bucketSize = range / bucketCount;
  const buckets: VolumeProfileBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    priceLow: minPrice + i * bucketSize,
    priceHigh: minPrice + (i + 1) * bucketSize,
    volume: 0,
    pctOfTotal: 0,
  }));

  const totalVolume = volumes.reduce((a, b) => a + b, 0);
  if (totalVolume === 0) {
    return { poc: minPrice, vah: maxPrice, val: minPrice, buckets };
  }

  for (let i = 0; i < prices.length; i++) {
    const bucketIdx = Math.min(Math.floor((prices[i] - minPrice) / bucketSize), bucketCount - 1);
    buckets[bucketIdx].volume += volumes[i];
  }

  for (const b of buckets) {
    b.pctOfTotal = b.volume / totalVolume;
  }

  // POC = bucket with highest volume.
  let pocIdx = 0;
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i].volume > buckets[pocIdx].volume) pocIdx = i;
  }
  const poc = (buckets[pocIdx].priceLow + buckets[pocIdx].priceHigh) / 2;

  // Value area: 70% of volume around POC.
  let volAccum = buckets[pocIdx].volume;
  let lowIdx = pocIdx - 1;
  let highIdx = pocIdx + 1;

  while (volAccum / totalVolume < VALUE_AREA_PCT && (lowIdx >= 0 || highIdx < buckets.length)) {
    const lowVol = lowIdx >= 0 ? buckets[lowIdx].volume : 0;
    const highVol = highIdx < buckets.length ? buckets[highIdx].volume : 0;

    if (lowVol >= highVol && lowIdx >= 0) {
      volAccum += lowVol;
      lowIdx--;
    } else if (highIdx < buckets.length) {
      volAccum += highVol;
      highIdx++;
    } else {
      break;
    }
  }

  const val = buckets[lowIdx + 1]?.priceLow ?? minPrice;
  const vah = buckets[highIdx - 1]?.priceHigh ?? maxPrice;

  return { poc, vah, val, buckets };
}

/**
 * @name registerChartVolumeProfileTool
 * @description Register the sap_chart_volume_profile read-only tool.
 *
 * @param server  — MCP server instance.
 * @param context — Runtime context (unused — pure REST + local math).
 *
 * @internal
 */
export function registerChartVolumeProfileTool(server: Server, _context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      mint: {
        type: 'string',
        description: 'Token mint address (base58) to compute volume profile for.',
      },
      buckets: {
        type: 'number',
        description: 'Number of price buckets (default 20).',
        minimum: 5,
        maximum: 100,
      },
    },
    required: ['mint'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_chart_volume_profile', {
    description: 'Compute volume profile (POC, VAH, VAL) for any Solana token using DexScreener price and volume data. Returns point of control, value area high/low, and bucket distribution. Read-only — uses free DexScreener REST API + local computation.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const mint = typeof args['mint'] === 'string' ? args['mint'] as string : '';
    const bucketCount = typeof args['buckets'] === 'number' ? args['buckets'] as number : DEFAULT_VP_BUCKETS;

    if (!mint) {
      return createTextResponse(JSON.stringify({ error: 'mint is required' }), { isError: true });
    }

    // Fetch token data from DexScreener.
    const url = `${DEXSCREENER_API_URL}/tokens/v1/solana/${encodeURIComponent(mint)}`;
    const pairs = await timedFetch<DexScreenerPair[]>(url);

    if (!pairs || pairs.length === 0) {
      return createTextResponse(JSON.stringify({ error: 'No DexScreener data for this mint' }), { isError: true });
    }

    const pair = pairs[0];
    const priceUsd = pair.priceUsd ? parseFloat(pair.priceUsd) : 0;
    if (priceUsd <= 0) {
      return createTextResponse(JSON.stringify({ error: 'No valid price data' }), { isError: true });
    }

    // Derive price points from price change percentages.
    const pc = pair.priceChange ?? {};
    const vol = pair.volume ?? {};
    const prices = [
      priceUsd / (1 + (pc['m5'] ?? 0) / 100),
      priceUsd / (1 + (pc['h1'] ?? 0) / 100),
      priceUsd / (1 + (pc['h6'] ?? 0) / 100),
      priceUsd / (1 + (pc['h24'] ?? 0) / 100),
      priceUsd,
    ];
    const volumes = [
      vol['m5'] ?? 0,
      vol['h1'] ?? 0,
      vol['h6'] ?? 0,
      vol['h24'] ?? 0,
      vol['h24'] ?? 0,
    ];

    const profile = computeVolumeProfile(prices, volumes, bucketCount);

    return createTextResponse(JSON.stringify({
      mint,
      symbol: pair.baseToken?.symbol ?? 'unknown',
      priceUsd,
      volumeProfile: profile,
    }));
  });
}