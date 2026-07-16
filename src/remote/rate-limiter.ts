/**
 * @name RemoteRateLimiter
 * @description Per-client rolling-window limiter for hosted MCP traffic with optional Redis backing.
 */

import { Redis } from 'ioredis';
import { logger } from '../core/logger.js';

/**
 * @name RemoteRateLimitConfig
 * @description Runtime configuration for hosted MCP rate limiting.
 */
export interface RemoteRateLimitConfig {
  enabled: boolean;
  requestsPerMinute: number;
  redisUrl?: string;
  keyPrefix: string;
}

/**
 * @name RemoteRateLimitDecision
 * @description Result of a remote rate-limit check.
 */
export interface RemoteRateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

interface LocalRateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_SECONDS = 60;
const WINDOW_MS = WINDOW_SECONDS * 1000;

/**
 * @name RemoteRateLimiter
 * @description Shared Redis-backed limiter when configured, with an in-memory fallback for single-process deployments.
 */
export class RemoteRateLimiter {
  private readonly config: RemoteRateLimitConfig;
  private readonly localEntries = new Map<string, LocalRateLimitEntry>();
  private readonly redis?: InstanceType<typeof Redis>;
  private readonly cleanupInterval?: NodeJS.Timeout;

  public constructor(config: RemoteRateLimitConfig) {
    this.config = config;
    if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
      });
      this.redis.on('error', (error: Error) => {
        logger.warn('Remote rate limiter Redis error', { error });
      });
      return;
    }

    this.cleanupInterval = setInterval(() => this.cleanupLocal(), WINDOW_MS);
    this.cleanupInterval.unref?.();
  }

  /**
   * @name initialize
   * @description Establishes the optional Redis connection before accepting traffic.
   */
  public async initialize(): Promise<void> {
    if (!this.redis) {
      return;
    }
    await this.redis.connect();
    logger.info('Remote rate limiter using Redis backend');
  }

  /**
   * @name check
   * @description Checks and increments the rolling counter for a caller key.
   */
  public async check(clientKey: string): Promise<RemoteRateLimitDecision> {
    if (!this.config.enabled || this.config.requestsPerMinute <= 0) {
      return {
        allowed: true,
        limit: Number.POSITIVE_INFINITY,
        remaining: Number.POSITIVE_INFINITY,
        resetSeconds: WINDOW_SECONDS,
      };
    }

    if (this.redis) {
      return this.checkRedis(clientKey);
    }

    return this.checkLocal(clientKey);
  }

  /**
   * @name close
   * @description Closes the optional Redis connection.
   */
  public async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    await this.redis?.quit();
  }

  private async checkRedis(clientKey: string): Promise<RemoteRateLimitDecision> {
    const key = `${this.config.keyPrefix}${clientKey}`;
    const count = await this.redis?.incr(key) ?? 1;
    if (count === 1) {
      await this.redis?.expire(key, WINDOW_SECONDS);
    }
    const ttl = await this.redis?.ttl(key) ?? WINDOW_SECONDS;
    const remaining = Math.max(0, this.config.requestsPerMinute - count);

    return {
      allowed: count <= this.config.requestsPerMinute,
      limit: this.config.requestsPerMinute,
      remaining,
      resetSeconds: ttl > 0 ? ttl : WINDOW_SECONDS,
    };
  }

  private checkLocal(clientKey: string): RemoteRateLimitDecision {
    const now = Date.now();
    const existing = this.localEntries.get(clientKey);
    const entry = existing && now < existing.resetAt
      ? existing
      : { count: 0, resetAt: now + WINDOW_MS };
    entry.count += 1;
    this.localEntries.set(clientKey, entry);

    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    const remaining = Math.max(0, this.config.requestsPerMinute - entry.count);

    return {
      allowed: entry.count <= this.config.requestsPerMinute,
      limit: this.config.requestsPerMinute,
      remaining,
      resetSeconds,
    };
  }

  private cleanupLocal(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.localEntries.entries()) {
      if (entry.resetAt <= now) {
        this.localEntries.delete(key);
        cleaned += 1;
      }
    }
    if (cleaned > 0) {
      logger.debug('Remote rate limiter local cleanup', {
        cleaned,
        activeKeys: this.localEntries.size,
      });
    }
  }
}

/**
 * @name buildRemoteRateLimitConfigFromEnv
 * @description Resolves hosted MCP rate-limit settings from environment variables.
 */
export function buildRemoteRateLimitConfigFromEnv(defaultPerMinute: number): RemoteRateLimitConfig {
  const enabled = parseBoolean(process.env.SAP_MCP_REMOTE_RATE_LIMIT_ENABLED, true);
  const useRedis = parseBoolean(process.env.SAP_MCP_USE_REDIS, false);
  const redisUrl = process.env.SAP_MCP_REDIS_URL;
  return {
    enabled,
    requestsPerMinute: parsePositiveInteger(
      process.env.SAP_MCP_REMOTE_RATE_LIMIT_PER_MINUTE,
      defaultPerMinute,
    ),
    redisUrl: useRedis ? redisUrl || 'redis://127.0.0.1:6379' : undefined,
    keyPrefix: process.env.SAP_MCP_REMOTE_RATE_LIMIT_PREFIX || 'sap-mcp:remote:rate:',
  };
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
