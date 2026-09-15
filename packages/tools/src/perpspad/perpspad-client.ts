/**
 * @name tools/perpspad/perpspad-client
 * @description Typed REST client for the PerpsPad permissionless launchpad
 *   (https://perpspad.fun). Every coin is backed by a live leveraged perp
 *   position; launching returns unsigned config + pool transactions that the
 *   caller signs and sends with their own wallet. No API key — the wallet is
 *   the identity. All shapes verified against the live API on 2026-09-14.
 *
 * @module tools/perpspad/perpspad-client
 */

/** Default PerpsPad API base URL (public, no auth). */
export const PERPSPAD_API_BASE_URL = 'https://perpspad.fun';

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Maximum entries kept in a compacted array. */
const MAX_ARRAY_ENTRIES = 50;

/** Maximum characters kept from a single string value. */
const MAX_STRING_CHARS = 500;

/** Ticker format enforced upstream: A–Z and 0–9 only. */
const TICKER_PATTERN = /^[A-Z0-9]+$/;

/** Direction of the backing perp position. */
export type PerpspadDirection = 'long' | 'short';

/** Dev-buy bounds per quote token (verified from the OpenAPI description). */
export const DEV_BUY_BOUNDS: Readonly<Record<string, { readonly min: number; readonly max: number }>> = {
  SOL: { min: 0.1, max: 5 },
  USDC: { min: 5, max: 5000 },
};

/** Supported stats include subsets (comma-separated upstream). */
export const STATS_INCLUDE_KINDS = ['kpis', 'distributions', 'series', 'leaderboards'] as const;

/** Supported token event kinds. */
export const TOKEN_EVENT_KINDS = ['buyback', 'external_buyback', 'burn', 'claim', 'creator_fee'] as const;

/** Backing perp market as returned by GET /api/v1/markets. */
export interface PerpspadMarket {
  readonly symbol: string;
  readonly minLeverage: number;
  readonly maxLeverage: number;
}

/** Launched token as returned by GET /api/v1/tokens. */
export interface PerpspadToken {
  readonly id: string;
  readonly ticker: string;
  readonly name: string;
  readonly description: string | null;
  readonly image_url: string | null;
  readonly mint_address: string | null;
  readonly dbc_pool_address: string | null;
  readonly dlmm_pool_address: string | null;
  readonly clmm_pool_address: string | null;
  readonly graduated_pool_address: string | null;
  readonly migration_status: string | null;
  readonly underlying: string | null;
  readonly leverage: number | null;
  readonly direction: string | null;
  readonly quote_token: string | null;
  readonly quote_mint: string | null;
  readonly quote_decimals: number | null;
  readonly sol_raised: number | null;
  readonly source: string | null;
  readonly external_mint: string | null;
  readonly external_platform: string | null;
  readonly created_at: string;
  readonly twitter_url: string | null;
  readonly website_url: string | null;
}

/** Two-leg basket backing. */
export interface PerpspadLeg {
  readonly underlying: string;
  readonly leverage: number;
  readonly direction: 'long' | 'short';
}

/** Launch request body for POST /api/v1/launch. */
export interface PerpspadLaunchBody {
  readonly ticker: string;
  readonly name: string;
  readonly creatorAddress: string;
  readonly devBuy: number;
  readonly underlying?: string;
  readonly leverage?: number;
  readonly direction?: 'long' | 'short';
  readonly legs?: readonly PerpspadLeg[];
  readonly quote?: 'SOL' | 'USDC' | 'CUSTOM';
  readonly quoteMint?: string;
  readonly quoteDecimals?: number;
  readonly imageUrl?: string;
  readonly websiteUrl?: string;
  readonly twitterUrl?: string;
}

/** Unsigned launch transactions returned by POST /api/v1/launch. */
export interface PerpspadLaunchUnsigned {
  readonly config?: string;
  readonly pool?: string;
  readonly [key: string]: unknown;
}

/**
 * @name PerpspadApiError
 * @description Typed error for non-2xx responses and `{ok:false}` envelopes.
 */
export class PerpspadApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(`PerpsPad API ${status} [${code}]: ${message}`);
    this.name = 'PerpspadApiError';
    this.status = status;
    this.code = code;
  }
}

