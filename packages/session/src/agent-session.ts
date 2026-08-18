/**
 * @name session/agent-session
 * @description Agent session lifecycle management — creation, activation checks, and permission checks.
 *
 * @flow
 *   1. `createAgentSession` generates a new session with a UUID, filtered permissions,
 *      spending limits, and a 24-hour expiry.
 *   2. `isSessionActive` checks whether a session is still within its expiry and budget.
 *   3. `hasPermission` checks whether a session holds a specific permission.
 *
 * @module session/agent-session
 */

import type { SapAgentSession, SapPermission } from '../../core/src/types.js';
import { isValidPermission } from '../../core/src/guards.js';

/**
 * @name createAgentSession
 * @description Creates a new agent session with a unique id, filtered permissions, spending limits, and 24-hour expiry.
 *
 * @param data.agentId        — Unique identifier for the agent.
 * @param data.permissions    — Array of permission strings (invalid ones are filtered out).
 * @param data.spendingLimits — Spending limits for per-transaction, per-day, and per-session SOL amounts.
 * @returns A `SapAgentSession` object with a generated `sessionId`, filtered permissions,
 *          remaining session balance set to `maxPerSessionSol`, and 24-hour expiry.
 *
 * @usedBy `delegated-session.ts:createDelegatedSession`.
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
 * @name isSessionActive
 * @description Checks whether a session is still active (not expired and has remaining budget).
 *
 * @param session — The agent session to check.
 * @returns `true` if the current time is before `expiresAt` and `remainingSessionSol > 0`, `false` otherwise.
 *
 * @usedBy Session validation across the SAP MCP runtime.
 */
export function isSessionActive(session: SapAgentSession): boolean {
  const now = Date.now();
  return now < session.expiresAt && session.spendingLimits.remainingSessionSol > 0;
}

/**
 * @name hasPermission
 * @description Checks whether a session holds a specific permission.
 *
 * @param session    — The agent session to check.
 * @param permission — The permission string to verify.
 * @returns `true` if the session's permissions array includes the given permission, `false` otherwise.
 *
 * @usedBy Session validation across the SAP MCP runtime.
 */
export function hasPermission(session: SapAgentSession, permission: SapPermission): boolean {
  return session.permissions.includes(permission);
}