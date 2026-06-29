/**
 * Session module barrel export
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
