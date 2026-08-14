/**
 * @name tools/tool-execution-pipeline
 * @description Opt-in execution pipeline for modular SAP MCP tools and trusted plugins.
 *
 * The compatibility layer still owns MCP transport normalization, allow-list,
 * private-key guards, policy checks, and metrics. This module gives individual
 * tool families a shared way to parse input, return structured success/error
 * envelopes, and attach execution metadata without repeating try/catch blocks.
 *
 * @module tools/tool-execution-pipeline
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { SapMcpContext } from '../../core/src/types.js';
import { createStructuredJsonResponse, createUiCardResponse } from '../../mcp-adapter/src/tool-response.js';
import { registerTool } from '../../mcp-adapter/src/sdk-compat.js';
import type { UiCardContext } from '../../ui-cards/src/ui-resources.js';
import { getToolExecutionMetadata, type ToolExecutionMetadata } from './tool-execution-metadata.js';

export interface SafeParseSuccess<TInput> {
  readonly success: true;
  readonly data: TInput;
}

export interface SafeParseFailure {
  readonly success: false;
  readonly error: unknown;
}

export interface ToolInputParser<TInput> {
  readonly safeParse: (input: unknown) => SafeParseSuccess<TInput> | SafeParseFailure;
}

export interface ToolExecutionPipelineInput<TInput> {
  readonly rawInput: unknown;
  readonly input: TInput;
  readonly context: SapMcpContext;
  readonly metadata: ToolExecutionMetadata;
}

export interface ToolExecutionPipelineResult<TOutput extends Record<string, unknown>> {
  readonly data: TOutput;
  readonly metadata?: Record<string, unknown>;
  readonly isError?: boolean;
  readonly pipelineResult?: true;
}

export interface ToolExecutionPipelineDefinition<TInput, TOutput extends Record<string, unknown>> {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: ToolInputParser<TInput> | Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
  readonly annotations?: ToolAnnotations;
  readonly _meta?: Record<string, unknown>;
  readonly responseMode?: 'envelope' | 'data';
  readonly uiCard?: (
    result: ToolExecutionPipelineResult<TOutput>,
    input: ToolExecutionPipelineInput<TInput>,
  ) => UiCardContext | undefined;
  readonly execute: (input: ToolExecutionPipelineInput<TInput>) => Promise<TOutput | ToolExecutionPipelineResult<TOutput>>;
}

export interface ToolExecutionEnvelope<TOutput extends Record<string, unknown> = Record<string, unknown>> {
  readonly [key: string]: unknown;
  readonly success: boolean;
  readonly toolName: string;
  readonly data?: TOutput;
  readonly metadata: {
    readonly intent: ToolExecutionMetadata['intent'];
    readonly paymentTier: ToolExecutionMetadata['paymentTier'];
    readonly writeOperation: boolean;
    readonly hostedAccountlessBlocked: boolean;
    readonly signerBoundary: string;
  } & Record<string, unknown>;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

function isParser<TInput>(value: unknown): value is ToolInputParser<TInput> {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { safeParse?: unknown }).safeParse === 'function';
}

function parseErrorDetails(error: unknown): unknown {
  if (error && typeof error === 'object' && 'issues' in error) {
    return (error as { issues?: unknown }).issues;
  }
  if (error instanceof Error) {
    return { name: error.name };
  }
  return undefined;
}

function parseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Tool input validation failed.';
}

function pipelineMetadata(metadata: ToolExecutionMetadata): ToolExecutionEnvelope['metadata'] {
  return {
    intent: metadata.intent,
    paymentTier: metadata.paymentTier,
    writeOperation: metadata.writeOperation,
    hostedAccountlessBlocked: metadata.hostedAccountlessBlocked,
    signerBoundary: metadata.signerBoundary,
  };
}

function normalizePipelineResult<TOutput extends Record<string, unknown>>(
  result: TOutput | ToolExecutionPipelineResult<TOutput>,
): ToolExecutionPipelineResult<TOutput> {
  if (
    result
    && typeof result === 'object'
    && 'data' in result
    && result.data
    && typeof result.data === 'object'
    && !Array.isArray(result.data)
    && (
      (result as ToolExecutionPipelineResult<TOutput>).pipelineResult === true
      || 'metadata' in result
    )
  ) {
    return result as ToolExecutionPipelineResult<TOutput>;
  }

  return { data: result as TOutput };
}

/**
 * @name createToolExecutionResult
 * @description Marks an execution result as an explicit pipeline result wrapper.
 */
