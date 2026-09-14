/**
 * @name tools/backpack/backpack-pipeline
 * @description Shared pipeline helpers for the Backpack tool family: response
 * compaction (30k char cap, 50-entry array cap, 500-char string cap with
 * base64 Solana transaction preservation, BigInt→string) and the
 * registerBackpackPipelineTool registration wrapper, mirroring the Phoenix
 * pattern.
 *
 * @module tools/backpack/backpack-pipeline
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { VersionedTransaction } from '@solana/web3.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import {
  createToolExecutionResult,
  registerPipelineTool,
  type ToolExecutionPipelineResult,
} from '../tool-execution-pipeline.js';

export type BackpackPipelineResult = ToolExecutionPipelineResult<Record<string, unknown>>;

export interface BackpackPipelineToolDefinition {
  readonly description: string;
  readonly inputSchema: unknown;
}

export function toBackpackRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { result: payload };
}

export function backpackPipelineOk(payload: unknown): BackpackPipelineResult {
  return createToolExecutionResult(compactBackpackResponse(toBackpackRecord(payload)), undefined);
}

export function backpackPipelineError(payload: Record<string, unknown>): BackpackPipelineResult {
  return createToolExecutionResult(payload, undefined, { isError: true });
}

/**
 * Cap Backpack tool responses at the gateway level to prevent context
 * explosion. `/api/v1/assets` alone is ~2.1MB and `/api/v1/securities`
 * ~500KB raw; large arrays are trimmed to the first N entries, large
 * strings truncated with a marker (except genuine Solana transactions,
 * which are the product of builder tools and must survive byte-for-byte).
 */
const MAX_BACKPACK_RESPONSE_CHARS = 30_000;
const MAX_BACKPACK_ARRAY_ENTRIES = 50;
const MAX_BACKPACK_STRING_CHARS = 500;

export function compactBackpackResponse(record: Record<string, unknown>): Record<string, unknown> {
  // Measure the upstream size BEFORE compaction: the cap exists to keep huge
  // upstream payloads from reaching clients, so it must trigger on the
  // original size even when per-field compaction shrinks the copy below it.
  let upstreamSize = 0;
  try {
    upstreamSize = JSON.stringify(record, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)).length;
  } catch {
    upstreamSize = Number.MAX_SAFE_INTEGER;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = compactBackpackValue(value, 0);
  }
  if (upstreamSize > MAX_BACKPACK_RESPONSE_CHARS) {
    return {
      ...result,
      _truncated: true,
      _originalSize: upstreamSize,
      _note: `Response capped at ${MAX_BACKPACK_RESPONSE_CHARS.toLocaleString('en-US')} chars (upstream ${upstreamSize.toLocaleString('en-US')} chars). The summary above contains the first ${MAX_BACKPACK_ARRAY_ENTRIES} entries. For full details on a specific market, use sap_backpack_get_market or sap_backpack_get_ticker with a symbol (e.g. SOL_USDC spot, SOL_USDC_PERP perp). Do NOT re-call the same list tool — the data will not change.`,
    };
  }
  return result;
}

function compactBackpackValue(value: unknown, depth: number): unknown {
  if (depth > 5) return '[max depth reached]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Unsigned transactions ARE the product of builder tools — truncating
    // them breaks every client-side finalize/preview flow. Only strings that
    // ACTUALLY deserialize as Solana transactions are preserved; everything
    // else (market data, logs, long base64 that isn't a tx) keeps the
    // context-protection truncation.
    if (isDeserializableTransaction(value)) return value;
    return value.length > MAX_BACKPACK_STRING_CHARS
      ? value.slice(0, MAX_BACKPACK_STRING_CHARS) + `… (+${value.length - MAX_BACKPACK_STRING_CHARS} chars)`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  // JSON.stringify throws on BigInt ("Do not know how to serialize a
  // BigInt"), which kills the whole tool response — convert to string
  // before it reaches stringify.
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    if (value.length > MAX_BACKPACK_ARRAY_ENTRIES) {
      return [
        ...value.slice(0, MAX_BACKPACK_ARRAY_ENTRIES).map((v) => compactBackpackValue(v, depth + 1)),
        `[+${value.length - MAX_BACKPACK_ARRAY_ENTRIES} more entries]`,
      ];
    }
    return value.map((v) => compactBackpackValue(v, depth + 1));
  }
  if (typeof value === 'object') {
    const compacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      compacted[k] = compactBackpackValue(v, depth + 1);
    }
    return compacted;
  }
  return value;
}

/**
 * True only when the string genuinely deserializes as a Solana transaction
 * (legacy or v0). Decoding — not shape-guessing — is the acceptance test, so
 * the gateway must apply the same bar before sparing a string from
 * truncation.
 */
function isDeserializableTransaction(value: string): boolean {
  if (value.length < 100 || value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length < 64) return false;
  try {
    VersionedTransaction.deserialize(Buffer.from(value, 'base64'));
    return true;
  } catch {
    return false;
  }
}

export function backpackPipelineException(error: string, err: unknown): BackpackPipelineResult {
  return backpackPipelineError({
    error,
    message: err instanceof Error ? err.message : 'Unknown error',
  });
}

export function registerBackpackPipelineTool<TInput extends Record<string, unknown>>(
  server: Server,
  context: SapMcpContext,
  name: string,
  definition: BackpackPipelineToolDefinition,
  handler: (args: TInput) => Promise<BackpackPipelineResult>,
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