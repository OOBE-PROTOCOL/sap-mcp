/**
 * Agent session management
 */

import type { SapAgentSession, SapPermission } from '../core/types.js';
import { isValidPermission } from '../core/guards.js';

/**
 * Create a new agent session
 */
export function createAgentSession(data: {
  agentId: string;
  permissions: string[];
  spendingLimits: {
    maxPerTransactionSol: number;
    maxPerDaySol: number;
    maxPerSessionSol: number;
  };
}): SapAgentSession {
  const now = Date.now();
  
  return {
    sessionId: crypto.randomUUID(),
    agentId: data.agentId,
    permissions: data.permissions.filter(isValidPermission),
    spendingLimits: {
      ...data.spendingLimits,
      remainingSessionSol: data.spendingLimits.maxPerSessionSol,
    },
    expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
    createdAt: now,
  };
}

/**
 * Validate session is still active
 */
export function isSessionActive(session: SapAgentSession): boolean {
  const now = Date.now();
  return now < session.expiresAt && session.spendingLimits.remainingSessionSol > 0;
}

/**
 * Check if session has permission
 */
export function hasPermission(session: SapAgentSession, permission: SapPermission): boolean {
  return session.permissions.includes(permission);
}
