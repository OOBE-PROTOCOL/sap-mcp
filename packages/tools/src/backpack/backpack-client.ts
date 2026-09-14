/**
 * @name tools/backpack/backpack-client
 * @description Typed REST client for Backpack Exchange public and signed
 *   endpoints. Signing follows the documented Ed25519 header scheme
 *   (X-Timestamp, X-Window, X-API-Key, X-Signature) with the instruction
 *   prefixed to an alphabetically ordered parameter string. Response
 *   compaction mirrors the Phoenix gateway caps so large upstream payloads
 *   never reach an MCP client verbatim.
 *
 * @module tools/backpack/backpack-client
 */

import { createPrivateKey, createPublicKey, sign as ed25519SignBuffer } from 'node:crypto';
import { Transaction, VersionedTransaction } from '@solana/web3.js';

/** Default Backpack REST base URL. */
export const BACKPACK_API_BASE_URL = 'https://api.backpack.exchange';

/** Default signing window in milliseconds (docs default). */
export const DEFAULT_WINDOW_MS = 5000;

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Maximum characters of a compacted response. */
const MAX_RESPONSE_CHARS = 30_000;

/** Maximum entries kept in a compacted array before a remainder marker. */
const MAX_ARRAY_ENTRIES = 50;

/** Maximum characters kept from a single string value. */
const MAX_STRING_CHARS = 500;

/**
 * @name BackpackApiError
 * @description Typed error surfaced for every non-2xx upstream response.
 *   `code` carries the upstream JSON error code or a derived label for
 *   plain-text bodies (e.g. 'not_found').
 */
export class BackpackApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(`Backpack API ${status} [${code}]: ${message}`);
    this.name = 'BackpackApiError';
    this.status = status;
    this.code = code;
  }
}

/** Upstream Backpack REST API paths (verified against docs.backpack.exchange). */
export const BACKPACK_PATHS = {
  markets: '/api/v1/markets',
  market: '/api/v1/market',
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
  marketHolidays: '/api/v1/market-holidays',
  borrowLendMarkets: '/api/v1/borrowLend/markets',
  status: '/api/v1/status',
  ping: '/api/v1/ping',
  time: '/api/v1/time',
  capital: '/api/v1/capital',
  order: '/api/v1/order',
  orders: '/api/v1/orders',
  fills: '/api/v1/fills',
  depositAddress: '/api/v1/deposit/address',
  maxOrderQuantity: '/api/v1/maxOrderQuantity',
  withdrawal: '/api/v1/capital/withdrawal',
} as const;

/** Valid Backpack kline intervals (upstream is lowercase except monthly 1M). */
export const KLINE_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'] as const;
export type BackpackKlineInterval = (typeof KLINE_INTERVALS)[number];

/** Ed25519 credentials used for signed Backpack endpoints. */
export interface BackpackApiKey {
  /** Base64-encoded 32-byte Ed25519 verifying key (sent as X-API-Key). */
  readonly publicKeyB64: string;
  /** Base64-encoded 32-byte Ed25519 private seed (never leaves this process). */
  readonly secretSeedB64: string;
}

/** Options accepted by the BackpackApiClient constructor. */
export interface BackpackClientOptions {
  readonly baseUrl?: string;
  readonly apiKey?: BackpackApiKey;
  readonly windowMs?: number;
}

/** Order body accepted by POST /api/v1/order (orderExecute). */
export interface BackpackOrderBody {
  readonly symbol: string;
  readonly side: 'Bid' | 'Ask';
  readonly orderType: 'Market' | 'Limit' | 'IOC' | 'PostOnly' | 'ReduceOnly' | 'Scale' | 'TWAP';
  readonly quantity: string;
  readonly price?: string;
  readonly clientOrderId?: string;
  readonly postOnly?: boolean;
  readonly timeInForce?: string;
  readonly stopPrice?: string;
  readonly triggerCondition?: string;
  readonly selfTradePreventionMode?: string;
}

