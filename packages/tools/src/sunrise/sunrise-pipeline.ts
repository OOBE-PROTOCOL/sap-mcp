/**
 * @name tools/sunrise/sunrise-pipeline
 * @description Shared pipeline helpers for the Sunrise tool family. Mirrors
 *   the Phoenix/Backpack pipeline: compacted responses, structured errors,
 *   and transaction strings preserved byte-for-byte.
 *
 * @module tools/sunrise/sunrise-pipeline
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import {
  createToolExecutionResult,
  registerPipelineTool,
  type ToolExecutionPipelineResult,
} from '../tool-execution-pipeline.js';

export type SunrisePipelineResult = ToolExecutionPipelineResult<Record<string, unknown>>;

export interface SunrisePipelineToolDefinition {
  readonly description: string;
  readonly inputSchema: unknown;
}

/** Maximum characters of a compacted Sunrise tool response. */
const MAX_SUNRISE_RESPONSE_CHARS = 30_000;

/** Maximum entries kept in a compacted array. */
const MAX_SUNRISE_ARRAY_ENTRIES = 50;

/** Maximum characters kept from a single string value. */
const MAX_SUNRISE_STRING_CHARS = 500;

/**
 * True only when the string genuinely deserializes as a Solana transaction.
 * Unsigned/signed transactions are the product of quote tools — truncating
 * them breaks every client-side signing flow.
 */
function isDeserializableTransaction(value: string): boolean {
  if (value.length < 100 || value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length < 64) return false;
  try {
    VersionedTransaction.deserialize(decoded);
    return true;
  } catch {
    try {
      Transaction.from(decoded);
      return true;
    } catch {
      return false;
    }
  }
}

/** JSON size measurement tolerant of BigInt values. */
function safeJsonSize(payload: unknown): number {
  try {
    return JSON.stringify(payload, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function compactSunriseValue(value: unknown, depth: number): unknown {
  if (depth > 5) return '[max depth reached]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (isDeserializableTransaction(value)) return value;
    return value.length > MAX_SUNRISE_STRING_CHARS
      ? `${value.slice(0, MAX_SUNRISE_STRING_CHARS)}… (+${value.length - MAX_SUNRISE_STRING_CHARS} chars)`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    if (value.length > MAX_SUNRISE_ARRAY_ENTRIES) {
      return [
        ...value.slice(0, MAX_SUNRISE_ARRAY_ENTRIES).map((v) => compactSunriseValue(v, depth + 1)),
        `[+${value.length - MAX_SUNRISE_ARRAY_ENTRIES} more entries]`,
      ];
    }
    return value.map((v) => compactSunriseValue(v, depth + 1));
  }
  if (typeof value === 'object') {
    const compacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      compacted[k] = compactSunriseValue(v, depth + 1);
    }
    return compacted;
  }
  return value;
}

/** Narrows arbitrary payloads into a record for the pipeline envelope. */
export function toSunriseRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { result: payload };
}

/**
 * @name compactSunriseResponse
 * @description Caps upstream payloads (50-entry arrays, 500-char strings,
 *   30k total measured on the upstream size) while preserving transaction
 *   base64 verbatim. Marks the payload with _truncated/_originalSize/_note.
 */
export function compactSunriseResponse(record: Record<string, unknown>): Record<string, unknown> {
  const upstreamSize = safeJsonSize(record);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = compactSunriseValue(value, 0);
  }
  if (upstreamSize > MAX_SUNRISE_RESPONSE_CHARS) {
    return {
      ...result,
      _truncated: true,
      _originalSize: upstreamSize,
      _note: `Response capped at ${MAX_SUNRISE_RESPONSE_CHARS.toLocaleString('en-US')} chars (upstream ${upstreamSize.toLocaleString('en-US')} chars). Use targeted filters (assetClass, symbol) instead of repeating this call.`,
    };
  }
  return result;
}

/** Builds a structured success pipeline result. */
export function sunrisePipelineOk(payload: unknown): SunrisePipelineResult {
  return createToolExecutionResult(compactSunriseResponse(toSunriseRecord(payload)), undefined);
}

/** Builds a structured error pipeline result. */
export function sunrisePipelineError(payload: Record<string, unknown>): SunrisePipelineResult {
  return createToolExecutionResult(payload, undefined, { isError: true });
}

/** Maps an exception into a structured error envelope. */
export function sunrisePipelineException(error: string, err: unknown): SunrisePipelineResult {
  return sunrisePipelineError({
    error,
    message: err instanceof Error ? err.message : 'Unknown error',
  });
}

/**
 * @name registerSunrisePipelineTool
 * @description Registers a Sunrise tool through the shared execution
 *   pipeline (responseMode 'data', compacted results).
 */
export function registerSunrisePipelineTool<TInput extends Record<string, unknown>>(
  server: Server,
  context: SapMcpContext,
  name: string,
  definition: SunrisePipelineToolDefinition,
  handler: (args: TInput) => Promise<SunrisePipelineResult>,
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