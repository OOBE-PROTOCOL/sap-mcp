/**
 * Policy type definitions
 */

import type { SapPermission, SapRiskLevel } from '../core/types.js';

/**
 * Policy definition
 */
export interface Policy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  enabled: boolean;
}

/**
 * Policy rule
 */
export interface PolicyRule {
  id: string;
  condition: string;
  action: 'allow' | 'deny' | 'require_approval';
  tools?: string[];
  permissions?: SapPermission[];
  maxAmountSol?: number;
  riskLevel?: SapRiskLevel;
}

/**
 * Policy evaluation result
 */
export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
  riskLevel?: SapRiskLevel;
}

/**
 * Policy context
 */
export interface PolicyContext {
  toolName: string;
  permission: SapPermission;
  amountSol?: number;
  riskLevel?: SapRiskLevel;
  sessionId?: string;
}