/** Withdrawal body accepted by the withdraw instruction. */
export interface BackpackWithdrawalBody {
  readonly address: string;
  readonly blockchain: string;
  readonly symbol: string;
  readonly quantity: string;
  readonly clientOrderId?: string;
}

/**
 * @name buildSigningString
 * @description Builds the exact Backpack signing string:
 *   `instruction=<type>&<params alphabetically>&timestamp=<ms>&window=<ms>`.
 *   Null/undefined params are omitted. With no params the string contains
 *   only instruction, timestamp, and window.
 */
export function buildSigningString(
  instruction: string,
  params: Record<string, string | number | boolean | undefined | null>,
  timestampMs: number,
  windowMs: number,
): string {
  const parts: string[] = [`instruction=${instruction}`];
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    parts.push(`${key}=${value}`);
  }
  parts.push(`timestamp=${timestampMs}`);
  parts.push(`window=${windowMs}`);
  return parts.join('&');
}

/**
 * @name deriveBackpackPublicKeyB64
 * @description Derives the base64 32-byte verifying key from a base64 seed.
 */
export function deriveBackpackPublicKeyB64(secretSeedB64: string): string {
  const pub = createPublicKey(privateKeyFromSeed(secretSeedB64));
  const exported = pub.export({ type: 'spki', format: 'der' }) as Buffer;
  return exported.subarray(exported.length - 32).toString('base64');
}

/** Builds an Ed25519 private key object from a base64 raw seed. */
function privateKeyFromSeed(secretSeedB64: string): ReturnType<typeof createPrivateKey> {
  return createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      Buffer.from(secretSeedB64, 'base64'),
    ]),
    format: 'der',
    type: 'pkcs8',
  });
}

/**
 * @name signBackpackMessage
 * @description Signs a UTF-8 message with an Ed25519 seed (base64) and
 *   returns the base64 64-byte signature.
 */
export function signBackpackMessage(message: string, secretSeedB64: string): string {
  return ed25519SignBuffer(null, Buffer.from(message, 'utf8'), privateKeyFromSeed(secretSeedB64)).toString('base64');
}

/**
 * True only when the string genuinely deserializes as a Solana transaction
 * (legacy or v0). Mirrors the Phoenix gateway acceptance bar so transaction
 * strings are never destroyed by compaction.
 */
function isDeserializableTransaction(value: string): boolean {
  if (value.length < 100 || value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length < 64) return false;
  try {
    VersionedTransaction.deserialize(decoded);
    return true;
  } catch {
    try {
      Transaction.from(decoded);
      return true;
    } catch {
      return false;
    }
  }
}

