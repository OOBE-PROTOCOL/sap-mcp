/**
 * @name policy/spending-limits
 * @description Spending limit enforcement utilities for SAP MCP transactions.
 *
 * Provides functions to validate transaction amounts against configured maximums
 * and approval thresholds, and to derive a risk level from the transaction amount.
 *
 * @module policy/spending-limits
 */

import type { SapMcpConfig } from '@oobe-protocol-labs/sap-mcp-core/types';

/**
 * @name checkSpendingLimit
 * @description Check if a transaction amount is within configured spending limits.
 *
 * Compares the amount against `maxTxValueSol` (hard ceiling) and
 * `requireApprovalAboveSol` (approval threshold). Returns a result object
 * indicating whether the transaction is allowed, requires approval, or is blocked.
 *
 * @param config - The SAP MCP server configuration containing spending limits.
 * @param amountSol - The transaction amount in SOL to validate.
 * @returns An object with `allowed` flag, optional `reason` string, and optional `requiresApproval` flag.
 *
 * @usedBy `policy-engine.ts:PolicyEngine.checkPermission`
 */
export function checkSpendingLimit(
  config: SapMcpConfig,
  amountSol: number
): { allowed: boolean; reason?: string; requiresApproval?: boolean } {
  if (!Number.isFinite(amountSol) || amountSol < 0) {
    return {
      allowed: false,
      reason: `Amount ${amountSol} SOL is invalid; amount must be a finite non-negative number`,
    };
  }

  // Check max transaction limit
  const maxTxValueSol = config.maxTxValueSol;
  if (amountSol > maxTxValueSol) {
    return {
      allowed: false,
      reason: `Amount ${amountSol} SOL exceeds maximum transaction limit ${maxTxValueSol} SOL`,
    };
  }
  
  // Check if approval is required
  if (amountSol > config.requireApprovalAboveSol) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: `Amount ${amountSol} SOL requires approval (threshold: ${config.requireApprovalAboveSol} SOL)`,
    };
  }
  
  return { allowed: true };
}

/**
 * @name calculateRiskLevel
 * @description Calculate risk level based solely on transaction amount in SOL.
 *
 * Maps amount thresholds to risk tiers: 0 SOL is `safe`, <0.1 is `low`,
 * <1.0 is `medium`, <10.0 is `high`, and 10.0+ is `critical`.
 *
 * @param amountSol - The transaction amount in SOL.
 * @returns A risk level string: `safe`, `low`, `medium`, `high`, or `critical`.
 *
 * @usedBy `spending-limits.ts:checkSpendingLimit`
 */
export function calculateRiskLevel(amountSol: number): 'safe' | 'low' | 'medium' | 'high' | 'critical' {
  if (!Number.isFinite(amountSol) || amountSol < 0) return 'critical';
  if (amountSol === 0) return 'safe';
  if (amountSol < 0.1) return 'low';
  if (amountSol < 1.0) return 'medium';
  if (amountSol < 10.0) return 'high';
  return 'critical';
}
