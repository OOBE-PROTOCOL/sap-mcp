/**
 * @file is-json-rpc-error.test.ts
 * @description Regression tests for structured JSON-RPC error detection (Finding 6).
 *
 * Solking disclosure 2026-09-07: settlement was skipped whenever tool output text
 * contained the substring "error" (e.g. `{"error":null}` in valid JSON), leaving
 * the payment authorization unconsumed while the buffered 200 reached the client.
 * The fix: only STRUCTURED error shapes count as errors.
 *
 * @module payments/is-json-rpc-error.test
 */

import { describe, expect, it } from 'vitest';
import { isJsonRpcError } from './json-rpc-error.js';

function body(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf-8');
}

describe('isJsonRpcError — structured detection (Finding 6 regression)', () => {
  it('detects JSON-RPC error objects with a code', () => {
    expect(isJsonRpcError(body({ error: { code: -32603, message: 'x' } }))).toBe(true);
  });

  it('detects string-valued error fields', () => {
    expect(isJsonRpcError(body({ error: 'something failed' }))).toBe(true);
  });

  it('does NOT treat error:null as an error (the reported bypass)', () => {
    expect(isJsonRpcError(body({ result: { content: [{ text: '{"error":null,"data":42}' }] } }))).toBe(false);
    expect(isJsonRpcError(body({ result: { content: [{ text: '{"error":null,"price":123}' }] } }))).toBe(false);
  });

  it('does NOT flag output that merely mentions the word error', () => {
    expect(isJsonRpcError(body({ result: { content: [{ text: 'Pyth API error: 400 (recovered)' }] } }))).toBe(false);
    expect(isJsonRpcError(body({ result: { content: [{ text: 'no errors here' }] } }))).toBe(false);
  });

  it('detects MCP isError:true on the result object', () => {
    expect(isJsonRpcError(body({ result: { content: [], isError: true } }))).toBe(true);
  });

  it('ignores isError:false', () => {
    expect(isJsonRpcError(body({ result: { content: [], isError: false } }))).toBe(false);
  });

  it('detects isError:true on individual content items', () => {
    expect(isJsonRpcError(body({ result: { content: [{ isError: true, text: 'boom' }] } }))).toBe(true);
  });

  it('no longer flags the legacy "Error:" text prefix (substring matching removed)', () => {
    expect(isJsonRpcError(body({ result: { content: [{ text: 'Error: legacy substring behavior' }] } }))).toBe(false);
  });

  it('returns false for successful tool output', () => {
    expect(isJsonRpcError(body({ result: { content: [{ text: 'ok data' }] } }))).toBe(false);
  });

  it('returns false for non-JSON bodies and empty bodies', () => {
    expect(isJsonRpcError(Buffer.from('plain text not json', 'utf-8'))).toBe(false);
    expect(isJsonRpcError(Buffer.alloc(0))).toBe(false);
  });

  it('returns false for JSON primitives (null, number, string)', () => {
    expect(isJsonRpcError(body(null))).toBe(false);
    expect(isJsonRpcError(body(42))).toBe(false);
    expect(isJsonRpcError(Buffer.from('"just a string"', 'utf-8'))).toBe(false);
  });
});