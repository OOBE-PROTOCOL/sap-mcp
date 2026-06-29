/**
 * Settlement schemas
 */

import { z } from 'zod';
import { WalletSchema, PdaSchema, AmountSchema } from './common.schema.js';

/**
 * Shared create escrow schema definition used by the SAP MCP runtime.
 */
export const CreateEscrowSchema = z.object({
  agent: WalletSchema,
  amount: AmountSchema,
  maxCalls: z.number().positive(),
  expiresAt: z.number().optional(),
});

/**
 * Shared settle escrow schema definition used by the SAP MCP runtime.
 */
export const SettleEscrowSchema = z.object({
  escrow: PdaSchema,
  callsToSettle: z.number().positive(),
});

/**
 * Shared open dispute schema definition used by the SAP MCP runtime.
 */
export const OpenDisputeSchema = z.object({
  escrow: PdaSchema,
  reason: z.string(),
});
