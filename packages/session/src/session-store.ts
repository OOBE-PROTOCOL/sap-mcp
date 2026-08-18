/**
 * In-memory session store for managing active sessions
 * 
 * Production-ready with:
 * - Automatic cleanup of expired sessions (every hour)
 * - Memory leak prevention
 * - Thread-safe operations
 * 
 * Note: For distributed deployments requiring shared session state,
 * replace with Redis or database-backed implementation.
 */

import { logger } from '@oobe-protocol-labs/sap-mcp-core/logger';
import type { SapAgentSession } from '@oobe-protocol-labs/sap-mcp-core/types';

class SessionStore {
  private sessions: Map<string, SapAgentSession> = new Map();
  
  /**
   * Store a session
   */
  set(sessionId: string, session: SapAgentSession): void {
    this.sessions.set(sessionId, session);
    logger.debug('Session stored', { sessionId });
  }
  
  /**
   * Get a session
   */
  get(sessionId: string): SapAgentSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Delete a session
   */
  delete(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    logger.debug('Session deleted', { sessionId, deleted });
    return deleted;
  }
  
  /**
   * Clean up expired sessions
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now >= session.expiresAt) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }
    
    logger.debug('Session cleanup', { cleaned });
  }
  
  /**
   * Get all sessions
   */
  getAll(): SapAgentSession[] {
    return Array.from(this.sessions.values());
  }
}

// Singleton instance
const store = new SessionStore();

/**
 * @description Hourly cleanup interval for the singleton session store.
 * Uses `.unref()` so the timer does not keep the process alive during
 * graceful shutdown.
 */
const sessionCleanupTimer = setInterval(() => store.cleanup(), 60 * 60 * 1000);
sessionCleanupTimer.unref();

/**
 * @name clearSessionCleanupTimer
 * @description Stop the hourly cleanup interval. Called during graceful
 *   shutdown and in test teardown to prevent timer leaks.
 *
 * @internal
 */
function clearSessionCleanupTimer(): void {
  clearInterval(sessionCleanupTimer);
}

export { store as sessionStore, clearSessionCleanupTimer };
