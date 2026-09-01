/**
 * @name tools/phoenix/phoenix-pipeline
 * @description Shared pipeline helpers for Phoenix tool families.
 *
 * @module tools/phoenix/phoenix-pipeline
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import {
  createToolExecutionResult,
  registerPipelineTool,
  type ToolExecutionPipelineResult,
} from '../tool-execution-pipeline.js';

export type PhoenixPipelineResult = ToolExecutionPipelineResult<Record<string, unknown>>;

export interface PhoenixPipelineToolDefinition {
  readonly description: string;
  readonly inputSchema: unknown;
}

export function toPhoenixRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { result: payload };
}

export function phoenixPipelineOk(payload: unknown): PhoenixPipelineResult {
  return createToolExecutionResult(compactPhoenixResponse(toPhoenixRecord(payload)), undefined);
}

export function phoenixPipelineError(payload: Record<string, unknown>): PhoenixPipelineResult {
  return createToolExecutionResult(payload, undefined, { isError: true });
}

/**
 * Cap Phoenix tool responses at the gateway level to prevent context explosion.
 * Large arrays are trimmed to the first N entries; large strings are truncated
 * with a marker. This prevents 471k+ char payloads from reaching the MCP client.
 */
const MAX_PHOENIX_RESPONSE_CHARS = 30_000;
const MAX_PHOENIX_ARRAY_ENTRIES = 50;

export function compactPhoenixResponse(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = compactValue(value, 0);
  }
  // If the serialized result is still too large, do a final hard truncation
  const serialized = JSON.stringify(result);
  if (serialized.length > MAX_PHOENIX_RESPONSE_CHARS) {
    return {
      ...result,
      _truncated: true,
      _originalSize: serialized.length,
      _note: `Response capped at ${MAX_PHOENIX_RESPONSE_CHARS} chars. Use a specific tool (e.g. sap_phoenix_get_market with a symbol) for detailed data.`,
    };
  }
  return result;
}

function compactValue(value: unknown, depth: number): unknown {
  if (depth > 5) return '[max depth reached]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 500 ? value.slice(0, 500) + `… (+${value.length - 500} chars)` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (value.length > MAX_PHOENIX_ARRAY_ENTRIES) {
      return [
        ...value.slice(0, MAX_PHOENIX_ARRAY_ENTRIES).map((v) => compactValue(v, depth + 1)),
        `[+${value.length - MAX_PHOENIX_ARRAY_ENTRIES} more entries]`,
      ];
    }
    return value.map((v) => compactValue(v, depth + 1));
  }
  if (typeof value === 'object') {
    const compacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      compacted[k] = compactValue(v, depth + 1);
    }
    return compacted;
  }
  return value;
}

export function phoenixPipelineException(error: string, err: unknown): PhoenixPipelineResult {
  return phoenixPipelineError({
    error,
    message: err instanceof Error ? err.message : 'Unknown error',
  });
}

export function registerPhoenixPipelineTool<TInput extends Record<string, unknown>>(
  server: Server,
  context: SapMcpContext,
  name: string,
  definition: PhoenixPipelineToolDefinition,
  handler: (args: TInput) => Promise<PhoenixPipelineResult>,
): void {
  registerPipelineTool<TInput, Record<string, unknown>>(server, context, {
    name,
    title: name.replace(/_/g, ' '),
    description: definition.description,
    inputSchema: definition.inputSchema as Record<string, unknown>,
    responseMode: 'data',
    execute: async ({ input }) => handler(input),
  });
}