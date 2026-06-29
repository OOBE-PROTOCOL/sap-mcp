/**
 * Execution proof schemas
 */

import { z } from 'zod';

/**
 * Shared hash execution schema definition used by the SAP MCP runtime.
 */
export const HashExecutionSchema = z.object({
  trace: z.string(),
  algorithm: z.enum(['sha256', 'keccak256']).default('sha256'),
});

/**
 * Shared submit proof schema definition used by the SAP MCP runtime.
 */
export const SubmitProofSchema = z.object({
  proof: z.string(),
  signature: z.string(),
});

/**
 * Shared verify hash schema definition used by the SAP MCP runtime.
 */
export const VerifyHashSchema = z.object({
  hash: z.string(),
  data: z.string(),
});
