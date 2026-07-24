/**
 * @name schemas/tool-schema
 * @description Zod schemas for SAP tool schema operations — schema retrieval and publication.
 *
 * @flow
 *   1. Tool-schema MCP tools import these schemas for input validation.
 *   2. `schemas/index.ts` re-exports them for external consumers.
 *
 * @module schemas/tool-schema
 */

import { z } from 'zod';

/**
 * @name ToolSchemaSchema
 * @description Zod schema for describing a tool's input and output JSON schemas.
 *
 * @property name         — Tool name string.
 * @property description  — Human-readable tool description.
 * @property inputSchema  — JSON Schema for tool input (passthrough, allows arbitrary keys).
 * @property outputSchema — Optional JSON Schema for tool output (passthrough).
 *
 * @usedBy Tool-schema MCP tools in the SAP MCP runtime.
 */
export const ToolSchemaSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.object({}).passthrough(),
  outputSchema: z.object({}).passthrough().optional(),
});

/**
 * @name PublishToolSchema
 * @description Zod schema for publishing a tool schema on-chain with content hashes.
 *
 * @property name             — Tool name string.
 * @property protocolHash     — Hash of the tool protocol definition.
 * @property descriptionHash  — Hash of the tool description.
 * @property inputSchemaHash  — Hash of the tool input JSON schema.
 * @property outputSchemaHash — Optional hash of the tool output JSON schema.
 * @property httpMethod       — HTTP method the tool exposes: `GET`, `POST`, `PUT`, or `DELETE`.
 * @property category         — Numeric category code for tool classification.
 *
 * @usedBy Tool-schema MCP tools in the SAP MCP runtime.
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