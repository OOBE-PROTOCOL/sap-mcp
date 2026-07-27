/**
 * @name perps/perp-constants
 * @description Constants, discriminators, offsets, market maps, types, and helper functions
 *              for Adrena perp account decoding and REST API access.
 *
 * @module perps/perp-constants
 */

import type { SapMcpContext } from '../core/types.js';

/* ═══════════════════════════════════════════════════════════════════
 *  Constants
 * ═══════════════════════════════════════════════════════════════════ */

/** Adrena program ID on Solana mainnet. Can be overridden by hosted env config. */
export const DEFAULT_ADRENA_PROGRAM_ID = '13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet';

/** DexScreener REST API base URL (free, no API key). */
export const DEXSCREENER_API_URL = 'https://api.dexscreener.com';

/** DeFiLlama REST API base URL (free, no API key). */
export const DEFILAMA_API_URL = 'https://api.llama.fi';

/** Fetch timeout for external API calls (ms). */
export const FETCH_TIMEOUT_MS = 8_000;

/** Default number of volume profile buckets. */
export const DEFAULT_VP_BUCKETS = 20;

/** Value area percentage for volume profile (70%). */
export const VALUE_AREA_PCT = 0.70;

/* ═══════════════════════════════════════════════════════════════════
 *  Adrena account discriminators (Anchor 0.31 — sha256("account:<Name>")[0..8])
 * ═══════════════════════════════════════════════════════════════════ */

/** Pool account discriminator — sha256("account:Pool")[0..8]. */
export const DISC_POOL = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);

/** Custody account discriminator — sha256("account:Custody")[0..8]. */
export const DISC_CUSTODY = Buffer.from([1, 184, 48, 81, 93, 131, 63, 145]);

/** Position account discriminator — sha256("account:Position")[0..8]. */
export const DISC_POSITION = Buffer.from([170, 188, 143, 228, 122, 64, 247, 208]);

/** Adrena release/39 constants from the official ABI. */
export const ADRENA_USD_DECIMALS = 6;
export const ADRENA_PRICE_DECIMALS = 10;
export const ADRENA_BPS_DECIMALS = 4;

/** Absolute offsets include the 8-byte Anchor account discriminator. */
export const ADRENA_CUSTODY_OFFSETS = {
  allowTrade: 10,
  allowSwap: 11,
  decimals: 12,
  pool: 16,
  mint: 48,
  tokenAccount: 80,
  oracle: 112,
  tradeOracle: 144,
  maxInitialLeverage: 176,
  maxLeverage: 180,
  maxPositionLockedUsd: 184,
  volumeOpenPositionUsd: 320,
  tradeOiLongUsd: 360,
  tradeOiShortUsd: 368,
  assetsCollateral: 376,
  assetsOwned: 384,
  assetsLocked: 392,
  longPositionsOpenCount: 400,
  longPositionsSizeUsd: 408,
  longPositionsBorrowSizeUsd: 416,
  longPositionsLockedAmount: 424,
  longPositionsCollateralUsd: 472,
  shortPositionsOpenCount: 600,
  shortPositionsSizeUsd: 608,
  shortPositionsBorrowSizeUsd: 616,
  shortPositionsLockedAmount: 624,
  shortPositionsCollateralUsd: 672,
  borrowRateCurrent: 800,
  borrowRateLastUpdate: 808,
  optimalUtilizationBps: 832,
  virtualFundingMaxHourlyRate: 840,
  virtualFundingMinTotalOiUsd: 848,
  virtualFundingImbalanceSensitivityBps: 856,
  virtualFundingCurrentLongToShort: 864,
  virtualFundingLastUpdate: 872,
  virtualFundingCumulativeLongToShort: 880,
  virtualFundingCumulativeShortToLong: 896,
  isSynthetic: 912,
  version: 913,
  oracleFeedId: 914,
  tradeOracleFeedId: 915,
} as const;

export const ADRENA_POOL_OFFSETS = {
  allowTrade: 12,
  allowSwap: 13,
  registeredCustodyCount: 15,
  name: 16,
  custodies: 48,
  lpTokenPriceUsd: 328,
  aumUsd: 448,
} as const;

export const ADRENA_POSITION_OWNER_MEMCMP_OFFSET = 16;
export const ADRENA_POSITION_OFFSETS = {
  side: 9,
  owner: ADRENA_POSITION_OWNER_MEMCMP_OFFSET,
  pool: 48,
  custody: 80,
  collateralCustody: 112,
  openTime: 144,
  updateTime: 152,
  price: 160,
  sizeUsd: 168,
  borrowSizeUsd: 176,
  collateralUsd: 184,
  unrealizedInterestUsd: 192,
  lockedAmount: 216,
  collateralAmount: 224,
  exitFeeUsd: 232,
  liquidationFeeUsd: 240,
  id: 248,
  takeProfitLimitPrice: 256,
  paidInterestUsd: 264,
  stopLossLimitPrice: 272,
  stopLossClosePositionPrice: 280,
  unrealizedFundingPaidUsd: 328,
  unrealizedFundingReceivedUsd: 336,
} as const;

