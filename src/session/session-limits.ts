/**
 * @name session/session-limits
 * @description Session spending limit management — per-transaction checks, balance deduction, and daily resets.
 *
 * @flow
 *   1. `checkSpendingLimit` validates a transaction amount against per-transaction and remaining session limits.
 *   2. `deductFromSession` subtracts a spent amount from the session's remaining balance.
 *   3. `resetDailyLimits` resets the session's remaining balance to the maximum per-session limit.
 *
 * @module session/session-limits
 */

import { logger } from '../core/logger.js';
import type { SapAgentSession, SapSpendingLimits } from '../core/types.js';

/**
 * @name checkSpendingLimit
 * @description Checks whether a transaction amount is within the session's spending limits.
 *
 * @param session   — The agent session to check against.
 * @param amountSol — The transaction amount in SOL to validate.
 * @returns `{ allowed: true }` if within limits; `{ allowed: false, reason }` with an explanation otherwise.
 *
 * @usedBy Tool handlers across the SAP MCP runtime.
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
 * @name deductFromSession
 * @description Deducts a spent amount from the session's remaining SOL balance and returns the updated limits.
 *
 * @param session   — The agent session to deduct from.
 * @param amountSol — The amount in SOL to deduct.
 * @returns A new `SapSpendingLimits` object with the updated `remainingSessionSol`.
 *
 * @usedBy Tool handlers across the SAP MCP runtime.
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
 * @name resetDailyLimits
 * @description Resets the session's remaining SOL balance to the maximum per-session limit.
 *
 * Called periodically to reset daily spending counters. In production, a separate
 * daily counter stored in Redis/DB would be reset here.
 *
 * @param session — The agent session whose limits to reset.
 *
 * @usedBy Scheduled limit reset tasks in the SAP MCP runtime.
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