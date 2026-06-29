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

import { logger } from '../core/logger.js';
import type { SapAgentSession } from '../core/types.js';

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

// Cleanup every hour
setInterval(() => store.cleanup(), 60 * 60 * 1000);

export { store as sessionStore };
