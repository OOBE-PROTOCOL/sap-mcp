/**
 * @name session/session-types
 * @description Type definitions for session creation requests, validation results, and session updates.
 *
 * @flow
 *   1. `CreateSessionRequest` is used by session creation MCP tools.
 *   2. `SessionValidationResult` is returned by session validation functions.
 *   3. `SessionUpdate` is used by session mutation operations.
 *
 * @module session/session-types
 */

import type { SapAgentSession, SapPermission } from '@oobe-protocol-labs/sap-mcp-core/types';

/**
 * @name CreateSessionRequest
 * @description Request payload for creating a new agent session.
 *
 * @property agentId          — Unique identifier for the agent.
 * @property permissions      — Array of permissions to grant the session.
 * @property spendingLimits   — Spending limits for per-transaction, per-day, and per-session SOL amounts.
 * @property expiresInSeconds — Optional session validity duration in seconds.
 *
 * @usedBy Session creation MCP tools, `session/index.ts`
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
 * @name SessionValidationResult
 * @description Result of validating a session for a requested action.
 *
 * @property valid   — Whether the session passed validation.
 * @property session — The validated session object (present when valid).
 * @property error   — Error explanation (present when invalid).
 *
 * @usedBy Session validation functions, `session/index.ts`
 */
export interface SessionValidationResult {
  valid: boolean;
  session?: SapAgentSession;
  error?: string;
}

/**
 * @name SessionUpdate
 * @description Partial update payload for modifying an existing session.
 *
 * @property remainingSessionSol — Optional new remaining session balance in SOL.
 * @property permissions         — Optional new array of permissions.
 *
 * @usedBy Session mutation MCP tools, `session/index.ts`
 */
export interface SessionUpdate {
  remainingSessionSol?: number;
  permissions?: SapPermission[];
}