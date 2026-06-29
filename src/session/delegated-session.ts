/**
 * Delegated session management
 */

import { logger } from '../core/logger.js';
import { PolicyError } from '../core/errors.js';
import type { SapAgentSession, SapMcpContext, SapPermission } from '../core/types.js';
import { createAgentSession } from './agent-session.js';

/**
 * Create a delegated session
 */
export async function createDelegatedSession(
  context: SapMcpContext,
  agentId: string,
  permissions: string[],
  spendingLimits: {
    maxPerTransactionSol: number;
    maxPerDaySol: number;
    maxPerSessionSol: number;
  }
): Promise<SapAgentSession> {
  logger.info('Creating delegated session', { agentId, permissions });
  
  // Validate permissions against policy
  const validatedPermissions = await context.policyEngine.validatePermissions(
    permissions
  );
  
  if (!validatedPermissions.valid) {
    throw new PolicyError('Invalid permissions', { errors: validatedPermissions.errors });
  }
  
  // Create session
  const session = createAgentSession({
    agentId,
    permissions: validatedPermissions.permissions,
    spendingLimits,
  });
  
  logger.info('Delegated session created', { sessionId: session.sessionId });
  
  return session;
}

/**
 * Validate delegated session
 */
export function validateDelegatedSession(
  session: SapAgentSession,
  permission: SapPermission,
  amountSol?: number
): { valid: boolean; error?: string } {
  // Check if session is active
  const now = Date.now();
  if (now >= session.expiresAt) {
    return { valid: false, error: 'Session expired' };
  }
  
  // Check permission
  if (!session.permissions.includes(permission)) {
    return { valid: false, error: `Missing permission: ${permission}` };
  }
  
  // Check spending limit
  if (amountSol !== undefined) {
    if (amountSol > session.spendingLimits.remainingSessionSol) {
      return { valid: false, error: 'Insufficient session balance' };
    }
  }
  
  return { valid: true };
}
