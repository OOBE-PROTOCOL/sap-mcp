/**
 * Memory schemas
 */

import { z } from 'zod';
import { PdaSchema } from './common.schema.js';

/**
 * Shared read memory schema definition used by the SAP MCP runtime.
 */
export const ReadMemorySchema = z.object({
  vault: PdaSchema,
  slot: z.number().nonnegative(),
});

/**
 * Shared write memory schema definition used by the SAP MCP runtime.
 */
export const WriteMemorySchema = z.object({
  vault: PdaSchema,
  data: z.string(),
  slot: z.number().nonnegative().optional(),
});
