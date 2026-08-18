/**
 * @name security/unsafe-action-guard
 * @description Detects potentially dangerous Solana operations before execution.
 *
 * Validates actions against a program whitelist, unsafe pattern blacklist,
 * value thresholds, privilege escalation attempts, and reentrancy risks.
 * Returns a structured safety verdict with risk level classification.
 *
 * @flow
 *   1. Tool handlers call `unsafeActionGuard` before executing on-chain actions.
 *   2. If the guard returns `safe: false`, the tool blocks execution.
 *   3. `getRiskScore` provides a numeric risk score (0–100) for logging/metrics.
 *
 * @module security/unsafe-action-guard
 */

import { logger } from '@oobe-protocol-labs/sap-mcp-core/logger';
import type { SapMcpContext } from '@oobe-protocol-labs/sap-mcp-core/types';

/**
 * @name SAFE_PROGRAMS
 * @description Whitelist of known-safe Solana program IDs (System, Token, SAP, DEXs, lending, NFT).
 *
 * @usedBy `unsafeActionGuard`, `isPrivilegeEscalationAttempt`
 */
const SAFE_PROGRAMS = new Set([
  // Solana core
  '11111111111111111111111111111111', // System Program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token
  'ComputeBudget111111111111111111111111111111', // Compute Budget
  'Sysvar1111111111111111111111111111111111111', // Sysvars
  
  // SAP Protocol
  'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ', // SAP Program
  
  // Major DEXs
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Whirlpool
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // CAMM
  
  // Lending
  'ALend7Ketfx5bx4qzJ7WuPecYmEv2fTVuH14cD53E95', // Solend
  'LendQqH9ZH34zB7gH3qo74bViZyK1TjcX4I72k6u8Ym', // MarginFi
  
  // NFT
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', // Metaplex
]);

/**
 * @name UNSAFE_PATTERNS
 * @description Blacklist of action name substrings that indicate potentially dangerous operations.
 *
 * @usedBy `hasUnsafePattern`
 */
const UNSAFE_PATTERNS = [
  'close_account',
  'set_authority',
  'approve_all',
  'revoke_all',
  'set_data',
  'upgrade',
  'close',
];

/**
 * @name unsafeActionGuard
 * @description Evaluates whether an action is safe to execute on-chain.
 *
 * Checks (in order): unsafe pattern matching, program whitelist, value thresholds,
 * privilege escalation attempts, and reentrancy risks.
 *
 * @param context  — SAP MCP runtime context with config thresholds.
 * @param action   — Action name string to evaluate.
 * @param metadata — Optional metadata including `programId`, `valueSol`, and `accounts`.
 * @returns Safety verdict with `safe` boolean, optional `reason`, and `riskLevel` (`low`, `medium`, `high`, `critical`).
 *
 * @usedBy Tool handlers across the SAP MCP runtime.
 */
export function unsafeActionGuard(
  context: SapMcpContext,
  action: string,
  metadata?: {
    programId?: string;
    valueSol?: number;
    accounts?: string[];
  }
): { safe: boolean; reason?: string; riskLevel?: 'low' | 'medium' | 'high' | 'critical' } {
  logger.debug('Running unsafe action guard', { action, metadata });
  
  // 1. Check for known unsafe patterns
  if (hasUnsafePattern(action)) {
    return {
      safe: false,
      reason: `Action '${action}' matches unsafe pattern`,
      riskLevel: 'high',
    };
  }
  
  // 2. Check program whitelist
  if (metadata?.programId && !SAFE_PROGRAMS.has(metadata.programId)) {
    return {
      safe: false,
      reason: `Program '${metadata.programId}' is not in the safe programs whitelist`,
      riskLevel: 'critical',
    };
  }
  
  // 3. Check value thresholds
  if (metadata?.valueSol !== undefined) {
    const config = context.config;
    const maxTxValueSol = config.maxTxValueSol;
    
    if (metadata.valueSol > maxTxValueSol) {
      return {
        safe: false,
        reason: `Transaction value (${metadata.valueSol} SOL) exceeds maximum allowed (${maxTxValueSol} SOL)`,
        riskLevel: 'high',
      };
    }
    
    if (metadata.valueSol > config.requireApprovalAboveSol) {
      return {
        safe: true,
        reason: `Transaction value (${metadata.valueSol} SOL) requires approval`,
        riskLevel: 'medium',
      };
    }
  }
  
  // 4. Check for privilege escalation attempts
  if (isPrivilegeEscalationAttempt(action, metadata)) {
    return {
      safe: false,
      reason: 'Potential privilege escalation attempt detected',
      riskLevel: 'critical',
    };
  }
  
  // 5. Check for reentrancy risks
  if (isReentrancyRisk(action)) {
    return {
      safe: false,
      reason: 'Potential reentrancy risk detected',
      riskLevel: 'high',
    };
  }
  
  logger.debug('Unsafe action guard passed', { action });
  
  return { safe: true, riskLevel: 'low' };
}

