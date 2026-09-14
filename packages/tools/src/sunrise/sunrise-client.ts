/**
 * @name tools/sunrise/sunrise-client
 * @description Typed REST client for the public Sunrise swap API
 *   (https://api.sunrise.xyz). No authentication: the API is open and signing
 *   happens at the Solana transaction level in the user's wallet. Implements
 *   the token list, quote, and execute/poll state machine exactly as verified
 *   against the live API on 2026-09-14 (see profile skill `sunrise-protocol`).
 *
 * @module tools/sunrise/sunrise-client
 */

/** Default Sunrise API base URL (public, no auth, CORS enabled). */
export const SUNRISE_API_BASE_URL = 'https://api.sunrise.xyz';

/**
 * Core assets that are quotable on Sunrise but absent from `GET /v1/tokens`
 * (verified live). SOL is native and not wrapped through this list.
 */
export const SUNRISE_CORE_MINTS = {
  USDC: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
  USDT: { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, symbol: 'USDT' },
  WETH: { address: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', decimals: 8, symbol: 'WETH' },
  WBTC: { address: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', decimals: 8, symbol: 'WBTC' },
} as const;

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Base-unit amount format enforced by Sunrise quote/execute bodies. */
const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

/**
 * @name SunriseApiError
 * @description Typed error for every non-2xx Sunrise response, carrying the
 *   upstream error-envelope fields when available.
 */
export class SunriseApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(`Sunrise API ${status} [${code}]: ${message}`);
    this.name = 'SunriseApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** Sunrise token entry as returned by GET /v1/tokens. */
export interface SunriseToken {
  readonly chain: 'solana';
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly platform: string;
  readonly assetClass: 'stock' | 'crypto' | 'commodity';
  readonly issuer: string | null;
  readonly icon: string | null;
  readonly tokenProgram: string | null;
  readonly stock: { readonly ticker: string; readonly currency: string | null; readonly exchange: { readonly marketIdentifierCode: string; readonly name: string } | null } | null;
}

/** Quote request body. All amounts are STRINGS in base units. */
export interface SunriseQuoteBody {
  readonly fromToken: string;
  readonly toToken: string;
  readonly fromAmount: string;
  readonly fromAddress?: string;
  readonly toAddress?: string;
}

/** Quote entry returned by POST /v1/quotes. */
export interface SunriseQuote {
  readonly quoteId: string;
  readonly routeName: string;
  readonly fromToken: string;
  readonly toToken: string;
  readonly fromAmount: string;
  readonly toAmount: string;
  readonly fromAmountUSD?: number;
  readonly toAmountUSD?: number;
  readonly unsignedTransaction?: string;
  readonly providerRequestId?: string;
  readonly slippageBps?: number;
}

/** Execute body accepted by POST /v1/execute. */
export interface SunriseExecuteBody {
  readonly signedTransaction: string;
  readonly quoteId: string;
  readonly routeName: string;
  readonly providerRequestId?: string;
}

/** Execute response data — poll while SUBMITTED. */
export interface SunriseExecuteResult {
  readonly txHash: string;
  readonly status: 'CONFIRMED' | 'SUBMITTED';
}

/** Options for executeQuoteAndWait polling. */
export interface SunrisePollOptions {
  readonly maxAttempts?: number;
  readonly intervalMs?: number;
}

/** Options accepted by the SunriseApiClient constructor. */
export interface SunriseClientOptions {
  readonly baseUrl?: string;
}

/**
 * @name stripUnknownKeys
 * @description Returns a copy of the object containing only the listed keys.
 *   Sunrise POST bodies use `additionalProperties: false` upstream — extra
 *   fields are rejected outright, so clients must strip them.
 */
export function stripUnknownKeys<T extends object>(body: T, allowedKeys: readonly string[]): Partial<T> {
  const result: Partial<T> = {};
  for (const key of allowedKeys) {
    if (key in body && (body as Record<string, unknown>)[key] !== undefined) {
      (result as Record<string, unknown>)[key] = (body as Record<string, unknown>)[key];
    }
  }
  return result;
}

/**
 * @name assertBaseUnitAmount
 * @description Validates that an amount is a string of digits (optionally
 *   decimal) — Sunrise amounts are base-unit strings and numbers are
 *   rejected. Floats would silently lose precision, so they are refused.
 */
export function assertBaseUnitAmount(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !AMOUNT_PATTERN.test(value)) {
    throw new Error(
      `invalid_amount: ${fieldName} must be a string in token base units matching /^\\d+(\\.\\d+)?$/ (e.g. '1000000' for 1 USDC at 6 decimals). Numbers are rejected to avoid float precision loss.`,
    );
  }
  return value;
}

/** Error-envelope parser for Sunrise responses. */
function parseUpstreamError(status: number, text: string): SunriseApiError {
  try {
    const parsed = JSON.parse(text) as { error?: { code?: unknown; message?: unknown; requestId?: unknown } };
    const code = typeof parsed.error?.code === 'string' ? parsed.error.code : `http_${status}`;
    const message = typeof parsed.error?.message === 'string' ? parsed.error.message : text.slice(0, 400) || `HTTP ${status}`;
    const requestId = typeof parsed.error?.requestId === 'string' ? parsed.error.requestId : undefined;
    return new SunriseApiError(status, code, message, requestId);
  } catch {
    return new SunriseApiError(status, `http_${status}`, text.slice(0, 400) || `HTTP ${status}`);
  }
}

/**
 * @name SunriseApiClient
 * @description REST client for the Sunrise public swap API: token listing,
 *   quotes, and execute/poll.
 */
export class SunriseApiClient {
  private readonly baseUrl: string;

  constructor(options: SunriseClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? SUNRISE_API_BASE_URL;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'sap-mcp-sunrise/1.0' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (response.status >= 400) throw parseUpstreamError(response.status, text);
    return JSON.parse(text) as T;
  }

  /** Lists Sunrise-supported tokens (paginated). */
  async listTokens(options: { readonly cursor?: string; readonly limit?: number } = {}): Promise<{
    readonly count: number;
    readonly tokens: readonly SunriseToken[];
    readonly nextCursor: string | null;
  }> {
    const params = new URLSearchParams();
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    const response = await fetch(`${this.baseUrl}/v1/tokens${qs ? `?${qs}` : ''}`, {
      headers: { 'User-Agent': 'sap-mcp-sunrise/1.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (response.status >= 400) throw parseUpstreamError(response.status, text);
    const parsed = JSON.parse(text) as {
      success: boolean;
      data: { count: number; tokens: SunriseToken[]; pagination?: { nextCursor: string | null } };
    };
    return {
      count: parsed.data.count,
      tokens: parsed.data.tokens,
      nextCursor: parsed.data.pagination?.nextCursor ?? null,
    };
  }

  /** Fetches swap quotes. Wallet addresses are optional — with them the first quote carries an unsignedTransaction. */
  async getQuote(body: SunriseQuoteBody): Promise<readonly SunriseQuote[]> {
    const clean = stripUnknownKeys(body, ['fromToken', 'toToken', 'fromAmount', 'fromAddress', 'toAddress']);
    assertBaseUnitAmount(clean.fromAmount, 'fromAmount');
    const response = await this.post<{ success: boolean; data: { quotes: SunriseQuote[] } }>('/v1/quotes', clean);
    return response.data.quotes;
  }

  /**
   * Submits a signed transaction. The SAME body must be re-posted while the
   * status is 'SUBMITTED' — this endpoint doubles as the status poll.
   */
  async executeQuote(body: SunriseExecuteBody): Promise<{ readonly txHash: string; readonly status: 'CONFIRMED' | 'SUBMITTED' }> {
    const clean = stripUnknownKeys(body, ['signedTransaction', 'quoteId', 'routeName', 'providerRequestId']) as SunriseExecuteBody;
    const response = await this.post<{ success: boolean; data: { txHash: string; status: 'CONFIRMED' | 'SUBMITTED' } }>('/v1/execute', clean);
    return response.data;
  }

  /**
   * Executes and polls with the identical body until CONFIRMED. On timeout it
   * throws `sunrise_poll_timeout` with the duplicate-swap warning — callers
   * must check wallet activity before any retry.
   */
  async executeQuoteAndWait(
    body: SunriseExecuteBody,
    options: { readonly maxAttempts?: number; readonly intervalMs?: number } = {},
  ): Promise<{ readonly txHash: string; readonly status: 'CONFIRMED' | 'SUBMITTED' }> {
    const maxAttempts = options.maxAttempts ?? 20;
    const intervalMs = options.intervalMs ?? 3000;
    const clean = stripUnknownKeys(body, ['signedTransaction', 'quoteId', 'routeName', 'providerRequestId']) as SunriseExecuteBody;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.executeQuote(clean);
      if (result.status === 'CONFIRMED') return result;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    throw new Error(
      `sunrise_poll_timeout: execute did not reach CONFIRMED after ${maxAttempts} attempts. Do NOT blind-retry the swap — check the wallet activity for the transaction first (duplicate-swap risk), then re-call sap_sunrise_execute_quote with the IDENTICAL arguments.`,
    );
  }
}