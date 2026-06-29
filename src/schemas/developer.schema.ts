/**
 * Developer schemas
 */

import { z } from 'zod';

/**
 * Shared explain error schema definition used by the SAP MCP runtime.
 */
export const ExplainErrorSchema = z.object({
  errorCode: z.string(),
  context: z.string().optional(),
});

/**
 * Shared generate snippet schema definition used by the SAP MCP runtime.
 */
export const GenerateSnippetSchema = z.object({
  operation: z.string(),
  language: z.enum(['typescript', 'javascript', 'python']).default('typescript'),
});
