/**
 * @name policy/permission-checks
 * @description Permission validation utilities for SAP MCP tool calls.
 *
 * Provides functions to check whether a given permission or tool name
 * is allowed by the server configuration's `allowedTools` list.
 *
 * @module policy/permission-checks
 */

import type { SapPermission, SapMcpConfig } from '../../core/src/types.js';

/**
 * @name checkPermission
 * @description Check if a specific permission is allowed by the configuration.
 *
 * When `allowedTools` is `'all'`, every permission is allowed. Otherwise the
 * permission must appear in the `allowedTools` array.
 *
 * @param config - The SAP MCP server configuration.
 * @param permission - The permission string to check.
 * @returns An object with `allowed` flag and optional `reason` string.
 *
 * @usedBy `checkToolAllowed`
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
 * @name checkToolAllowed
 * @description Check if a tool is allowed by mapping its name to a permission.
 *
 * Extracts the action and category from the tool name, maps them to a
 * `SapPermission` string, then delegates to `checkPermission`.
 *
 * @param config - The SAP MCP server configuration.
 * @param toolName - The tool name to check (e.g., `sap_get_agent`).
 * @returns An object with `allowed` flag and optional `reason` string.
 *
 * @usedBy `policy-engine.ts:PolicyEngine`
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
 * Extract the segment between a prefix and a delimiter using indexOf.
 * Avoids polynomial regex backtracking on uncontrolled input.
 */
function extractSegmentAfterPrefix(input: string, prefix: string, delimiter: string): string {
  if (!input.startsWith(prefix)) return '';
  const rest = input.slice(prefix.length);
  const delimIndex = rest.indexOf(delimiter);
  if (delimIndex <= 0) return '';
  return rest.slice(0, delimIndex);
}

/**
 * Map tool name to permission
 */
function toolNameToPermission(toolName: string): SapPermission {
  // Extract action from tool name (e.g., sap_get_agent -> get, sap_register_agent -> register)
  // Extract action from tool name (e.g., sap_registry_get -> registry)
  // Use indexOf instead of regex to avoid polynomial backtracking on long inputs.
  const action = extractSegmentAfterPrefix(toolName, 'sap_', '_');
  const category = extractSegmentAfterPrefix(toolName, 'sap_', '-');
  
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
