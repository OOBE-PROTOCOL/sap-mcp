/**
 * @name McpSessionCache
 * @description Client-side MCP session cache for x402 paid calls.
 *
 * The x402 paid-call client otherwise creates a new MCP session on every call.
 * Reusing a short-lived initialized session reduces round trips without caching
 * live on-chain data, payment challenges, or signed payment payloads.
 *
 * Cache entries are scoped per endpoint and process. They do not persist across
 * restarts and are invalidated when a runtime reports session_not_found.
 */

interface CachedSession {
  sessionId: string;
  createdAt: number;
  lastUsedAt: number;
}

const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSIONS = 8;

const sessionCache = new Map<string, CachedSession>();

/**
 * Get a cached session for an endpoint, or null if expired/missing.
 */
export function getCachedSession(endpoint: string): string | null {
  const normalized = normalizeEndpoint(endpoint);
  const cached = sessionCache.get(normalized);
  if (!cached) {
    return null;
  }

  const age = Date.now() - cached.createdAt;
  if (age > SESSION_TTL_MS) {
    sessionCache.delete(normalized);
    return null;
  }

  // Update last-used for LRU eviction
  cached.lastUsedAt = Date.now();
  return cached.sessionId;
}

/**
 * Store a session in the cache. If the cache is full, evict the least-recently-used entry.
 */
export function cacheSession(endpoint: string, sessionId: string): void {
  const normalized = normalizeEndpoint(endpoint);

  // Evict LRU if at capacity
  if (sessionCache.size >= MAX_SESSIONS && !sessionCache.has(normalized)) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, session] of sessionCache.entries()) {
      if (session.lastUsedAt < oldestTime) {
        oldestTime = session.lastUsedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      sessionCache.delete(oldestKey);
    }
  }

  sessionCache.set(normalized, {
    sessionId,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
}

/**
 * Invalidate a cached session (e.g. when the server returns 404 session_not_found).
 */
export function invalidateSession(endpoint: string): void {
  sessionCache.delete(normalizeEndpoint(endpoint));
}

/**
 * Clear all cached sessions.
 */
export function clearSessionCache(): void {
  sessionCache.clear();
}

/**
 * Get cache stats for diagnostics.
 */
export function getSessionCacheStats(): { size: number; endpoints: string[] } {
  return {
    size: sessionCache.size,
    endpoints: Array.from(sessionCache.keys()),
  };
}

function normalizeEndpoint(endpoint: string): string {
  // Strip trailing slash for consistent cache keys
  return endpoint.replace(/\/+$/, '');
}
