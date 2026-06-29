/**
 * Risk level calculation
 */

import type { SapRiskLevel } from '../core/types.js';

/**
 * Calculate risk level for a transaction
 */
export function calculateRiskLevel(params: {
  amountSol: number;
  isWriteOperation: boolean;
  isKnownOperation: boolean;
  toolName: string;
}): SapRiskLevel {
  const { amountSol, isWriteOperation, isKnownOperation } = params;
  
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
 * Check if risk level requires approval
 */
export function requiresApproval(riskLevel: SapRiskLevel): boolean {
  return riskLevel === 'high' || riskLevel === 'critical';
}
