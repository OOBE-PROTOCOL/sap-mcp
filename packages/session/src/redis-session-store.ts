/**
 * @name session/redis-session-store
 * @description Redis-backed persistent session store for production SAP MCP deployments.
 *
 * Features:
 * - Persistent sessions across server restarts
 * - Multi-instance support (distributed deployments)
 * - Automatic TTL-based expiration
 * - Memory-safe (no local storage)
 *
 * @flow
 *   1. `createSessionStore` checks `SAP_MCP_USE_REDIS` env var and creates a `RedisSessionStore`
 *      or returns `null` for in-memory development mode.
 *   2. `RedisSessionStore` manages session CRUD with automatic TTL based on session expiry.
 *   3. A background cleanup interval removes expired sessions periodically.
 *
 * @env `SAP_MCP_USE_REDIS` — Set to `true` to enable Redis session storage.
 * @env `SAP_MCP_REDIS_URL` — Redis connection URL (default `redis://localhost:6379`).
 *
 * @module session/redis-session-store
 */

import { Redis } from 'ioredis';
import { logger } from '../../core/src/logger.js';
import type { SapAgentSession } from '../../core/src/types.js';

/**
 * @name RedisSessionStoreConfig
 * @description Configuration for the Redis-backed session store.
 *
 * @property redisUrl          — Redis connection URL.
 * @property keyPrefix         — Optional prefix for session keys in Redis (default `sap-mcp:session:`).
 * @property cleanupIntervalMs — Optional cleanup interval in milliseconds (default 3600000 / 1 hour).
 *
 * @usedBy `RedisSessionStore`, `createSessionStore`
 */
export interface RedisSessionStoreConfig {
  redisUrl: string;
  keyPrefix?: string;
  cleanupIntervalMs?: number;
}

