/**
 * @name schemas/transaction
 * @description Zod schemas for Solana transaction operations — submission and preview.
 *
 * @flow
 *   1. Transaction MCP tools import these schemas for input validation.
 *   2. `schemas/index.ts` re-exports them for external consumers.
 *
 * @module schemas/transaction
 */

import { z } from 'zod';

/**
 * @name TransactionSchema
 * @description Zod schema for submitting a serialized Solana transaction.
 *
 * @property tx        — Base64 or base58-encoded serialized transaction string.
 * @property signature — Optional transaction signature (base58).
 *
 * @usedBy Transaction MCP tools in the SAP MCP runtime.
 */
export const TransactionSchema = z.object({
  tx: z.string(),
  signature: z.string().optional(),
});

/**
 * @name PreviewTransactionSchema
 * @description Zod schema for previewing a transaction before submission.
 *
 * @property tx              — Base64 or base58-encoded serialized transaction string.
 * @property includeAccounts — Whether to include account metadata in the preview (default `true`).
 * @property includeLogs     — Whether to include simulated logs in the preview (default `false`).
 *
 * @usedBy Transaction MCP tools in the SAP MCP runtime.
 */
export const PreviewTransactionSchema = z.object({
  tx: z.string(),
  includeAccounts: z.boolean().default(true),
  includeLogs: z.boolean().default(false),
});