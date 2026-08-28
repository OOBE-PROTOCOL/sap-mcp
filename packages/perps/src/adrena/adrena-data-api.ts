/**
 * @name perps/adrena/adrena-data-api
 * @description REST client for the Adrena Data API (datapi.adrena.trade).
 *
 * Provides off-chain analytics: position history, pool statistics, custody
 * stats, trader leaderboards, mutagen points, and oracle prices.
 *
 * This is a pure REST client — no SDK runtime dependency required.
 *
 * @module perps/adrena/adrena-data-api
 */

import { ADRENA_DATA_API_BASE_URL } from './adrena-constants.js';

/** Fetch timeout for Adrena Data API calls (ms). */
const DATA_API_TIMEOUT_MS = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Position history record from the Adrena Data API. */
export interface AdrenaPositionRecord {
  wallet: string;
  principalToken: string;
  collateralToken: string;
  side: string;
  sizeUsd: number;
  collateralUsd: number;
  leverage: number;
  entryPrice: number;
  exitPrice: number | null;
  pnlUsd: number | null;
  openTime: number;
  closeTime: number | null;
  status: string;
}

/** Pool statistics from the Adrena Data API. */
export interface AdrenaPoolInfo {
  poolName: string;
  tvlUsd: number;
  aumUsd: number;
  lpTokenPriceUsd: number;
  totalVolume24h: number;
  totalFees24h: number;
  openInterestLongUsd: number;
  openInterestShortUsd: number;
  timestamp: number;
}

/** Custody statistics from the Adrena Data API. */
export interface AdrenaCustodyInfo {
  symbol: string;
  custodyAddress: string;
  poolName: string;
  openInterestLongUsd: number;
  openInterestShortUsd: number;
  volume24h: number;
  fees24h: number;
  utilization: number;
  timestamp: number;
}

/** Trader info from the Adrena Data API. */
export interface AdrenaTraderInfo {
  wallet: string;
  totalVolumeUsd: number;
  totalPnlUsd: number;
  totalFeesPaid: number;
  positionsCount: number;
  winRate: number;
  rank: number | null;
}

/** Mutagen points data. */
export interface AdrenaMutagenInfo {
  wallet: string;
  totalPoints: number;
  rank: number | null;
  breakdown: Record<string, number>;
}

/** Price data from the Adrena Data API. */
export interface AdrenaPriceInfo {
  adxPriceUsd: number;
  alpPriceUsd: number;
}

/** Last trading prices for all assets. */
export interface AdrenaTradingPrice {
  symbol: string;
  priceUsd: number;
  custodyAddress: string;
  provider?: string;
  feedId?: number;
  timestamp?: number;
}

interface AdrenaTradingPriceApiEntry {
  symbol?: string;
  price?: string | number;
  exponent?: number;
  custody?: string;
  custodyAddress?: string;
  feed_id?: number;
  feedId?: number;
  timestamp?: number;
}

interface AdrenaTradingPriceProviderBucket {
  prices?: AdrenaTradingPriceApiEntry[];
}

interface AdrenaTradingPriceApiResponse {
  data?: Record<string, AdrenaTradingPriceProviderBucket>;
}

// ─── Client ──────────────────────────────────────────────────────────────────

/**
 * Adrena Data API client.
 * Wraps the REST endpoints at datapi.adrena.trade.
 */
export class AdrenaDataApiClient {
  private readonly baseUrl: string;