/** @description Default configuration values merged with user-provided config. */
const DEFAULT_CONFIG: RedisSessionStoreConfig = {
  redisUrl: 'redis://localhost:6379',
  keyPrefix: 'sap-mcp:session:',
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

/**
 * @name RedisSessionStore
 * @description Persistent session store backed by Redis with TTL-based expiration and periodic cleanup.
 *
 * @method connect   — Establish the Redis connection.
 * @method set        — Store a session with TTL derived from its expiry.
 * @method get        — Retrieve a session by id.
 * @method delete     — Remove a session by id.
 * @method getAll     — Retrieve all active sessions (for debugging/admin).
 * @method getCount   — Get the total number of stored sessions.
 * @method cleanup    — Manually remove expired sessions.
 * @method getStats   — Get session statistics (total, active, expired).
 * @method shutdown   — Gracefully close the Redis connection and cleanup interval.
 * @method getClient  — Get the raw Redis client for advanced operations.
 *
 * @usedBy `createSessionStore`, distributed SAP MCP deployments.
 */
export class RedisSessionStore {
  private redis: InstanceType<typeof Redis>;
  private keyPrefix: string;
  private cleanupInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  /**
   * @name RedisSessionStore.constructor
   * @description Creates a new Redis session store with merged config and starts the cleanup interval.
   *
   * @param config — Optional configuration overriding defaults.
   */
  constructor(config: RedisSessionStoreConfig = DEFAULT_CONFIG) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    this.redis = new Redis(finalConfig.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    this.keyPrefix = finalConfig.keyPrefix!;

    this.redis.on('error', (error: Error) => {
      logger.error('Redis connection error', { error: error.message });
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected');
    });

    // Start cleanup interval
    this.startCleanup(finalConfig.cleanupIntervalMs!);
  }

  /**
   * @name RedisSessionStore.connect
   * @description Connects to the Redis server.
   *
   * @usedBy `createSessionStore`.
   */
  async connect(): Promise<void> {
    await this.redis.connect();
    logger.info('Redis session store initialized');
  }

  /**
   * @name RedisSessionStore.set
   * @description Stores a session in Redis with a TTL derived from its expiry timestamp.
   *
   * @param sessionId — Unique session identifier.
   * @param session   — The agent session to store.
   */
  async set(sessionId: string, session: SapAgentSession): Promise<void> {
    const key = this.getKey(sessionId);
    const ttl = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
    
    await this.redis.setex(key, ttl, JSON.stringify(session));
    logger.debug('Session stored in Redis', { sessionId, ttl });
  }

  /**
   * @name RedisSessionStore.get
   * @description Retrieves a session by id from Redis.
   *
   * @param sessionId — Unique session identifier.
   * @returns The session if found and parseable, `null` otherwise.
   */
  async get(sessionId: string): Promise<SapAgentSession | null> {
    const key = this.getKey(sessionId);
    const data = await this.redis.get(key);
    
    if (!data) {
      return null;
    }

    try {
      const session = JSON.parse(data) as SapAgentSession;
      return session;
    } catch (error) {
      logger.error('Failed to parse session data', { sessionId, error });
      return null;
    }
  }

  /**
   * @name RedisSessionStore.delete
   * @description Deletes a session from Redis by id.
   *
   * @param sessionId — Unique session identifier.
   * @returns `true` if the session was deleted, `false` if it did not exist.
   */
  async delete(sessionId: string): Promise<boolean> {
    const key = this.getKey(sessionId);
    const result = await this.redis.del(key);
    logger.debug('Session deleted from Redis', { sessionId, deleted: result > 0 });
    return result > 0;
  }

  /**
   * @name RedisSessionStore.getAll
   * @description Retrieves all active sessions from Redis (for debugging/admin).
   *
   * @returns Array of all stored agent sessions.
   */
  /**
   * @name RedisSessionStore.scanKeys
   * @description Iterates session keys with `SCAN` instead of `KEYS` to avoid
   *   blocking Redis on large key spaces. `KEYS` is O(N) and can stall a
   *   production instance; `SCAN` is incremental and safe under load.
   *
   * @returns The full list of session keys matching the store prefix.
   */
  private async scanKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.keyPrefix}*`,
        'COUNT',
        100
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }

  async getAll(): Promise<SapAgentSession[]> {
    const keys = await this.scanKeys();
    const sessions: SapAgentSession[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        try {
          sessions.push(JSON.parse(data) as SapAgentSession);
        } catch (error) {
          logger.warn('Failed to parse session in getAll', { key, error });
        }
      }
    }

    return sessions;
  }

  /**
   * @name RedisSessionStore.getCount
   * @description Returns the total number of stored sessions.
   *
   * @returns Count of session keys in Redis.
   */
  async getCount(): Promise<number> {
    const keys = await this.scanKeys();
    return keys.length;
  }

  /**
   * @name RedisSessionStore.cleanup
   * @description Manually removes expired sessions from Redis.
   */
  async cleanup(): Promise<void> {
    const keys = await this.scanKeys();
    let cleaned = 0;

    for (const key of keys) {
      const ttl = await this.redis.ttl(key);
      if (ttl <= 0) {
        await this.redis.del(key);
        cleaned++;
      }
    }

    logger.debug('Redis session cleanup', { cleaned });
  }

  /**
   * @name RedisSessionStore.getStats
   * @description Returns session statistics (total, active, expired).
   *
   * @returns Object with `totalSessions`, `activeSessions`, and `expiredSessions` counts.
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
  }> {
    const keys = await this.scanKeys();
    let active = 0;
    let expired = 0;
    const now = Date.now();

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        try {
          const session = JSON.parse(data) as SapAgentSession;
          if (session.expiresAt > now) {
            active++;
          } else {
            expired++;
          }
        } catch {
          expired++;
        }
      }
    }

    return {
      totalSessions: keys.length,
      activeSessions: active,
      expiredSessions: expired,
    };
  }

  /**
   * @name RedisSessionStore.shutdown
   * @description Gracefully shuts down the Redis connection and clears the cleanup interval.
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    await this.redis.quit();
    logger.info('Redis session store shut down');
  }

  /**
   * @name RedisSessionStore.getClient
   * @description Returns the raw Redis client instance for advanced operations.
   *
   * @returns The underlying `ioredis` Redis instance.
   */
  getClient(): InstanceType<typeof Redis> {
    return this.redis;
  }

  /** @description Builds the full Redis key from the prefix and session id. */
  private getKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  /** @description Starts the periodic cleanup interval for expired sessions. */
  private startCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(async () => {
      if (this.isShuttingDown) return;
      
      try {
        await this.cleanup();
      } catch (error) {
        logger.error('Session cleanup failed', { error });
      }
    }, intervalMs);
  }
}

/**
 * @name createSessionStore
 * @description Creates a session store based on environment configuration.
 *
 * Uses Redis in production (when `SAP_MCP_USE_REDIS=true`) and in-memory
 * storage in development (returns `null`).
 *
 * @returns A connected `RedisSessionStore` if Redis is enabled, `null` otherwise.
 * @throws If Redis connection fails after retries.
 *
 * @env `SAP_MCP_USE_REDIS` — Set to `true` to enable Redis.
 * @env `SAP_MCP_REDIS_URL` — Redis connection URL (default `redis://localhost:6379`).
 *
 * @usedBy Server initialization in the SAP MCP runtime.
 */
export async function createSessionStore(): Promise<RedisSessionStore | null> {
  const useRedis = process.env.SAP_MCP_USE_REDIS === 'true';
  
  if (!useRedis) {
    logger.info('Using in-memory session store (development mode)');
    return null;
  }

  const redisUrl = process.env.SAP_MCP_REDIS_URL || 'redis://localhost:6379';
  const store = new RedisSessionStore({ redisUrl });
  
  await store.connect();
  return store;
}