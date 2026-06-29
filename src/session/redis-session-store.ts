/**
 * Redis-backed session store for production deployments
 * 
 * Features:
 * - Persistent sessions across server restarts
 * - Multi-instance support (distributed deployments)
 * - Automatic TTL-based expiration
 * - Memory-safe (no local storage)
 * 
 * Usage:
 * ```typescript
 * const store = new RedisSessionStore('redis://localhost:6379');
 * await store.set('session-123', session);
 * const session = await store.get('session-123');
 * ```
 */

import { Redis } from 'ioredis';
import { logger } from '../core/logger.js';
import type { SapAgentSession } from '../core/types.js';

/**
 * Contract describing redis session store config data used by the SAP MCP runtime.
 */
export interface RedisSessionStoreConfig {
  redisUrl: string;
  keyPrefix?: string;
  cleanupIntervalMs?: number;
}

const DEFAULT_CONFIG: RedisSessionStoreConfig = {
  redisUrl: 'redis://localhost:6379',
  keyPrefix: 'sap-mcp:session:',
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

/**
 * Runtime service that implements redis session store behavior.
 */
export class RedisSessionStore {
  private redis: InstanceType<typeof Redis>;
  private keyPrefix: string;
  private cleanupInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

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
   * Connect to Redis
   */
  async connect(): Promise<void> {
    await this.redis.connect();
    logger.info('Redis session store initialized');
  }

  /**
   * Store a session with TTL
   */
  async set(sessionId: string, session: SapAgentSession): Promise<void> {
    const key = this.getKey(sessionId);
    const ttl = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
    
    await this.redis.setex(key, ttl, JSON.stringify(session));
    logger.debug('Session stored in Redis', { sessionId, ttl });
  }

  /**
   * Get a session
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
   * Delete a session
   */
  async delete(sessionId: string): Promise<boolean> {
    const key = this.getKey(sessionId);
    const result = await this.redis.del(key);
    logger.debug('Session deleted from Redis', { sessionId, deleted: result > 0 });
    return result > 0;
  }

  /**
   * Get all active sessions (for debugging/admin)
   */
  async getAll(): Promise<SapAgentSession[]> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
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
   * Get session count
   */
  async getCount(): Promise<number> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
    return keys.length;
  }

  /**
   * Clean up expired sessions (manual trigger)
   */
  async cleanup(): Promise<void> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
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
   * Get session statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
  }> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
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
   * Graceful shutdown
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
   * Get Redis client (for advanced operations)
   */
  getClient(): InstanceType<typeof Redis> {
    return this.redis;
  }

  private getKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

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
 * Create session store with environment-based configuration
 * 
 * Uses Redis in production, in-memory in development
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
