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
  return createToolExecutionResult(toPhoenixRecord(payload), undefined);
}

export function phoenixPipelineError(payload: Record<string, unknown>): PhoenixPipelineResult {
  return createToolExecutionResult(payload, undefined, { isError: true });
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