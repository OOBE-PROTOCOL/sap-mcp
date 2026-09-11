/**
 * Regression: Phoenix stats rows carry BigInt fields (e.g. timestamp_ms).
 * compactPhoenixResponse must convert them to strings BEFORE JSON.stringify —
 * a raw BigInt reaching stringify throws
 * "Do not know how to serialize a BigInt" and kills the entire tool response
 * (2026-09-11 user report: sap_phoenix_get_markets failed, then the model
 * called get_market with symbol=undefined → /market/undefined 404 cascade).
 */
import { describe, expect, it } from 'vitest';

import { compactPhoenixResponse } from './phoenix-pipeline.js';

describe('compactPhoenixResponse BigInt serialization', () => {
  it('converts BigInt fields to strings instead of throwing', () => {
    const record = {
      markets: [
        {
          symbol: 'SOL-PERP',
          mark_price: 148.23,
          timestamp_ms: 1789107097000n, // raw BigInt from Phoenix stats
        },
      ],
    };

    const result = compactPhoenixResponse(record);
    expect((result.markets as Array<Record<string, unknown>>)[0]?.timestamp_ms).toBe('1789107097000');
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('handles BigInt nested inside stats arrays and objects', () => {
    const record = {
      stats: {
        rows: [{ ts: 1n }, { inner: { deep: 42n } }],
      },
      total: 999n,
    };

    const result = compactPhoenixResponse(record);
    expect(() => JSON.stringify(result)).not.toThrow();
    const rows = (result.stats as { rows: Array<Record<string, unknown>> }).rows;
    expect(rows[0]?.ts).toBe('1');
    expect((rows[1]?.inner as { deep: string }).deep).toBe('42');
    expect(result.total).toBe('999');
  });

  it('leaves numbers, strings, and transaction strings untouched', () => {
    const tx = Buffer.alloc(200, 7).toString('base64');
    const record = {
      count: 5,
      note: 'ok',
      transaction: tx,
    };
    const result = compactPhoenixResponse(record);
    expect(result.count).toBe(5);
    expect(result.note).toBe('ok');
  });
});