export function createToolExecutionResult<TOutput extends Record<string, unknown>>(
  data: TOutput,
  metadata?: Record<string, unknown>,
  options: { readonly isError?: boolean } = {},
): ToolExecutionPipelineResult<TOutput> {
  return {
    pipelineResult: true,
    data,
    ...(metadata === undefined ? {} : { metadata }),
    ...(options.isError === undefined ? {} : { isError: options.isError }),
  };
}

/**
 * @name createToolExecutionEnvelope
 * @description Builds the structured success envelope returned by pipeline tools.
 */
export function createToolExecutionEnvelope<TOutput extends Record<string, unknown>>(
  toolName: string,
  data: TOutput,
  metadata: ToolExecutionMetadata,
  extraMetadata: Record<string, unknown> = {},
): ToolExecutionEnvelope<TOutput> {
  return {
    success: true,
    toolName,
    data,
    metadata: {
      ...pipelineMetadata(metadata),
      ...extraMetadata,
    },
  };
}

/**
 * @name createToolExecutionErrorEnvelope
 * @description Builds a structured application-level error envelope for pipeline tools.
 */
export function createToolExecutionErrorEnvelope(
  toolName: string,
  metadata: ToolExecutionMetadata,
  code: string,
  message: string,
  details?: unknown,
): ToolExecutionEnvelope {
  return {
    success: false,
    toolName,
    metadata: pipelineMetadata(metadata),
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

/**
 * @name registerPipelineTool
 * @description Registers a modular tool with shared input validation and response envelopes.
 */
export function registerPipelineTool<TInput, TOutput extends Record<string, unknown>>(
  server: Server,
  context: SapMcpContext,
  definition: ToolExecutionPipelineDefinition<TInput, TOutput>,
): void {
  const metadata = getToolExecutionMetadata(definition.name, definition.title ?? definition.name);

  registerTool(
    server,
    definition.name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      annotations: definition.annotations,
      _meta: definition._meta,
    },
    async (rawInput: unknown) => {
      let input = rawInput as TInput;

      if (isParser<TInput>(definition.inputSchema)) {
        const parsed = definition.inputSchema.safeParse(rawInput);
        if (!parsed.success) {
          const envelope = createToolExecutionErrorEnvelope(
            definition.name,
            metadata,
            'invalid_input',
            parseErrorMessage(parsed.error),
            parseErrorDetails(parsed.error),
          );
          return createStructuredJsonResponse(envelope, { isError: true });
        }
        input = parsed.data;
      }

      try {
        const executionInput = {
          rawInput,
          input,
          context,
          metadata,
        };
        const result = normalizePipelineResult(await definition.execute(executionInput));
        const payload = definition.responseMode === 'data'
          ? result.data
          : createToolExecutionEnvelope(
            definition.name,
            result.data,
            metadata,
            result.metadata,
          );
        const uiCard = definition.uiCard?.(result, executionInput);
        if (uiCard) {
          return createUiCardResponse(payload, uiCard, { isError: result.isError });
        }
        return createStructuredJsonResponse(payload, { isError: result.isError });
      } catch (error) {
        const envelope = createToolExecutionErrorEnvelope(
          definition.name,
          metadata,
          'execution_failed',
          error instanceof Error ? error.message : 'Tool execution failed.',
          error instanceof Error ? { name: error.name } : undefined,
        );
        return createStructuredJsonResponse(envelope, { isError: true });
      }
    },
  );
}