  /**
   * @param baseUrl — Base URL for the Adrena Data API. Defaults to datapi.adrena.trade.
   */
  constructor(baseUrl: string = ADRENA_DATA_API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Fetch JSON from the Adrena Data API with timeout.
   * @param path — API path (e.g. "/positions").
   * @param params — Query parameters.
   * @returns Parsed JSON response or null on error.
   */
  private async fetchJson<T>(path: string, params?: Record<string, string | undefined>): Promise<T | null> {
    try {
      const url = new URL(this.baseUrl + path);
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value) url.searchParams.set(key, value);
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DATA_API_TIMEOUT_MS);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(`[adrena-data-api] ${url.pathname} HTTP ${response.status}: ${body.slice(0, 200)}`);
        return null;
      }
      return await response.json() as T;
    } catch (error) {
      console.error(`[adrena-data-api] ${path} fetch failed:`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Get position history for a wallet.
   * @param userWallet — Wallet public key.
   * @returns Array of position records.
   */
  async getPositions(userWallet: string): Promise<AdrenaPositionRecord[] | null> {
    return this.fetchJson<AdrenaPositionRecord[]>('/positions', { userWallet });
  }

  /**
   * Get latest pool statistics.
   * @param poolName — Optional pool name filter.
   * @returns Pool info object.
   */
  async getPoolInfo(poolName?: string): Promise<AdrenaPoolInfo | null> {
    return this.fetchJson<AdrenaPoolInfo>('/pool-info', poolName ? { poolName } : undefined);
  }

  /**
   * Get hourly pool statistics.
   * @returns Array of hourly pool info.
   */
  async getHourlyPoolInfo(): Promise<AdrenaPoolInfo[] | null> {
    return this.fetchJson<AdrenaPoolInfo[]>('/pool-info/hourly');
  }

  /**
   * Get daily pool statistics.
   * @returns Array of daily pool info.
   */
  async getDailyPoolInfo(): Promise<AdrenaPoolInfo[] | null> {
    return this.fetchJson<AdrenaPoolInfo[]>('/pool-info/daily');
  }

  /**
   * Get per-asset custody statistics.
   * @param symbol — Optional symbol filter.
   * @returns Array of custody info.
   */
  async getCustodyInfo(symbol?: string): Promise<AdrenaCustodyInfo[] | null> {
    return this.fetchJson<AdrenaCustodyInfo[]>('/custody-info', symbol ? { symbol } : undefined);
  }

  /**
   * Get hourly custody statistics.
   * @returns Array of hourly custody info.
   */
  async getHourlyCustodyInfo(): Promise<AdrenaCustodyInfo[] | null> {
    return this.fetchJson<AdrenaCustodyInfo[]>('/custody-info/hourly');
  }

  /**
   * Get daily custody statistics.
   * @returns Array of daily custody info.
   */
  async getDailyCustodyInfo(): Promise<AdrenaCustodyInfo[] | null> {
    return this.fetchJson<AdrenaCustodyInfo[]>('/custody-info/daily');
  }

  /**
   * Get trader info for a wallet.
   * @param userPubkey — Trader wallet public key.
   * @returns Trader info object.
   */
  async getTraderInfo(userPubkey: string): Promise<AdrenaTraderInfo | null> {
    return this.fetchJson<AdrenaTraderInfo>('/trader-info', { userPubkey });
  }

  /**
   * Get trader leaderboard.
   * @param limit — Optional limit.
   * @returns Array of trader profiles.
   */
  async getTraderProfiles(limit?: number): Promise<AdrenaTraderInfo[] | null> {
    return this.fetchJson<AdrenaTraderInfo[]>('/trader-profiles', limit ? { limit: String(limit) } : undefined);
  }

  /**
   * Get trader volume history.
   * @param userWallet — Trader wallet public key.
   * @returns Volume data.
   */
  async getTraderVolume(userWallet: string): Promise<Record<string, number> | null> {
    return this.fetchJson<Record<string, number>>('/trader-volume', { userWallet });
  }

  /**
   * Get mutagen points for a wallet.
   * @param userWallet — Wallet public key.
   * @returns Mutagen info.
   */
  async getMutagen(userWallet: string): Promise<AdrenaMutagenInfo | null> {
    return this.fetchJson<AdrenaMutagenInfo>('/mutagen', { userWallet });
  }

  /**
   * Get mutagen leaderboard.
   * @param limit — Optional limit.
   * @returns Array of mutagen entries.
   */
  async getMutagenLeaderboard(limit?: number): Promise<AdrenaMutagenInfo[] | null> {
    return this.fetchJson<AdrenaMutagenInfo[]>('/mutagen/leaderboard', limit ? { limit: String(limit) } : undefined);
  }

  /**
   * Get ADX and ALP token prices.
   * @returns Price info.
   */
  async getPrice(): Promise<AdrenaPriceInfo | null> {
    return this.fetchJson<AdrenaPriceInfo>('/price');
  }

  /**
   * Get latest oracle trading prices for all assets.
   * @returns Array of trading prices.
   */
  async getLastTradingPrices(): Promise<AdrenaTradingPrice[] | null> {
    const payload = await this.fetchJson<AdrenaTradingPrice[] | AdrenaTradingPriceApiResponse>('/last-trading-prices');
    if (payload === null) return null;
    if (Array.isArray(payload)) return payload;

    const prices: AdrenaTradingPrice[] = [];
    for (const [provider, bucket] of Object.entries(payload.data ?? {})) {
      for (const entry of bucket.prices ?? []) {
        const symbol = String(entry.symbol ?? '').trim();
        if (!symbol) continue;
        const rawPrice = Number(entry.price ?? 0);
        const exponent = entry.exponent ?? -10;
        prices.push({
          symbol,
          priceUsd: rawPrice * Math.pow(10, exponent),
          custodyAddress: String(entry.custodyAddress ?? entry.custody ?? ''),
          provider,
          feedId: entry.feedId ?? entry.feed_id,
          timestamp: entry.timestamp,
        });
      }
    }
    return prices;
  }
}

/**
 * Default Adrena Data API client instance.
 */
export const adrenaDataApi = new AdrenaDataApiClient();