/** Validates the launch body against the verified upstream contract. */
export function validateLaunchBody(
  body: PerpspadLaunchBody,
  markets: readonly PerpspadMarket[],
): void {
  if (!body.ticker || !TICKER_PATTERN.test(body.ticker)) {
    throw new Error('invalid_ticker: ticker must be A-Z 0-9 only (e.g. MOON)');
  }
  if (!body.name || body.name.trim().length === 0) {
    throw new Error('invalid_name: name is required');
  }
  if (!body.creatorAddress || body.creatorAddress.trim().length < 32) {
    throw new Error('invalid_creatorAddress: creatorAddress must be a Solana wallet address (signer, payer, dev-buy recipient)');
  }
  const quote = body.quote ?? 'SOL';
  const bounds = DEV_BUY_BOUNDS[quote];
  if (bounds) {
    if (typeof body.devBuy !== 'number' || !Number.isFinite(body.devBuy) || body.devBuy < bounds.min || body.devBuy > bounds.max) {
      throw new Error(`invalid_devBuy: devBuy for ${quote} must be between ${bounds.min} and ${bounds.max} ${quote}`);
    }
  }
  const hasSingle = body.underlying !== undefined && body.leverage !== undefined && body.direction !== undefined;
  const hasLegs = Array.isArray(body.legs) && body.legs.length > 0;
  if (!hasSingle && !hasLegs) {
    throw new Error('invalid_backing: provide underlying+leverage+direction OR legs (2-element basket)');
  }
  if (hasSingle) {
    const market = markets.find((m) => m.symbol === body.underlying);
    if (!market) {
      throw new Error(`unknown_underlying: '${body.underlying}' is not a supported perp market. Call sap_perpspad_get_markets for the supported list.`);
    }
    if (typeof body.leverage !== 'number' || body.leverage < market.minLeverage || body.leverage > market.maxLeverage) {
      throw new Error(`invalid_leverage: leverage for ${body.underlying} must be between ${market.minLeverage} and ${market.maxLeverage}`);
    }
    if (body.direction !== 'long' && body.direction !== 'short') {
      throw new Error("invalid_direction: direction must be 'long' or 'short'");
    }
  }
  if (hasLegs) {
    if (body.legs.length !== 2) {
      throw new Error('invalid_legs: baskets must have exactly 2 legs');
    }
    for (const leg of body.legs) {
      const market = markets.find((m) => m.symbol === leg.underlying);
      if (!market) {
        throw new Error(`unknown_underlying: leg '${leg.underlying}' is not a supported perp market`);
      }
      if (typeof leg.leverage !== 'number' || leg.leverage < market.minLeverage || leg.leverage > market.maxLeverage) {
        throw new Error(`invalid_leverage: leg ${leg.underlying} leverage must be between ${market.minLeverage} and ${market.maxLeverage}`);
      }
      if (leg.direction !== 'long' && leg.direction !== 'short') {
        throw new Error("invalid_direction: leg direction must be 'long' or 'short'");
      }
    }
  }
  if (body.quote === 'CUSTOM' && !body.quoteMint) {
    throw new Error('invalid_quoteMint: quote CUSTOM requires quoteMint (the SPL mint to pair against)');
  }
}

/**
 * True only when the string genuinely deserializes as a Solana transaction —
 * preserved byte-for-byte by compaction.
 */
function isDeserializableTransaction(value: string): boolean {
  if (value.length < 100 || value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length < 64) return false;
  return true;
}