/**
 * @name hasUnsafePattern
 * @description Checks whether an action name contains any blacklisted unsafe pattern.
 *
 * @param action — Action name string to check.
 * @returns `true` if the action name matches any unsafe pattern, `false` otherwise.
 *
 * @internal
 */
function hasUnsafePattern(action: string): boolean {
  const actionLower = action.toLowerCase();
  return UNSAFE_PATTERNS.some(pattern => actionLower.includes(pattern));
}

/**
 * @name isPrivilegeEscalationAttempt
 * @description Detects privilege escalation attempts by checking for authority-change patterns
 * combined with unknown program accounts.
 *
 * @param action   — Action name string to check.
 * @param metadata — Optional metadata containing account addresses.
 * @returns `true` if a privilege escalation attempt is detected, `false` otherwise.
 *
 * @internal
 */
function isPrivilegeEscalationAttempt(
  action: string,
  metadata?: { accounts?: string[] }
): boolean {
  // Check for authority changes
  const authorityPatterns = [
    'set_authority',
    'update_authority',
    'change_owner',
    'transfer_authority',
  ];
  
  const actionLower = action.toLowerCase();
  const hasAuthorityChange = authorityPatterns.some(pattern => 
    actionLower.includes(pattern)
  );
  
  if (!hasAuthorityChange) {
    return false;
  }
  
  // If accounts include unknown programs, it's suspicious
  if (metadata?.accounts) {
    const hasUnknownProgram = metadata.accounts.some(account => 
      !SAFE_PROGRAMS.has(account)
    );
    
    if (hasUnknownProgram) {
      return true;
    }
  }
  
  return false;
}

/**
 * @name isReentrancyRisk
 * @description Checks whether an action name indicates a cross-program invocation reentrancy risk.
 *
 * @param action — Action name string to check.
 * @returns `true` if the action name contains reentrancy-related patterns, `false` otherwise.
 *
 * @internal
 */
function isReentrancyRisk(action: string): boolean {
  const reentrancyPatterns = [
    'invoke_signed',
    'cross_program_invoke',
    'cpi',
  ];
  
  const actionLower = action.toLowerCase();
  return reentrancyPatterns.some(pattern => actionLower.includes(pattern));
}

/**
 * @name getRiskScore
 * @description Computes a numeric risk score (0–100) for an action based on the guard verdict
 * and action characteristics.
 *
 * @param context  — SAP MCP runtime context with config thresholds.
 * @param action   — Action name string to evaluate.
 * @param metadata — Optional metadata including `programId`, `valueSol`, and `accounts`.
 * @returns Risk score from 0 (safe) to 100 (critical). Blocked actions return 25–100 based on
 *          risk level; safe actions return 10–60 based on write operations and value.
 *
 * @usedBy Tool handlers and metrics collection in the SAP MCP runtime.
 */
export function getRiskScore(
  context: SapMcpContext,
  action: string,
  metadata?: Parameters<typeof unsafeActionGuard>[2]
): number {
  const result = unsafeActionGuard(context, action, metadata);
  
  if (!result.safe) {
    switch (result.riskLevel) {
      case 'critical': return 100;
      case 'high': return 75;
      case 'medium': return 50;
      default: return 25;
    }
  }
  
  // Base risk factors
  let score = 10; // Base score for arbitrary actions
  
  // Increase for write operations
  if (action.includes('write') || action.includes('create') || action.includes('update')) {
    score += 20;
  }
  
  // Increase for high value
  if (metadata?.valueSol && metadata.valueSol > 1) {
    score += Math.min(30, metadata.valueSol * 5);
  }
  
  return Math.min(100, score);
}