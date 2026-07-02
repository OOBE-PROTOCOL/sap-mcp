/**
 * Tool permissions checker
 * 
 * Validates if a tool can be executed based on:
 * - Allowed tools list
 * - Session permissions
 * - Mode restrictions
 */

import { logger } from '../core/logger.js';
import type { SapMcpContext, SapPermission } from '../core/types.js';

/**
 * Tool permission groups for the current SAP MCP tool surface.
 */
const TOOL_PERMISSION_GROUPS: Record<SapPermission, readonly string[]> = {
  'config:read': [
    'sap_profile_current',
    'sap_profile_list',
    'sap_profile_public_key',
    'sap_skills_list',
    'sap_skills_bundle',
  ],
  'config:write': [
    'sap_profile_switch',
    'sap_skills_install',
  ],
  'registry:read': [
    'sol_get_balance',
    'sap_decode_transaction',
    'sap_preview_transaction',
    'sap_get_agent',
    'sap_get_agent_stats',
    'sap_get_global_state',
    'sap_get_network_overview',
    'sap_get_agent_profile',
    'sap_is_agent_active',
    'sap_discover_agents',
    'sap_list_agents',
    'sap_list_all_agents',
    'sap_find_tools_by_category',
    'sap_get_tool_category_summary',
    'sap_fetch_capability_index',
    'sap_fetch_protocol_index',
    'sap_fetch_tool_category_index',
    'sap_fetch_tool',
    'sap_network_stats',
    'sap_sns_check_domain',
    'sap_sns_batch_check_domains',
    'sap_sns_resolve_domain',
    'sap_sns_validate_records',
    'sap_sns_get_domain_records',
    'sap_sns_get_record',
    'sap_sns_resolve_wallet',
    'sap_sns_check_ownership',
    'sap_sns_get_domain_pda',
    'sap_sns_get_record_pda',
    'bridging_bridgeWormholeStatus',
    'bridging_bridgeDeBridgeStatus',
  ],
  'registry:write': [
    'sap_register_agent',
    'sap_update_agent',
    'sap_deactivate_agent',
    'sap_reactivate_agent',
    'sap_close_agent',
    'sap_report_calls',
    'sap_publish_tool_by_name',
    'sap_update_tool',
    'sap_deactivate_tool',
    'sap_reactivate_tool',
    'sap_report_tool_invocations',
  ],
  'identity:read': [],
  'identity:write': [],
  'reputation:read': [
    'sap_fetch_feedback',
    'sap_fetch_attestation',
    'sap_fairscale_score',
    'sap_fairscale_trust_gate',
  ],
  'reputation:write': [
    'sap_update_reputation_metrics',
    'sap_give_feedback',
    'sap_update_feedback',
    'sap_revoke_feedback',
    'sap_create_attestation',
    'sap_revoke_attestation',
  ],
  'payments:read': [
    'sap_x402_estimate_cost',
    'sap_x402_calculate_cost',
    'sap_x402_build_payment_headers',
    'sap_x402_build_headers_from_escrow',
    'sap_x402_has_escrow',
    'sap_x402_fetch_escrow',
    'sap_x402_prepare_payment',
    'sap_x402_get_balance',
  ],
  'payments:write': [
    'sap_x402_settle',
    'sap_x402_settle_batch',
    'sap_create_subscription',
    'sap_fund_subscription',
    'sap_cancel_subscription',
  ],
  'settlement:read': [
    'sap_fetch_escrow',
    'sap_fetch_escrow_v2',
    'sap_fetch_pending_settlement',
    'sap_fetch_dispute',
    'sap_fetch_stake',
    'sap_fetch_subscription',
    'sap_next_settlement_index',
  ],
  'settlement:write': [
    'sap_create_escrow',
    'sap_deposit_escrow',
    'sap_settle_escrow',
    'sap_settle_escrow_batch',
    'sap_withdraw_escrow',
    'sap_close_escrow',
    'sap_create_escrow_v2',
    'sap_deposit_escrow_v2',
    'sap_settle_escrow_v2',
    'sap_finalize_settlement_v2',
    'sap_file_dispute_v2',
    'sap_withdraw_escrow_v2',
    'sap_close_escrow_v2',
    'sap_init_stake',
    'sap_deposit_stake',
    'sap_request_unstake',
    'sap_complete_unstake',
  ],
  'memory:read': [
    'sap_fetch_vault',
    'sap_fetch_session',
    'sap_fetch_epoch_page',
    'sap_session_read_latest',
    'sap_session_status',
    'sap_chat_derive_room',
    'sap_chat_read_latest',
    'sap_chat_read_all',
    'sap_chat_status',
  ],
  'memory:write': [
    'sap_init_vault',
    'sap_open_vault_session',
    'sap_inscribe_memory',
    'sap_compact_inscribe_memory',
    'sap_session_start',
    'sap_chat_start_room',
    'sap_chat_send_message',
    'sap_chat_publish_manifest',
    'sap_chat_seal_room',
  ],
  'transaction:submit': [
    'sap_sign_transaction',
    'sap_submit_signed_transaction',
    'sap_sns_build_manage_record_transaction',
    'sap_sns_build_set_primary_domain_transaction',
    'sap_sns_register_agent_domain',
    'bridging_bridgeWormhole',
    'bridging_bridgeDeBridge',
    'metaplex-nft_deployCollection',
    'metaplex-nft_mintNFT',
    'metaplex-nft_updateMetadata',
    'metaplex-nft_verifyCreator',
    'metaplex-nft_verifyCollection',
    'metaplex-nft_setAndVerifyCollection',
    'metaplex-nft_delegateAuthority',
    'metaplex-nft_revokeAuthority',
    'metaplex-nft_configureRoyalties',
  ],
};

