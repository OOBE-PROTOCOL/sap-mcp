/**
 * @name schemas/execution-proof
 * @description Zod schemas for execution proof operations — hash computation, proof submission, and hash verification.
 *
 * @flow
 *   1. Execution-proof MCP tools import these schemas for input validation.
 *   2. `schemas/index.ts` re-exports them for external consumers.
 *
 * @module schemas/execution-proof
 */

import { z } from 'zod';

/**
 * @name HashExecutionSchema
 * @description Zod schema for computing a hash over an execution trace.
 *
 * @property trace     — The execution trace string to hash.
 * @property algorithm — Hash algorithm: `sha256` or `keccak256` (default `sha256`).
 *
 * @usedBy Execution-proof MCP tools in the SAP MCP runtime.
 */
export const HashExecutionSchema = z.object({
  trace: z.string(),
  algorithm: z.enum(['sha256', 'keccak256']).default('sha256'),
});

/**
 * @name SubmitProofSchema
 * @description Zod schema for submitting a cryptographic proof with a signature.
 *
 * @property proof     — The proof string to submit.
 * @property signature — The signature authorizing the proof.
 *
 * @usedBy Execution-proof MCP tools in the SAP MCP runtime.
 */
export const SubmitProofSchema = z.object({
  proof: z.string(),
  signature: z.string(),
});

/**
 * @name VerifyHashSchema
 * @description Zod schema for verifying that data matches a given hash.
 *
 * @property hash — The expected hash value.
 * @property data — The data string to verify against the hash.
 *
 * @usedBy Execution-proof MCP tools in the SAP MCP runtime.
 */
export const VerifyHashSchema = z.object({
  hash: z.string(),
  data: z.string(),
});