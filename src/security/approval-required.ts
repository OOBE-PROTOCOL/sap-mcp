/**
 * Approval required check
 */

import type { SapMcpContext } from '../core/types.js';

/**
 * Executes the is approval required operation.
 */
export function isApprovalRequired(
  context: SapMcpContext,
  amountSol: number
): boolean {
  return amountSol > context.config.requireApprovalAboveSol;
}
