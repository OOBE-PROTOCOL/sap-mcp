/**
 * @name session/delegated-session
 * @description Delegated session management — creates and validates sessions that delegate
 * agent capabilities to an MCP client with policy-enforced permissions.
 *
 * @flow
 *   1. `createDelegatedSession` validates requested permissions against the policy engine,
 *      then creates a new agent session via `createAgentSession`.
 *   2. `validateDelegatedSession` checks expiry, permission, and spending limits for an
 *      existing session before allowing a delegated action.
 *
 * @module session/delegated-session
 */

import { logger } from '../../core/src/logger.js';
import { PolicyError } from '../../core/src/errors.js';
import type { SapAgentSession, SapMcpContext, SapPermission } from '../../core/src/types.js';
import { createAgentSession } from './agent-session.js';

/**
 * @name createDelegatedSession
 * @description Creates a delegated agent session with policy-validated permissions and spending limits.
 *
 * @param context        — SAP MCP runtime context with policy engine.
 * @param agentId        — Unique identifier for the delegating agent.
 * @param permissions    — Array of permission strings to validate and grant.
 * @param spendingLimits — Spending limits for per-transaction, per-day, and per-session SOL amounts.
 * @returns A `SapAgentSession` with validated permissions and configured spending limits.
 * @throws `PolicyError` if the requested permissions fail policy validation.
 *
 * @usedBy Delegated session MCP tools in the SAP MCP runtime.
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
 * @name validateDelegatedSession
 * @description Validates an existing delegated session for a given permission and optional SOL amount.
 *
 * @param session    — The agent session to validate.
 * @param permission — The permission required for the action.
 * @param amountSol  — Optional SOL amount to check against remaining session balance.
 * @returns `{ valid: true }` if all checks pass; `{ valid: false, error }` with a reason otherwise.
 *
 * @usedBy Delegated session MCP tools in the SAP MCP runtime.
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