/**
 * Session spending limits management
 */

import { logger } from '../core/logger.js';
import type { SapAgentSession, SapSpendingLimits } from '../core/types.js';

/**
 * Check if transaction is within limits
 */
export function checkSpendingLimit(
  session: SapAgentSession,
  amountSol: number
): { allowed: boolean; reason?: string } {
  const limits = session.spendingLimits;
  
  // Check per-transaction limit
  if (amountSol > limits.maxPerTransactionSol) {
    return {
      allowed: false,
      reason: `Amount ${amountSol} SOL exceeds per-transaction limit ${limits.maxPerTransactionSol} SOL`,
    };
  }
  
  // Check remaining session balance
  if (amountSol > limits.remainingSessionSol) {
    return {
      allowed: false,
      reason: `Amount ${amountSol} SOL exceeds remaining session balance ${limits.remainingSessionSol} SOL`,
    };
  }
  
  return { allowed: true };
}

/**
 * Deduct amount from session balance
 */
export function deductFromSession(
  session: SapAgentSession,
  amountSol: number
): SapSpendingLimits {
  const newLimits = {
    ...session.spendingLimits,
    remainingSessionSol: session.spendingLimits.remainingSessionSol - amountSol,
  };
  
  logger.debug('Deducted from session', {
    sessionId: session.sessionId,
    amountSol,
    remainingSol: newLimits.remainingSessionSol,
  });
  
  return newLimits;
}

/**
 * Reset daily limits (called periodically)
 */
export function resetDailyLimits(session: SapAgentSession): void {
  // Reset daily spending counter (if tracked separately)
  // For now, we only track session-level limits
  // In production, this would reset a separate daily counter stored in Redis/DB
  
  session.spendingLimits.remainingSessionSol = session.spendingLimits.maxPerSessionSol;
  
  logger.info('Daily limits reset', {
    sessionId: session.sessionId,
    maxPerDaySol: session.spendingLimits.maxPerDaySol,
    maxPerSessionSol: session.spendingLimits.maxPerSessionSol,
  });
}
