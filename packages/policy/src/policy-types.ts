/**
 * @name policy/policy-types
 * @description Core type definitions for the SAP MCP policy engine.
 *
 * Defines the shapes for policies, policy rules, evaluation results,
 * and policy evaluation context. These types are consumed by the local
 * policy engine, default-policies module, and the higher-level policy engine.
 *
 * @module policy/policy-types
 */

import type { SapPermission, SapRiskLevel } from '../../core/src/types.js';

/**
 * @name Policy
 * @description A named policy with an ordered set of rules.
 *
 * Each policy has a unique id, a human-readable name and description,
 * an array of rules to evaluate, and an enabled flag.
 *
 * @property id          — Unique policy identifier.
 * @property name        — Human-readable policy name.
 * @property description — Short description of the policy's purpose.
 * @property rules       — Ordered list of rules to evaluate.
 * @property enabled     — Whether the policy is active.
 *
 * @usedBy `default-policies.ts`, `policy-engine.ts:PolicyEngine`
 */
export interface Policy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  enabled: boolean;
}

/**
 * @name PolicyRule
 * @description A single rule within a policy.
 *
 * A rule has a condition expression, an action to take when the condition
 * matches, and optional constraints on tools, permissions, amounts, and risk levels.
 *
 * @property id           — Unique rule identifier within the policy.
 * @property condition    — Expression string evaluated against the policy context.
 * @property action       — Action to take: `allow`, `deny`, or `require_approval`.
 * @property tools        — Optional list of tool names this rule applies to.
 * @property permissions  — Optional list of permissions this rule applies to.
 * @property maxAmountSol — Optional maximum transaction amount in SOL.
 * @property riskLevel    — Optional risk level this rule applies to.
 *
 * @usedBy `Policy.rules`, `default-policies.ts`
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
 * @name PolicyResult
 * @description Result of evaluating a policy against a request.
 *
 * @property allowed          — Whether the operation is permitted.
 * @property reason           — Optional human-readable explanation.
 * @property requiresApproval — Whether human approval is needed before proceeding.
 * @property riskLevel        — Optional risk level associated with the operation.
 *
 * @usedBy `policy-engine.ts:PolicyEngine`
 */
export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
  riskLevel?: SapRiskLevel;
}

/**
 * @name PolicyContext
 * @description Context passed to the policy engine for evaluation.
 *
 * @property toolName   — Name of the tool being called.
 * @property permission — Permission required by the tool.
 * @property amountSol  — Optional transaction amount in SOL.
 * @property riskLevel  — Optional pre-computed risk level.
 * @property sessionId  — Optional session identifier for correlation.
 *
 * @usedBy `policy-engine.ts:PolicyEngine`
 */
export interface PolicyContext {
  toolName: string;
  permission: SapPermission;
  amountSol?: number;
  riskLevel?: SapRiskLevel;
  sessionId?: string;
}