export const ADRENA_MAINNET_POOLS: Record<string, { name: string; type: string }> = {
  '4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34': { name: 'main-pool', type: 'gmx' },
  GN2hyBVHcUitWETeDfAoeXDMqow1x8StqdRFnGaUB2vb: { name: 'commodities-pool', type: 'autonom' },
};

export const ADRENA_MAINNET_MARKETS_BY_CUSTODY: Record<string, { symbol: string; market: string; poolName: string; kind: 'collateral' | 'perp' | 'synthetic-perp' }> = {
  Dk523LZeDQbZtUwPEBjFXCd2Au1tD7mWZBJJmcgHktNk: { symbol: 'USDC', market: 'USDC', poolName: 'main-pool', kind: 'collateral' },
  '8aJuzsgjxBnvRhDcfQBD7z4CUj7QoPEpaNwVd7KqsSk5': { symbol: 'BONK', market: 'BONK-PERP', poolName: 'main-pool', kind: 'perp' },
  GZ9XfWwgTRhkma2Y91Q9r1XKotNXYjBnKKabj19rhT71: { symbol: 'JITOSOL', market: 'JITOSOL-PERP', poolName: 'main-pool', kind: 'perp' },
  GFu3qS22mo6bAjg4Lr5R7L8pPgHq6GvbjJPKEHkbbs2c: { symbol: 'WBTC', market: 'WBTC-PERP', poolName: 'main-pool', kind: 'perp' },
  woVG8fmrUzFJhWa6mRjiYC2qFCY73oAnQeioYK1m1JX: { symbol: 'USDC', market: 'USDC', poolName: 'commodities-pool', kind: 'collateral' },
  JB86ouHXGYgF4UbPs8yxYdaHudrdsintf5EbBfMydzYt: { symbol: 'XAU', market: 'XAU-PERP', poolName: 'commodities-pool', kind: 'synthetic-perp' },
  De21TFyUPHkvFsWAt6xJLBBXGp636VuL5cKk2DvfbHiR: { symbol: 'WTI', market: 'WTI-PERP', poolName: 'commodities-pool', kind: 'synthetic-perp' },
  PexsCkkxpVmY4HNxUjT3U9PEg69kYScc8GukUwn6Q3Q: { symbol: 'XAG', market: 'XAG-PERP', poolName: 'commodities-pool', kind: 'synthetic-perp' },
};

/* ═══════════════════════════════════════════════════════════════════
 *  Shared types
 * ═══════════════════════════════════════════════════════════════════ */

/** JSON Schema property definition for MCP tool input schemas. */
export interface JsonSchemaProperty {
  readonly type: string;
  readonly description: string;
  readonly enum?: readonly string[];
  readonly items?: JsonSchemaProperty;
  readonly properties?: Record<string, JsonSchemaProperty>;
  readonly additionalProperties?: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
}

