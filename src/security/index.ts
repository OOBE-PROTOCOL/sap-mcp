/**
 * @name security/index
 * @description Barrel export for the SAP MCP security module.
 *
 * Re-exports tool permission checks, approval threshold logic, unsafe action
 * guards, private key guards, and prompt injection prevention notes.
 *
 * @module security/index
 */

export { checkToolPermissions, getRequiredPermission, getToolsForPermission, getPermissionMappedTools, isWriteOperation } from './tool-permissions.js';
export { isApprovalRequired } from './approval-required.js';
export { unsafeActionGuard } from './unsafe-action-guard.js';
export { privateKeyGuard } from './private-key-guard.js';
export { promptInjectionNotes } from './prompt-injection-notes.js';
