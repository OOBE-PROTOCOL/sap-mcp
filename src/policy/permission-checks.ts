/**
 * Permission checks
 */

import type { SapPermission, SapMcpConfig } from '../core/types.js';

/**
 * Check if permission is allowed
 */
export function checkPermission(
  config: SapMcpConfig,
  permission: SapPermission
): { allowed: boolean; reason?: string } {
  // Check if allowed tools is 'all'
  if (config.allowedTools === 'all') {
    return { allowed: true };
  }
  
  // Check if permission is in allowed list
  if (config.allowedTools.includes(permission)) {
    return { allowed: true };
  }
  
  return {
    allowed: false,
    reason: `Permission ${permission} is not in allowed tools list`,
  };
}

/**
 * Check if tool is allowed
 */
export function checkToolAllowed(
  config: SapMcpConfig,
  toolName: string
): { allowed: boolean; reason?: string } {
  if (config.allowedTools === 'all') {
    return { allowed: true };
  }
  
  // Extract permission from tool name (e.g., sap_get_agent -> registry:read)
  const permission = toolNameToPermission(toolName);
  
  return checkPermission(config, permission);
}

/**
 * Map tool name to permission
 */
function toolNameToPermission(toolName: string): SapPermission {
  // Extract action from tool name (e.g., sap_get_agent -> get, sap_register_agent -> register)
  const actionMatch = toolName.match(/sap_(\w+)_/);
  const action = actionMatch ? actionMatch[1] : '';
  
  // Extract category from tool name (e.g., sap_registry_get -> registry)
  const categoryMatch = toolName.match(/sap_(\w+)-/);
  const category = categoryMatch ? categoryMatch[1] : '';
  
  // Map category to permission namespace
  const categoryMap: Record<string, string> = {
    'registry': 'registry',
    'identity': 'identity',
    'reputation': 'reputation',
    'payment': 'payments',
    'settlement': 'settlement',
    'memory': 'memory',
    'transaction': 'transaction',
    'tool': 'registry',
    'developer': 'registry',
    'execution': 'reputation',
  };
  
  const permissionCategory = categoryMap[category] || 'registry';
  const isWrite = ['register', 'update', 'create', 'write', 'submit', 'bridge', 'mint', 'prepare', 'verify', 'open', 'resolve', 'batch'].some(w => action.includes(w));
  const permissionType = isWrite ? 'write' : 'read';
  
  return `${permissionCategory}:${permissionType}` as SapPermission;
}
