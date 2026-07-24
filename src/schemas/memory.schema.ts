/**
 * @name schemas/memory
 * @description Zod schemas for SAP on-chain memory vault operations (read and write).
 *
 * @flow
 *   1. Memory MCP tools import these schemas for input validation.
 *   2. `schemas/index.ts` re-exports them for external consumers.
 *
 * @module schemas/memory
 */

import { z } from 'zod';
import { PdaSchema } from './common.schema.js';

/**
 * @name ReadMemorySchema
 * @description Zod schema for reading from a SAP memory vault at a given slot.
 *
 * @property vault — Program Derived Address of the memory vault.
 * @property slot  — Non-negative slot number to read from.
 *
 * @usedBy Memory MCP tools in the SAP MCP runtime.
 */
export const ReadMemorySchema = z.object({
  vault: PdaSchema,
  slot: z.number().nonnegative(),
});

/**
 * @name WriteMemorySchema
 * @description Zod schema for writing data to a SAP memory vault at an optional slot.
 *
 * @property vault — Program Derived Address of the memory vault.
 * @property data  — String payload to write to the vault.
 * @property slot  — Optional non-negative slot number (appends if omitted).
 *
 * @usedBy Memory MCP tools in the SAP MCP runtime.
 */
export const WriteMemorySchema = z.object({
  vault: PdaSchema,
  data: z.string(),
  slot: z.number().nonnegative().optional(),
});