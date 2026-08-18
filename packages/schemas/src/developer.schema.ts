/**
 * @name schemas/developer
 * @description Zod schemas for developer-facing MCP tool inputs (error explanation and code snippet generation).
 *
 * @flow
 *   1. Developer MCP tools import these schemas for input validation.
 *   2. `schemas/index.ts` re-exports them for external consumers.
 *
 * @module schemas/developer
 */

import { z } from 'zod';

/**
 * @name ExplainErrorSchema
 * @description Zod schema for the explain-error developer tool input.
 *
 * @property errorCode — The error code to explain.
 * @property context   — Optional additional context string.
 *
 * @usedBy Developer tools in the SAP MCP runtime.
 */
export const ExplainErrorSchema = z.object({
  errorCode: z.string(),
  context: z.string().optional(),
});

/**
 * @name GenerateSnippetSchema
 * @description Zod schema for the generate-snippet developer tool input.
 *
 * @property operation — The SAP operation to generate a code snippet for.
 * @property language  — Target language: `typescript`, `javascript`, or `python` (default `typescript`).
 *
 * @usedBy Developer tools in the SAP MCP runtime.
 */
export const GenerateSnippetSchema = z.object({
  operation: z.string(),
  language: z.enum(['typescript', 'javascript', 'python']).default('typescript'),
});