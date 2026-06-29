/**
 * Spending limits enforcement
 */

import type { SapMcpConfig } from '../core/types.js';

/**
 * Check if amount is within spending limits
 */
export function checkSpendingLimit(
  config: SapMcpConfig,
  amountSol: number
): { allowed: boolean; reason?: string; requiresApproval?: boolean } {
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
 * Calculate risk level based on amount
 */
export function calculateRiskLevel(amountSol: number): 'safe' | 'low' | 'medium' | 'high' | 'critical' {
  if (amountSol === 0) return 'safe';
  if (amountSol < 0.1) return 'low';
  if (amountSol < 1.0) return 'medium';
  if (amountSol < 10.0) return 'high';
  return 'critical';
}
