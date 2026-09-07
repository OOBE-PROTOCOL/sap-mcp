/**
 * @name payments/json-rpc-error
 * @description Structured JSON-RPC / MCP error detection for settlement gating.
 *
 * Solking disclosure 2026-09-07 (Finding 6): the previous implementation
 * substring-matched `"error"` inside tool output text, so ANY paid tool whose
 * JSON output contained `"error":null` had its settlement skipped while the
 * buffered HTTP 200 still reached the client — a free-call bypass for funded
 * wallets. This module replaces that heuristic with structured checks only:
 *
 *   1. JSON-RPC error object:  { "error": { "code": ... } }
 *   2. JSON-RPC string error:  { "error": "..." }
 *   3. MCP tool-level flag:    { "result": { ..., "isError": true } }
 *   4. MCP content-item flag:  { "result": { "content": [ { "isError": true } ] } }
 *
 * Nothing else counts as an error. Text that merely contains the word
 * "error" (or `"error":null` inside a nested JSON string) is successful
 * output and MUST be settled.
 *
 * @module payments/json-rpc-error
 */

/**
 * @name isJsonRpcError
 * @description Decide whether a buffered JSON-RPC/MCP response body represents
 * a failed call using STRUCTURED fields only — never substring heuristics.
 *
 * @param body - The buffered HTTP response body.
 * @returns True only when a structured error shape is present.
 */
export function isJsonRpcError(body: Buffer): boolean {
  try {
    const text = body.toString('utf-8');
    if (!text) return false;

    const parsed = JSON.parse(text) as unknown;
    if (parsed === null || typeof parsed !== 'object') return false;

    if ('error' in parsed) {
      const error = (parsed as Record<string, unknown>)['error'];
      // JSON-RPC error: { "error": { "code": ..., "message": ... } }
      if (typeof error === 'object' && error !== null && 'code' in error) {
        return true;
      }
      // Some MCP responses use a plain string error field.
      if (typeof error === 'string' && error.length > 0) {
        return true;
      }
    }

    if ('result' in parsed) {
      const result = (parsed as Record<string, unknown>)['result'];
      if (typeof result !== 'object' || result === null) return false;
      const record = result as Record<string, unknown>;

      // MCP tool result: { "result": { "content": [...], "isError": true } }
      if ('isError' in record) {
        return record['isError'] === true;
      }

      // Per-item structured flag inside the content array.
      if (Array.isArray(record['content'])) {
        for (const item of record['content']) {
          if (typeof item === 'object' && item !== null && 'isError' in item) {
            return (item as Record<string, unknown>)['isError'] === true;
          }
        }
      }
    }

    return false;
  } catch {
    // Not JSON — can't determine, don't block settlement.
    return false;
  }
}