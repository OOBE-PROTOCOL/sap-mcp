/**
 * @name tools/perpspad/perpspad-pipeline
 * @description Shared pipeline helpers for the PerpsPad tool family. Mirrors
 *   the Backpack/Sunrise pipelines: compacted responses, structured errors.
 *
 * @module tools/perpspad/perpspad-pipeline
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import {
  createToolExecutionResult,
  registerPipelineTool,
  type ToolExecutionPipelineResult,
} from '../tool-execution-pipeline.js';
import { compactPerpspadResponse } from './perpspad-client.js';

export type PerpspadPipelineResult = ToolExecutionPipelineResult<Record<string, unknown>>;

export interface PerpspadPipelineToolDefinition {
  readonly description: string;
  readonly inputSchema: unknown;
}

/** Narrows arbitrary payloads into a record for the pipeline envelope. */
export function toPerpspadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { result: payload };
}

/** Builds a structured success pipeline result with upstream compaction. */
export function perpspadPipelineOk(payload: unknown): PerpspadPipelineResult {
  return createToolExecutionResult(
    compactPerpspadResponse(toPerpspadRecord(payload)) as Record<string, unknown>,
    undefined,
  );
}

/** Builds a structured error pipeline result. */
export function perpspadPipelineError(payload: Record<string, unknown>): PerpspadPipelineResult {
  return createToolExecutionResult(payload, undefined, { isError: true });
}

/** Maps an exception into a structured error envelope. */
export function perpspadPipelineException(error: string, err: unknown): PerpspadPipelineResult {
  return perpspadPipelineError({
    error,
    message: err instanceof Error ? err.message : 'Unknown error',
  });
}

/**
 * @name registerPerpspadPipelineTool
 * @description Registers a PerpsPad tool through the shared execution
 *   pipeline (responseMode 'data', compacted results).
 */
export function registerPerpspadPipelineTool<TInput extends Record<string, unknown>>(
  server: Server,
  context: SapMcpContext,
  name: string,
  definition: { readonly description: string; readonly inputSchema: unknown },
  handler: (args: TInput) => Promise<PerpspadPipelineResult>,
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