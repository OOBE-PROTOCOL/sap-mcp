/**
 * Session permissions management
 */

import type { SapPermission } from '../core/types.js';

/**
 * All available permissions
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
 * Permission categories
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
 * Check if permission is valid
 */
export function isValidPermission(permission: string): boolean {
  return ALL_PERMISSIONS.includes(permission as SapPermission);
}

/**
 * Get permissions by category
 */
export function getPermissionsByCategory(category: keyof typeof PERMISSION_CATEGORIES): SapPermission[] {
  return [...PERMISSION_CATEGORIES[category]];
}

/**
 * Check if permission is write permission
 */
export function isWritePermission(permission: SapPermission): boolean {
  return permission.endsWith(':write');
}

/**
 * Get read-only version of permission
 */
export function toReadPermission(permission: SapPermission): SapPermission {
  return permission.replace(':write', ':read') as SapPermission;
}
