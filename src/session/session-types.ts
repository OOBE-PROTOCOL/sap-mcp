/**
 * Session type definitions
 */

import type { SapAgentSession, SapPermission } from '../core/types.js';

/**
 * Session creation request
 */
export interface CreateSessionRequest {
  agentId: string;
  permissions: SapPermission[];
  spendingLimits: {
    maxPerTransactionSol: number;
    maxPerDaySol: number;
    maxPerSessionSol: number;
  };
  expiresInSeconds?: number;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  session?: SapAgentSession;
  error?: string;
}

/**
 * Session update
 */
export interface SessionUpdate {
  remainingSessionSol?: number;
  permissions?: SapPermission[];
}
