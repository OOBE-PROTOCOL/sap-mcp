/**
 * @module memory/auto-record
 * @description Automatic tool call recording hook.
 *
 * Wraps the MCP tool handler to automatically record every tool call in the
 * local memory database — no agent action required. The hook measures
 * latency, captures the outcome, and stores truncated input/output.
 *
 * The hook is designed to be non-blocking: if the memory DB is degraded or
 * the recording fails, the tool call proceeds normally. Recording errors
 * are logged but never propagated to the caller.
 */

import { toolCallStore } from './tool-call-store.js';
import { memoryDatabase } from './database.js';
import { logger } from '../core/logger.js';
import type { ToolCallOutcome } from './types.js';

/**
 * @name AutoRecordResult
 * @description Result of a tool call with metadata for recording.
 */
export interface AutoRecordResult {
  /** The original tool result text. */
  result: string;
  /** Whether the result indicates an error. */
  isError: boolean;
}

/**
 * @name recordToolCall
 * @description Records a tool call execution in the memory database.
 *
 * This function is called after every tool handler executes. It captures:
 * - toolName: the MCP tool name
 * - input: JSON-serialized input (truncated to 8KB)
 * - output: JSON-serialized output (truncated to 8KB)
 * - outcome: 'success' | 'error' | 'partial'
 * - latencyMs: wall-clock time from start to finish
 * - costUsd: estimated from the pricing tier (if available)
 * - txSignature: extracted from the output if present
 *
 * The function never throws — recording failures are logged and swallowed.
 *
 * @param toolName - The MCP tool name.
 * @param input - The raw input object passed to the tool.
 * @param output - The tool result text.
 * @param isError - Whether the tool returned an error.
 * @param latencyMs - Execution latency in milliseconds.
 * @param sessionId - Optional session identifier.
 * @param callerProfile - Optional signer profile.
 */
export function recordToolCall(
  toolName: string,
  input: unknown,
  output: string,
  isError: boolean,
  latencyMs: number,
  sessionId?: string,
  callerProfile?: string,
): void {
  // Skip recording for memory tools themselves — avoid infinite recursion.
  if (toolName.startsWith('sap_memory_') || toolName.startsWith('sap_audit_') || toolName.startsWith('sap_strategy_') || toolName.startsWith('sap_stream_')) {
    return;
  }

  // Skip if the memory database is degraded.
  if (memoryDatabase.isDegraded()) return;

  try {
    // Serialize input/output with truncation.
    const inputJson = safeStringify(input, 8192);
    const outputJson = safeStringify(output, 8192);

    // Determine outcome.
    const outcome: ToolCallOutcome = isError ? 'error' : determineOutcome(output);

    // Extract transaction signature from output if present.
    const txSignature = extractTxSignature(output);

    // Record in the database.
    toolCallStore.record({
      toolName,
      sessionId: sessionId ?? null,
      callerProfile: callerProfile ?? null,
      input: inputJson,
      output: outputJson,
      outcome,
      costUsd: null, // Cost is tracked by the x402 gate, not here.
      txSignature,
      latencyMs,
    });
  } catch (error) {
    // Never propagate recording errors — the tool call already succeeded.
    logger.debug('Auto-record failed', {
      toolName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * @name determineOutcome
 * @description Classifies the tool call outcome from the output text.
 * Checks for partial success indicators (e.g. "partial", "some failed", "retry").
 * @internal
 */
function determineOutcome(output: string): ToolCallOutcome {
  const lower = output.toLowerCase();
  if (lower.includes('"partial"') || lower.includes('"some failed"') || lower.includes('"retry-safe": false')) {
    return 'partial';
  }
  return 'success';
}

/**
 * @name extractTxSignature
 * @description Extracts a Solana transaction signature from the tool output.
 * Looks for common patterns like "signature": "..." or "txSignature": "...".
 * @internal
 */
function extractTxSignature(output: string): string | null {
  // Try JSON parsing first.
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (typeof parsed['signature'] === 'string') return parsed['signature'];
    if (typeof parsed['txSignature'] === 'string') return parsed['txSignature'];
    if (typeof parsed['transactionSignature'] === 'string') return parsed['transactionSignature'];
  } catch {
    // Not JSON — try regex.
  }

  // Regex fallback for base58 signatures (64-88 chars).
  const match = output.match(/\b[1-9A-HJ-NP-Za-km-z]{64,88}\b/);
  return match ? match[0] : null;
}

/**
 * @name safeStringify
 * @description Safely serializes a value to JSON with truncation.
 * Handles circular references and large objects.
 * @internal
 */
function safeStringify(value: unknown, maxBytes: number): string {
  try {
    const json = JSON.stringify(value);
    if (!json) return '';
    const buf = Buffer.from(json, 'utf-8');
    if (buf.length <= maxBytes) return json;
    return buf.subarray(0, maxBytes).toString('utf-8') + '...[truncated]';
  } catch {
    return String(value).slice(0, maxBytes);
  }
}