/** JSON size measurement tolerant of BigInt values. */
function safeJsonSize(payload: unknown): number {
  try {
    return JSON.stringify(payload, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Caps upstream payloads (50-entry arrays, 500-char strings, 30k total). */
export function compactPerpspadResponse(payload: unknown): unknown {
  const upstreamSize = safeJsonSize(payload);
  const compacted = compactValue(payload, 0);
  if (compacted && typeof compacted === 'object' && !Array.isArray(compacted)) {
    if (upstreamSize > 30_000) {
      return {
        ...(compacted as Record<string, unknown>),
        _truncated: true,
        _originalSize: upstreamSize,
        _note: `Response capped at 30,000 chars (upstream ${upstreamSize.toLocaleString('en-US')} chars). Use filters (sort, limit, kind) instead of repeating this call.`,
      };
    }
    return compacted;
  }
  return compacted;
}

function compactValue(value: unknown, depth: number): unknown {
  if (depth > 5) return '[max depth reached]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (isDeserializableTransaction(value)) return value;
    return value.length > MAX_STRING_CHARS ? `${value.slice(0, MAX_STRING_CHARS)}… (+${value.length - MAX_STRING_CHARS} chars)` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ENTRIES) {
      return [
        ...value.slice(0, MAX_ARRAY_ENTRIES).map((v) => compactValue(v, depth + 1)),
        `[+${value.length - MAX_ARRAY_ENTRIES} more entries]`,
      ];
    }
    return value.map((v) => compactValue(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = compactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

function parseUpstreamError(status: number, text: string): PerpspadApiError {
  try {
    const parsed = JSON.parse(text) as { ok?: boolean; error?: unknown; message?: unknown };
    if (parsed.ok === false) {
      const message = typeof parsed.error === 'string' ? parsed.error : typeof parsed.message === 'string' ? parsed.message : text.slice(0, 300);
      return new PerpspadApiError(status, 'upstream_rejected', message);
    }
  } catch {
    // plain text
  }
  return new PerpspadApiError(status, status === 404 ? 'not_found' : `http_${status}`, text.slice(0, 400) || `HTTP ${status}`);
}

/**
 * @name PerpspadApiClient
 * @description REST client for the PerpsPad launchpad: markets, tokens,
 *   events, stats, stock pairs, launch status, and launch builders.
 */
export class PerpspadApiClient {
  private readonly baseUrl: string;

  constructor(options: { readonly baseUrl?: string } = {}) {
    this.baseUrl = options.baseUrl ?? PERPSPAD_API_BASE_URL;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'User-Agent': 'sap-mcp-perpspad/1.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (response.status >= 400) throw parseUpstreamError(response.status, text);
    return JSON.parse(text) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'sap-mcp-perpspad/1.0' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (response.status >= 400) throw parseUpstreamError(response.status, text);
    return JSON.parse(text) as T;
  }

  /** Lists supported underlying perp markets with leverage caps. */
  async getMarkets(): Promise<readonly PerpspadMarket[]> {
    const parsed = await this.get<{ ok: boolean; data: { markets: PerpspadMarket[] } }>('/api/v1/markets');
    return parsed.data.markets;
  }

  /** Lists launched tokens. */
  async getTokens(options: { readonly sort?: 'newest' | 'oldest' | 'raised'; readonly limit?: number; readonly offset?: number } = {}): Promise<readonly PerpspadToken[]> {
    const params = new URLSearchParams();
    if (options.sort) params.set('sort', options.sort);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const qs = params.toString();
    const parsed = await this.get<{ ok: boolean; data: { tokens: PerpspadToken[] } }>(`/api/v1/tokens${qs ? `?${qs}` : ''}`);
    return parsed.data.tokens;
  }

  /** Fetches one token by UUID or mint address. */
  async getToken(id: string): Promise<PerpspadToken> {
    const parsed = await this.get<{ ok: boolean; data: PerpspadToken | { token: PerpspadToken } }>(`/api/v1/tokens/${encodeURIComponent(id)}`);
    const data = parsed.data as PerpspadToken & { token?: PerpspadToken };
    return ('token' in data && data.token ? data.token : data) as PerpspadToken;
  }

  /** Fetches buyback/burn/fee events for one token. */
  async getTokenEvents(id: string, options: { readonly kind?: string; readonly limit?: number; readonly offset?: number } = {}): Promise<unknown> {
    const params = new URLSearchParams();
    if (options.kind) params.set('kind', options.kind);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const qs = params.toString();
    const parsed = await this.get<{ ok: boolean; data: unknown }>(`/api/v1/tokens/${encodeURIComponent(id)}/events${qs ? `?${qs}` : ''}`);
    return parsed.data;
  }

  /** Fetches launch status by token id (poll until 'live'). */
  async getLaunchStatus(tokenId: string): Promise<unknown> {
    const parsed = await this.get<{ ok: boolean; data: unknown }>(`/api/v1/launch/${encodeURIComponent(tokenId)}`);
    return parsed.data;
  }

  /** Lists pairable stock mints for stock-paired launches. */
  async getStockPairs(): Promise<unknown> {
    const parsed = await this.get<{ ok: boolean; data: unknown }>('/api/v1/launch/stock/pairs');
    return parsed.data;
  }

  /** Fetches platform-wide stats (kpis/distributions/series/leaderboards). */
  async getStats(include?: string): Promise<unknown> {
    const parsed = await this.get<{ ok: boolean; data: unknown }>(`/api/v1/stats${include ? `?include=${encodeURIComponent(include)}` : ''}`);
    return parsed.data;
  }

  /**
   * Requests the unsigned launch transactions (config + pool). Does NOT
   * broadcast anything — the caller signs and sends both txs from their own
   * wallet, then polls the launch status until 'live'.
   */
  async buildLaunch(body: PerpspadLaunchBody): Promise<PerpspadLaunchUnsigned> {
    const markets = await this.getMarkets();
    validateLaunchBody(body, markets);
    const parsed = await this.post<{ ok: boolean; data: PerpspadLaunchUnsigned }>('/api/v1/launch', body);
    return parsed.data;
  }

  /** Prepares a stock-paired launch (returns payloads to sign). */
  async prepareStockLaunch(body: {
    readonly creatorWallet: string;
    readonly stockMint: string;
    readonly name: string;
    readonly symbol: string;
    readonly underlying?: string;
    readonly leverage?: number;
    readonly direction?: 'long' | 'short';
    readonly legs?: readonly PerpspadLeg[];
    readonly marketCapUsd?: number;
  }): Promise<unknown> {
    const parsed = await this.post<{ ok: boolean; data: unknown }>('/api/v1/launch/stock/prepare', body);
    return parsed.data;
  }

  /** Submits signed stock-paired launch transactions. */
  async submitStockLaunch(signedQuote: string, signedTransaction: string): Promise<unknown> {
    const parsed = await this.post<{ ok: boolean; data: unknown }>('/api/v1/launch/stock/submit', {
      signedQuote,
      signedTransaction,
    });
    return parsed.data;
  }
}