const TOOL_PERMISSION_MAP: ReadonlyMap<string, SapPermission> = buildToolPermissionMap(TOOL_PERMISSION_GROUPS);

/**
 * @name buildToolPermissionMap
 * @description Builds a lookup map from permission groups while rejecting duplicate tool entries.
 */
function buildToolPermissionMap(groups: Record<SapPermission, readonly string[]>): ReadonlyMap<string, SapPermission> {
  const map = new Map<string, SapPermission>();
  for (const [permission, tools] of Object.entries(groups) as Array<[SapPermission, readonly string[]]>) {
    for (const tool of tools) {
      if (map.has(tool)) {
        throw new Error(`Duplicate permission mapping for tool: ${tool}`);
      }
      map.set(tool, permission);
    }
  }
  return map;
}

/**
 * Check if tool execution is allowed
 */
export function checkToolPermissions(
  context: SapMcpContext,
  toolName: string,
  permission?: SapPermission
): { allowed: boolean; reason?: string } {
  logger.debug('Checking tool permissions', { toolName, permission });
  
  const config = context.config;
  const session = context.session;
  
  // 1. Check if tool is in allowed list
  if (config.allowedTools !== 'all') {
    if (!config.allowedTools.includes(toolName)) {
      return {
        allowed: false,
        reason: `Tool '${toolName}' is not in the allowed tools list`,
      };
    }
  }
  
  // 2. Check session permissions (if session exists)
  if (session && permission) {
    if (!session.permissions.includes(permission)) {
      return {
        allowed: false,
        reason: `Session does not have '${permission}' permission`,
      };
    }
  }
  
  // 3. Check mode restrictions
  const requiresWrite = isWriteOperation(toolName);
  if (requiresWrite && context.config.mode === 'readonly') {
    return {
      allowed: false,
      reason: `Tool '${toolName}' requires write operations, but server is in readonly mode`,
    };
  }
  
  // 4. Check tool-specific permission
  const requiredPermission = TOOL_PERMISSION_MAP.get(toolName);
  if (requiredPermission && session) {
    if (!session.permissions.includes(requiredPermission)) {
      return {
        allowed: false,
        reason: `Tool '${toolName}' requires '${requiredPermission}' permission`,
      };
    }
  }
  
  logger.debug('Tool permissions check passed', { toolName });
  
  return { allowed: true };
}

/**
 * Get required permission for a tool
 */
export function getRequiredPermission(toolName: string): SapPermission | undefined {
  return TOOL_PERMISSION_MAP.get(toolName);
}

/**
 * Check if tool is a write operation
 */
function isWriteOperation(toolName: string): boolean {
  const requiredPermission = TOOL_PERMISSION_MAP.get(toolName);
  if (requiredPermission) {
    return !requiredPermission.endsWith(':read');
  }

  const writePrefixes = [
    'sap_register',
    'sap_update',
    'sap_close',
    'sap_publish',
    'sap_submit',
    'sap_create',
    'sap_deactivate',
    'sap_reactivate',
    'sap_deposit',
    'sap_withdraw',
    'sap_settle',
    'sap_open',
    'sap_file',
    'sap_finalize',
    'sap_give',
    'sap_revoke',
    'sap_init',
    'sap_inscribe',
    'sap_compact',
    'sap_session_start',
    'sap_chat_start',
    'sap_chat_send',
    'sap_chat_publish',
    'sap_chat_seal',
    'sap_sns_build',
    'sap_sns_register',
  ];
  
  return writePrefixes.some(prefix => toolName.startsWith(prefix));
}

/**
 * Get all tools for a permission
 */
export function getToolsForPermission(permission: SapPermission): string[] {
  return Array.from(TOOL_PERMISSION_MAP.entries())
    .filter(([, perm]) => perm === permission)
    .map(([name]) => name);
}

/**
 * @name getPermissionMappedTools
 * @description Returns all tool names with explicit permission mappings for consistency tests.
 */
export function getPermissionMappedTools(): string[] {
  return Array.from(TOOL_PERMISSION_MAP.keys());
}
