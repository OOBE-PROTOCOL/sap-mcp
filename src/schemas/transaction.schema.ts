/**
 * Transaction schemas
 */

import { z } from 'zod';

/**
 * Shared transaction schema definition used by the SAP MCP runtime.
 */
export const TransactionSchema = z.object({
  tx: z.string(),
  signature: z.string().optional(),
});

/**
 * Shared preview transaction schema definition used by the SAP MCP runtime.
 */
export const PreviewTransactionSchema = z.object({
  tx: z.string(),
  includeAccounts: z.boolean().default(true),
  includeLogs: z.boolean().default(false),
});
