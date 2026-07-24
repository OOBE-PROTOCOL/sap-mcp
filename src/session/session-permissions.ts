/**
 * @name session/session-permissions
 * @description Session permission definitions, categories, and utility functions for the SAP MCP runtime.
 *
 * Defines the full set of permissions, groups them by category, and provides
 * helpers for validation, category lookups, and read/write classification.
 *
 * @flow
 *   1. `ALL_PERMISSIONS` defines the canonical list of allowed permission strings.
 *   2. `PERMISSION_CATEGORIES` groups permissions by domain (registry, identity, payments, etc.).
 *   3. Utility functions (`isValidPermission`, `getPermissionsByCategory`, `isWritePermission`,
 *      `toReadPermission`) are used by session creation and validation logic.
 *
 * @module session/session-permissions
 */

import type { SapPermission } from '../core/types.js';

/**
 * @name ALL_PERMISSIONS
 * @description The canonical list of all permissions recognized by the SAP MCP runtime.
 *
 * @usedBy `isValidPermission`, `agent-session.ts`, `delegated-session.ts`
 */
export const ALL_PERMISSIONS: SapPermission[] = [
  'registry:read',
  'registry:write',
  'identity:read',
  'identity:write',
  'reputation:read',
  'reputation:write',
  'payments:read',
  'payments:write',
  'settlement:read',
  'settlement:write',
  'memory:read',
  'memory:write',
  'transaction:submit',
];

/**
 * @name PERMISSION_CATEGORIES
 * @description Permission groups keyed by domain category.
 *
 * @property registry     — Registry read/write permissions.
 * @property identity     — Identity read/write permissions.
 * @property reputation   — Reputation read/write permissions.
 * @property payments     — Payments read/write permissions.
 * @property settlement   — Settlement read/write permissions.
 * @property memory       — Memory read/write permissions.
 * @property transaction  — Transaction submission permission.
 *
 * @usedBy `getPermissionsByCategory`, permission UI in the TUI wizard.
 */
export const PERMISSION_CATEGORIES = {
  registry: ['registry:read', 'registry:write'],
  identity: ['identity:read', 'identity:write'],
  reputation: ['reputation:read', 'reputation:write'],
  payments: ['payments:read', 'payments:write'],
  settlement: ['settlement:read', 'settlement:write'],
  memory: ['memory:read', 'memory:write'],
  transaction: ['transaction:submit'],
} as const satisfies Record<string, readonly SapPermission[]>;

/**
 * @name isValidPermission
 * @description Checks whether a permission string is in the canonical `ALL_PERMISSIONS` list.
 *
 * @param permission — Permission string to validate.
 * @returns `true` if the permission is recognized, `false` otherwise.
 *
 * @usedBy `agent-session.ts:createAgentSession`, `core/guards.ts`
 */
export function isValidPermission(permission: string): boolean {
  return ALL_PERMISSIONS.includes(permission as SapPermission);
}

/**
 * @name getPermissionsByCategory
 * @description Returns all permissions belonging to a specific category.
 *
 * @param category — Category key from `PERMISSION_CATEGORIES`.
 * @returns Array of permissions in the specified category.
 *
 * @usedBy Permission UI and session creation logic.
 */
export function getPermissionsByCategory(category: keyof typeof PERMISSION_CATEGORIES): SapPermission[] {
  return [...PERMISSION_CATEGORIES[category]];
}

/**
 * @name isWritePermission
 * @description Checks whether a permission is a write-level permission (ends with `:write`).
 *
 * @param permission — Permission string to check.
 * @returns `true` if the permission grants write access, `false` otherwise.
 *
 * @usedBy Session validation and policy enforcement.
 */
export function isWritePermission(permission: SapPermission): boolean {
  return permission.endsWith(':write');
}

/**
 * @name toReadPermission
 * @description Converts a write permission to its read-only counterpart by replacing `:write` with `:read`.
 *
 * @param permission — Permission string to convert.
 * @returns The read-only version of the permission.
 *
 * @usedBy Session downgrade logic and read-only mode enforcement.
 */
export function toReadPermission(permission: SapPermission): SapPermission {
  return permission.replace(':write', ':read') as SapPermission;
}