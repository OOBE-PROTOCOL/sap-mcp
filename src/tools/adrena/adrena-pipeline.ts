/**
 * @name tools/adrena/adrena-pipeline
 * @description Shared pipeline helpers for Adrena tool families.
 *
 * @module tools/adrena/adrena-pipeline
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/types.js';
import type { UiCardContext } from '../../ui/ui-resources.js';
import {
  createToolExecutionResult,
  registerPipelineTool,
  type ToolExecutionPipelineResult,
} from '../tool-execution-pipeline.js';

export type AdrenaPipelineResult = ToolExecutionPipelineResult<Record<string, unknown>>;

export interface AdrenaPipelineToolDefinition {
  readonly description: string;
  readonly inputSchema: unknown;
}

export function toAdrenaRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { result: payload };
}

export function adrenaPipelineOk(payload: unknown, uiCard?: UiCardContext): AdrenaPipelineResult {
  return createToolExecutionResult(
    toAdrenaRecord(payload),
    uiCard ? { uiCard } : undefined,
  );
}

export function adrenaPipelineError(payload: Record<string, unknown>): AdrenaPipelineResult {
  return createToolExecutionResult(payload, undefined, { isError: true });
}

export function adrenaPipelineException(error: string, err: unknown): AdrenaPipelineResult {
  return adrenaPipelineError({
    error,
    message: err instanceof Error ? err.message : 'Unknown error',
  });
}

export function adrenaUiCardFromMetadata(
  result: ToolExecutionPipelineResult<Record<string, unknown>>,
): UiCardContext | undefined {
  const uiCard = result.metadata?.uiCard;
  return uiCard && typeof uiCard === 'object' ? uiCard as UiCardContext : undefined;
}

export function registerAdrenaPipelineTool<TInput extends Record<string, unknown>>(
  server: Server,
  context: SapMcpContext,
  name: string,
  definition: AdrenaPipelineToolDefinition,
  handler: (args: TInput) => Promise<AdrenaPipelineResult>,
  options: { readonly uiCard?: boolean } = {},
): void {
  registerPipelineTool<TInput, Record<string, unknown>>(server, context, {
    name,
    title: name.replace(/_/g, ' '),
    description: definition.description,
    inputSchema: definition.inputSchema as Record<string, unknown>,
    responseMode: 'data',
    ...(options.uiCard ? { uiCard: adrenaUiCardFromMetadata } : {}),
    execute: async ({ input }) => handler(input),
  });
}