/** Complete JSON Schema object for an MCP tool input. */
export interface JsonSchema {
  readonly type: 'object';
  readonly properties: Record<string, JsonSchemaProperty>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
 *  API response types
 * ═══════════════════════════════════════════════════════════════════ */

export interface DexScreenerPair {
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  priceUsd?: string;
  priceChange?: Record<string, number>;
  volume?: Record<string, number>;
  liquidity?: { usd?: number };
  fdv?: number;
  info?: { imageUrl?: string };
}

export interface DefiLlamaProtocol {
  id?: string;
  name?: string;
  tvl?: number;
  chain?: string;
  change_1d?: number;
  change_7d?: number;
  marketcap?: number;
}

export interface PerpPosition {
  positionKey: string;
  market: string;
  side: 'long' | 'short';
  size: number;
  collateral: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  unrealizedPnl: number;
  liquidationPrice: number;
}

export interface OhlcCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolumeProfileBucket {
  priceLow: number;
  priceHigh: number;
  volume: number;
  pctOfTotal: number;
}

export interface VolumeProfileResult {
  poc: number;
  vah: number;
  val: number;
  buckets: VolumeProfileBucket[];
}

export interface LiquidationZone {
  positionKey: string;
  market: string;
  side: 'long' | 'short';
  liquidationPrice: number;
  currentPrice: number;
  distanceToLiquidationPct: number;
  leverage: number;
}

export interface PerpsProviderConfig {
  marketsUrl?: string;
  positionsUrl?: string;
  builderUrl?: string;
  adrenaProgramId: string;
  apiKeyConfigured: boolean;
  timeoutMs: number;
}

export interface PerpMarketProviderRecord {
  symbol?: string;
  market?: string;
  custodyAddress?: string;
  poolAddress?: string;
  custodyMint?: string;
  markPrice?: number;
  fundingRate?: number;
  openInterestLong?: number;
  openInterestShort?: number;
  volume24h?: number;
  provider?: string;
  [key: string]: unknown;
}

export interface PerpMarketsProviderPayload {
  markets?: PerpMarketProviderRecord[];
  data?: PerpMarketProviderRecord[];
  source?: string;
  venue?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export interface PerpBuilderProviderPayload {
  transactionBase64?: string;
  unsignedTransactionBase64?: string;
  transaction?: string;
  lastValidBlockHeight?: number;
  blockhash?: string;
  feePayer?: string;
  provider?: string;
  warnings?: unknown;
  [key: string]: unknown;
}

export interface DecodedAdrenaPool {
  poolAddress: string;
  name: string;
  type?: string;
  allowTrade: boolean;
  allowSwap: boolean;
  registeredCustodyCount: number;
  custodies: string[];
  lpTokenPriceUsd: number;
  aumUsd: number;
}

export interface DecodedAdrenaCustody {
  symbol: string;
  market: string;
  custodyAddress: string;
  poolAddress: string;
  poolName?: string;
  poolType?: string;
  custodyMint: string;
  tokenAccount: string;
  oracle: string;
  tradeOracle: string;
  oracleFeedId: number;
  tradeOracleFeedId: number;
  decimals: number;
  allowTrade: boolean;
  allowSwap: boolean;
  isStable: boolean;
  isSynthetic: boolean;
  version: number;
  kind: 'collateral' | 'perp' | 'synthetic-perp' | 'unknown';
  markPrice: number | null;
  markPriceSource: 'not_in_custody_account';
  maxInitialLeverage: number;
  maxLeverage: number;
  maxPositionLockedUsd: number;
  openInterestLong: number;
  openInterestShort: number;
  openPositionsLong: number;
  openPositionsShort: number;
  borrowSizeLongUsd: number;
  borrowSizeShortUsd: number;
  collateralLongUsd: number;
  collateralShortUsd: number;
  lockedAmountLongRaw: string;
  lockedAmountShortRaw: string;
  tradeOiLongUsd: number;
  tradeOiShortUsd: number;
  cumulativeOpenPositionUsd: number;
  assetsRaw: {
    collateral: string;
    owned: string;
    locked: string;
  };
  borrowRate: {
    currentRateRaw: string;
    lastUpdate: number;
  };
  funding: {
    currentRateLongToShortRaw: string;
    lastUpdate: number;
    cumulativeLongToShortRaw: string;
    cumulativeShortToLongRaw: string;
    maxHourlyFundingRateRaw: string;
    minTotalOiUsd: number;
    imbalanceSensitivityBps: number;
  };
}

export interface DecodedAdrenaPosition {
  positionKey: string;
  market: string;
  side: 'long' | 'short';
  sideRaw: number;
  owner: string;
  poolAddress: string;
  custodyAddress: string;
  collateralCustodyAddress: string;
  openTime: number;
  updateTime: number;
  entryPrice: number;
  entryPriceRaw: string;
  size: number;
  collateral: number;
  borrowSizeUsd: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedInterestUsd: number;
  unrealizedFundingPaidUsd: number;
  unrealizedFundingReceivedUsd: number;
  lockedAmountRaw: string;
  collateralAmountRaw: string;
  liquidationPrice: number;
  takeProfitLimitPrice: number | null;
  stopLossLimitPrice: number | null;
  stopLossClosePositionPrice: number | null;
  id: string;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Helper: timed fetch
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name timedFetch
 * @description Fetch JSON from a URL with an abort timeout.
 *
 * @param url — The URL to fetch.
 * @returns Parsed JSON response, or `null` on error/timeout.
 *
 * @internal
 */
export async function timedFetch<T>(
  url: string,
  options: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
      body: options.body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
 *  Config helpers
 * ═══════════════════════════════════════════════════════════════════ */

export function getPerpsConfig(context: SapMcpContext): PerpsProviderConfig {
  return context.config.perps ?? {
    adrenaProgramId: DEFAULT_ADRENA_PROGRAM_ID,
    apiKeyConfigured: Boolean(process.env.SAP_MCP_PERPS_API_KEY?.trim()),
    timeoutMs: FETCH_TIMEOUT_MS,
  };
}

export function appendQuery(baseUrl: string, params: Record<string, string | undefined>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function perpsProviderHeaders(): Record<string, string> {
  const apiKey = process.env.SAP_MCP_PERPS_API_KEY?.trim();
  if (!apiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'X-API-Key': apiKey,
  };
}

export function normalizePerpProviderMarkets(
  payload: unknown,
  marketFilter = '',
): PerpMarketProviderRecord[] {
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && !Array.isArray(payload)
      ? ((payload as PerpMarketsProviderPayload).markets ?? (payload as PerpMarketsProviderPayload).data ?? [])
      : [];

  const normalized = records
    .filter((record): record is PerpMarketProviderRecord => Boolean(record) && typeof record === 'object' && !Array.isArray(record))
    .map((record) => {
      const symbol = String(record.symbol ?? record.market ?? '').toUpperCase();
      return {
        ...record,
        symbol,
        market: String(record.market ?? symbol),
      };
    });

  if (!marketFilter) {
    return normalized;
  }

  return normalized.filter((record) => record.symbol === marketFilter || String(record.market).toUpperCase() === marketFilter);
}