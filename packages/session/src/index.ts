/**
 * @name session/index
 * @description Barrel export for the SAP MCP session module.
 *
 * Re-exports agent session lifecycle, delegated session, session store, permissions,
 * spending limits, and session type definitions.
 *
 * @module session/index
 */

export { createAgentSession, isSessionActive, hasPermission } from './agent-session.js';
export { sessionStore } from './session-store.js';
export type {
  CreateSessionRequest,
  SessionValidationResult,
  SessionUpdate,
} from './session-types.js';
export { createDelegatedSession, validateDelegatedSession } from './delegated-session.js';
export {
  ALL_PERMISSIONS,
  PERMISSION_CATEGORIES,
  isValidPermission,
  getPermissionsByCategory,
  isWritePermission,
  toReadPermission,
} from './session-permissions.js';
export {
  checkSpendingLimit,
  deductFromSession,
  resetDailyLimits,
} from './session-limits.js';