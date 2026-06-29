/**
 * Tool schema schemas
 */

import { z } from 'zod';

/**
 * Shared tool schema schema definition used by the SAP MCP runtime.
 */
export const ToolSchemaSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.object({}).passthrough(),
  outputSchema: z.object({}).passthrough().optional(),
});

/**
 * Shared publish tool schema definition used by the SAP MCP runtime.
 */
export const PublishToolSchema = z.object({
  name: z.string(),
  protocolHash: z.string(),
  descriptionHash: z.string(),
  inputSchemaHash: z.string(),
  outputSchemaHash: z.string().optional(),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  category: z.number(),
});
