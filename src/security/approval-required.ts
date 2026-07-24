/**
 * @name security/approval-required
 * @description Approval threshold check for SAP MCP transactions.
 *
 * Determines whether a transaction requires explicit human approval based on
 * the configured SOL amount threshold (`requireApprovalAboveSol`).
 *
 * @flow
 *   1. Tool handlers call `isApprovalRequired` before executing value transfers.
 *   2. If approval is required, the tool returns an approval prompt to the agent.
 *
 * @module security/approval-required
 */

import type { SapMcpContext } from '../core/types.js';

/**
 * @name isApprovalRequired
 * @description Checks whether a transaction amount exceeds the approval threshold.
 *
 * @param context    — SAP MCP runtime context containing config thresholds.
 * @param amountSol  — Transaction amount in SOL to evaluate.
 * @returns `true` if the amount exceeds `config.requireApprovalAboveSol`, `false` otherwise.
 *
 * @usedBy Tool handlers across the SAP MCP runtime.
 */
export function isApprovalRequired(
  context: SapMcpContext,
  amountSol: number
): boolean {
  return amountSol > context.config.requireApprovalAboveSol;
}