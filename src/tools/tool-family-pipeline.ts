/**
 * @name tools/tool-family-pipeline
 * @description Helpers for tool families that expose stable data-mode MCP payloads.
 *
 * New tools should normally call registerPipelineTool directly. Existing
 * families and trusted plugins with stable structured payload consumers can use
 * this adapter to keep responseMode: 'data' while sharing input parsing,
 * execution metadata, error normalization, and optional MCP Apps Cards.
 *
 * @module tools/tool-family-pipeline
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../core/types.js';
import type { UiCardContext } from '../ui/ui-resources.js';
import {
  createToolExecutionResult,
  registerPipelineTool,
  type ToolExecutionPipelineDefinition,
  type ToolExecutionPipelineInput,
  type ToolExecutionPipelineResult,
} from './tool-execution-pipeline.js';

export type ToolFamilyPipelineDefinition<
  TInput = unknown,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> = Omit<ToolExecutionPipelineDefinition<TInput, TOutput>, 'name' | 'responseMode' | 'execute'>;

export type ToolFamilyPipelineHandlerResult<
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> = TOutput | ToolExecutionPipelineResult<TOutput>;

export type ToolFamilyPipelineResult<
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> = ToolExecutionPipelineResult<TOutput>;

export interface ToolFamilyPipelineOptions<TInput, TOutput extends Record<string, unknown>> {
  readonly uiCard?: (
    result: ToolExecutionPipelineResult<TOutput>,
    input: ToolExecutionPipelineInput<TInput>,
  ) => UiCardContext | undefined;
}

export function parseStringToolPayload(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return body.startsWith('Error: ')
      ? { success: false, error: body.slice('Error: '.length) }
      : { message: body };
  }
}

export function createToolFamilyPipelineResult<TOutput extends Record<string, unknown>>(
  data: TOutput,
  metadata?: Record<string, unknown>,
  options: { readonly isError?: boolean } = {},
): ToolExecutionPipelineResult<TOutput> {
  return createToolExecutionResult(data, metadata, options);
}

export function createStringToolPipelineResult(
  body: string,
  options: { readonly isError?: boolean } = {},
): ToolExecutionPipelineResult<Record<string, unknown>> {
  return createToolFamilyPipelineResult(parseStringToolPayload(body), undefined, options);
}

export function registerToolFamilyPipelineTool<
  TInput = unknown,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
>(
  server: Server,
  context: SapMcpContext,
  name: string,
  definition: ToolFamilyPipelineDefinition<TInput, TOutput>,
  execute: (input: TInput) => Promise<ToolFamilyPipelineHandlerResult<TOutput>>,
  options: ToolFamilyPipelineOptions<TInput, TOutput> = {},
): void {
  registerPipelineTool(server, context, {
    name,
    ...definition,
    responseMode: 'data',
    uiCard: options.uiCard,
    execute: async ({ input }) => execute(input),
  });
}