/** JSON size measurement that tolerates BigInt values (stringified like compactValue does). */
function safeJsonSize(payload: unknown): number {
  try {
    return JSON.stringify(payload, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * @name compactBackpackResponse
 * @description Caps upstream payloads: arrays at 50 entries (with a remainder
 *   marker), strings at 500 chars (real Solana transactions preserved),
 *   BigInts as strings, and a 30k total character cap with _truncated
 *   markers. Never mutates the input.
 */
export function compactBackpackResponse(payload: unknown): unknown {
  // Measure the upstream size BEFORE compaction: the 30k cap exists to keep
  // huge upstream payloads from reaching clients, so it must trigger on the
  // original size even when per-field compaction shrinks the copy below it.
  const upstreamSize = safeJsonSize(payload);
  const compacted = compactValue(payload, 0);
  if (compacted && typeof compacted === 'object' && !Array.isArray(compacted)) {
    if (upstreamSize > MAX_RESPONSE_CHARS) {
      return {
        ...(compacted as Record<string, unknown>),
        _truncated: true,
        _originalSize: upstreamSize,
        _note: `Upstream response was ${upstreamSize.toLocaleString('en-US')} chars (capped at ${MAX_RESPONSE_CHARS.toLocaleString('en-US')}). Use targeted filters or per-symbol reads instead of repeating this call.`,
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
    const compacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      compacted[k] = compactValue(v, depth + 1);
    }
    return compacted;
  }
  return value;
}

type QueryParams = Record<string, string | number | boolean | undefined | null>;

/**
 * @name BackpackApiClient
 * @description REST client for Backpack Exchange. Public methods require no
 *   credentials; signed methods require an API key and throw a structured
 *   `backpack_credentials_required` error (no network call) otherwise.
 */
export class BackpackApiClient {
  private readonly baseUrl: string;
  private readonly apiKey?: BackpackApiKey;
  private readonly windowMs: number;

  constructor(options: BackpackClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? BACKPACK_API_BASE_URL;
    this.apiKey = options.apiKey;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  }

  /** True when signed endpoints can be used. */
  hasCredentials(): boolean {
    return this.apiKey !== undefined;
  }

  private buildUrl(path: string, query?: QueryParams): string {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const entries = Object.entries(query).filter(([, v]) => v !== undefined && v !== null);
      if (entries.length > 0) {
        const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
        url += `?${qs}`;
      }
    }
    return url;
  }

  private async requestText(url: string, init?: RequestInit): Promise<{ status: number; text: string }> {
    const response = await fetch(url, {
      ...init,
      headers: { 'User-Agent': 'sap-mcp-backpack/1.0', ...(init?.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    return { status: response.status, text };
  }

  private async getJson<T>(path: string, query?: QueryParams): Promise<T> {
    const { status, text } = await this.requestText(this.buildUrl(path, query), { method: 'GET' });
    if (status >= 400) throw parseUpstreamError(status, text);
    try {
      return JSON.parse(text) as T;
    } catch {
      // Plain-text bodies (e.g. 'pong') are returned verbatim.
      return text as unknown as T;
    }
  }

  private requireCredentials(): BackpackApiKey {
    if (!this.apiKey) {
      throw Object.assign(new Error('backpack_credentials_required: create an API key at https://backpack.exchange/settings/api-keys and add it to the local SAP MCP profile config (config.backpack.apiKeys). Hosted agents can still use all public market-data tools.'), {
        code: 'backpack_credentials_required',
      });
    }
    return this.apiKey;
  }

  private async signedRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    instruction: string,
    params: Record<string, string | number | boolean | undefined | null>,
    body?: unknown,
  ): Promise<T> {
    const key = this.requireCredentials();
    const timestampMs = Date.now();
    const signingString = buildSigningString(instruction, params, timestampMs, this.windowMs);
    const signature = signBackpackMessage(signingString, key.secretSeedB64);
    const headers: Record<string, string> = {
      'X-Timestamp': String(timestampMs),
      'X-Window': String(this.windowMs),
      'X-API-Key': key.publicKeyB64,
      'X-Signature': signature,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const { status, text } = await this.requestText(this.buildUrl(path, method === 'GET' ? params : undefined), {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (status >= 400) throw parseUpstreamError(status, text);
    if (text.length === 0) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  // ─── Public (unauthenticated) endpoints ────────────────────────────────

  /** Lists all markets, optionally filtered by SPOT|PERP. */
  async getMarkets(marketType?: 'SPOT' | 'PERP'): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.markets, marketType ? { marketType } : undefined);
  }

  /** Returns a single market by symbol via the markets endpoint + client filter. */
  async getMarket(symbol: string): Promise<unknown> {
    const markets = await this.getMarkets();
    if (Array.isArray(markets)) {
      const match = markets.find((m) => (m as { symbol?: string }).symbol === symbol);
      if (match) return match;
    }
    throw new BackpackApiError(404, 'market_not_found', `No Backpack market for symbol ${symbol}`);
  }

  /** Returns the 24h ticker for one symbol. */
  async getTicker(symbol: string): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.ticker, { symbol });
  }

  /** Returns 24h tickers for every market. */
  async getTickers(): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.tickers);
  }

  /** Returns the order book (bids/asks) for a symbol. */
  async getDepth(symbol: string, limit?: number): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.depth, limit ? { symbol, limit } : { symbol });
  }

  /** Returns recent public trades. */
  async getTrades(symbol: string, limit?: number): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.trades, limit ? { symbol, limit } : { symbol });
  }

  /** Returns klines; startTime/endTime are epoch SECONDS upstream. */
  async getKlines(symbol: string, interval: BackpackKlineInterval, startTimeSec: number, endTimeSec: number): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.klines, { symbol, interval, startTime: startTimeSec, endTime: endTimeSec });
  }

  /** Returns mark/index price and funding rate for a perp symbol. */
  async getMarkPrices(symbol: string): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.markPrices, { symbol });
  }

  /** Returns funding interval rates for a perp symbol. */
  async getFundingRates(symbol: string): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.fundingRates, { symbol });
  }

  /** Returns open interest in contracts. */
  async getOpenInterest(symbol: string): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.openInterest, { symbol });
  }

  /** Returns collateral haircut/IMF/MMF parameters per asset. */
  async getCollateral(): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.collateral);
  }

  /** Returns all assets with deposit/withdraw metadata (large — compact before display). */
  async getAssets(): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.assets);
  }

  /** Returns tokenized securities with sessions and quantity limits. */
  async getSecurities(): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.securities);
  }

  /** Returns stock market session hours. */
  async getMarketSessions(): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.marketSessions);
  }

  /** Returns market holidays and shortened sessions. */
  async getMarketHolidays(): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.marketHolidays);
  }

  /** Returns borrow/lend markets with rates and utilization. */
  async getBorrowLendMarkets(): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.borrowLendMarkets);
  }

  /** Returns system status. */
  async getStatus(): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.status);
  }

  /** Pings the API (plain 'pong'). */
  async getPing(): Promise<string> {
    const { status, text } = await this.requestText(this.buildUrl(BACKPACK_PATHS.ping), { method: 'GET' });
    if (status >= 400) throw parseUpstreamError(status, text);
    return text;
  }

  /** Returns the server time in epoch milliseconds. */
  async getServerTime(): Promise<unknown> {
    return this.getJson<unknown>(BACKPACK_PATHS.time);
  }

  // ─── Signed endpoints ──────────────────────────────────────────────────

  /** Account balances (instruction balanceQuery). */
  async getBalances(): Promise<unknown> {
    return this.signedRequest('GET', BACKPACK_PATHS.capital, 'balanceQuery', {});
  }

  /** Open orders (instruction orderQueryAll). */
  async getOpenOrders(symbol?: string): Promise<unknown> {
    return this.signedRequest('GET', BACKPACK_PATHS.orders, 'orderQueryAll', symbol ? { symbol } : {});
  }

  /** Order history (instruction orderHistoryQueryAll). */
  async getOrderHistory(symbol?: string, limit?: number): Promise<unknown> {
    return this.signedRequest('GET', BACKPACK_PATHS.orders + '/history', 'orderHistoryQueryAll', {
      ...(symbol ? { symbol } : {}),
      ...(limit ? { limit } : {}),
    });
  }

  /** Fill history (instruction fillHistoryQueryAll). */
  async getFills(symbol?: string, limit?: number): Promise<unknown> {
    return this.signedRequest('GET', BACKPACK_PATHS.fills, 'fillHistoryQueryAll', {
      ...(symbol ? { symbol } : {}),
      ...(limit ? { limit } : {}),
    });
  }

  /** Maximum order quantity preflight (instruction maxOrderQuantity). */
  async getMaxOrderQuantity(symbol: string, side: 'Bid' | 'Ask', price?: string, leverage?: string): Promise<unknown> {
    return this.signedRequest('GET', BACKPACK_PATHS.maxOrderQuantity, 'maxOrderQuantity', {
      symbol,
      side,
      ...(price ? { price } : {}),
      ...(leverage ? { leverage } : {}),
    });
  }

  /** Executes an order (instruction orderExecute). */
  async executeOrder(body: BackpackOrderBody): Promise<unknown> {
    const params: Record<string, string | number | boolean | undefined | null> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null) params[k] = v as string | number | boolean;
    }
    return this.signedRequest('POST', BACKPACK_PATHS.order, 'orderExecute', params, body);
  }

  /** Executes a batch of orders (instruction orderExecute per order). */
  async executeOrderBatch(orders: readonly BackpackOrderBody[]): Promise<unknown> {
    // Batch signing: concatenated per-order query strings, each prefixed with
    // the instruction, then timestamp/window appended once (docs batch format).
    const key = this.requireCredentials();
    const timestampMs = Date.now();
    const perOrder = orders.map((order) => {
      const params: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(order)) {
        if (v !== undefined && v !== null) params[k] = v as string | number | boolean;
      }
      return buildSigningString('orderExecute', params, timestampMs, this.windowMs);
    });
    const signature = signBackpackMessage(perOrder.join('&'), key.secretSeedB64);
    const headers: Record<string, string> = {
      'X-Timestamp': String(timestampMs),
      'X-Window': String(this.windowMs),
      'X-API-Key': key.publicKeyB64,
      'X-Signature': signature,
      'Content-Type': 'application/json',
    };
    const { status, text } = await this.requestText(this.buildUrl(BACKPACK_PATHS.orders), {
      method: 'POST',
      headers,
      body: JSON.stringify(orders),
    });
    if (status >= 400) throw parseUpstreamError(status, text);
    return text.length === 0 ? undefined : (JSON.parse(text) as unknown);
  }

  /** Cancels one order (instruction orderCancel). */
  async cancelOrder(symbol: string, orderId: string): Promise<unknown> {
    return this.signedRequest('DELETE', BACKPACK_PATHS.order, 'orderCancel', { orderId, symbol }, { orderId, symbol });
  }

  /** Cancels all open orders, optionally per symbol (orderCancelAll). */
  async cancelAllOrders(symbol?: string): Promise<unknown> {
    const body = symbol ? { symbol } : {};
    return this.signedRequest('DELETE', BACKPACK_PATHS.orders, 'orderCancelAll', symbol ? { symbol } : {}, body);
  }

  /** Deposit address for an asset (instruction depositAddressQuery). */
  async getDepositAddress(asset: string): Promise<unknown> {
    return this.signedRequest('GET', BACKPACK_PATHS.depositAddress, 'depositAddressQuery', { asset });
  }

  /** Requests a withdrawal (instruction withdraw). Requires explicit confirmation upstream. */
  async requestWithdrawal(body: BackpackWithdrawalBody): Promise<unknown> {
    const params: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null) params[k] = v as string | number | boolean;
    }
    return this.signedRequest('POST', BACKPACK_PATHS.withdrawal, 'withdraw', params, body);
  }
}

/** Parses upstream error bodies (JSON envelope or plain text) into BackpackApiError. */
function parseUpstreamError(status: number, text: string): BackpackApiError {
  const trimmed = text.trim();
  let code = status === 404 ? 'not_found' : `http_${status}`;
  let message = trimmed.slice(0, 400) || `HTTP ${status}`;
  try {
    const parsed = JSON.parse(trimmed) as { code?: unknown; message?: unknown; error?: { code?: unknown; message?: unknown } };
    const candidates = [parsed.code, parsed.error?.code].filter((v): v is string => typeof v === 'string' && v.length > 0);
    const messages = [parsed.message, parsed.error?.message].filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (candidates.length > 0) code = candidates[0];
    if (messages.length > 0) message = messages[0];
  } catch {
    // Plain-text body — keep the raw slice.
  }
  return new BackpackApiError(status, code, message);
}