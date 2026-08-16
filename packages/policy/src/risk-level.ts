/**
 * @name policy/risk-level
 * @description Risk level calculation utilities for SAP MCP transactions.
 *
 * Provides functions to compute a `SapRiskLevel` from transaction parameters
 * and determine whether a given risk level requires human approval.
 *
 * @module policy/risk-level
 */

import type { SapRiskLevel } from '../../core/src/types.js';

/**
 * @name calculateRiskLevel
 * @description Calculate risk level for a transaction based on amount and operation type.
 *
 * Evaluates the transaction amount, whether it is a write operation, and whether
 * it targets a known program to produce a graduated risk level from `safe` to `critical`.
 * Write operations elevate risk by one tier; known operations reduce risk by one tier.
 *
 * @param params - Transaction parameters including amount, write flag, known flag, and tool name.
 * @param params.amountSol - Transaction amount in SOL.
 * @param params.isWriteOperation - Whether the operation mutates on-chain state.
 * @param params.isKnownOperation - Whether the target program is in the known set.
 * @param params.toolName - Name of the tool invoking the transaction.
 * @returns A `SapRiskLevel` string: `safe`, `low`, `medium`, `high`, or `critical`.
 *
 * @usedBy `policy-engine.ts:PolicyEngine.checkPermission`
 */
export function calculateRiskLevel(params: {
  amountSol: number;
  isWriteOperation: boolean;
  isKnownOperation: boolean;
  toolName: string;
}): SapRiskLevel {
  const { amountSol, isWriteOperation, isKnownOperation } = params;

  if (!Number.isFinite(amountSol) || amountSol < 0) {
    return 'critical';
  }
  
  // Base risk from amount
  let risk: SapRiskLevel = 'safe';
  if (amountSol === 0) {
    risk = 'safe';
  } else if (amountSol < 0.1) {
    risk = 'low';
  } else if (amountSol < 1.0) {
    risk = 'medium';
  } else if (amountSol < 10.0) {
    risk = 'high';
  } else {
    risk = 'critical';
  }
  
  // Increase risk for write operations
  if (isWriteOperation && risk === 'safe') {
    risk = 'low';
  }
  
  // Decrease risk for known operations
  if (isKnownOperation && risk !== 'safe') {
    const levels: SapRiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];
    const currentIndex = levels.indexOf(risk);
    if (currentIndex > 0) {
      risk = levels[currentIndex - 1];
    }
  }
  
  return risk;
}

/**
 * @name requiresApproval
 * @description Check if a risk level requires human approval before execution.
 *
 * Returns `true` when the risk level is `high` or `critical`, indicating
 * that the operation should be escalated for manual review.
 *
 * @param riskLevel - The risk level to evaluate.
 * @returns `true` if the risk level is `high` or `critical`; otherwise `false`.
 *
 * @usedBy `policy-engine.ts:PolicyEngine.checkPermission`
 */
export function requiresApproval(riskLevel: SapRiskLevel): boolean {
  return riskLevel === 'high' || riskLevel === 'critical';
}
