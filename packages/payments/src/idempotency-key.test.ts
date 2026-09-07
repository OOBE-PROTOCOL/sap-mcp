/**
 * @file idempotency-key.test.ts
 * @description Regression tests for payer-scoped settlement idempotency keys (Finding 7).
 *
 * Solking disclosure 2026-09-07: the 5-minute settlement idempotency cache was
 * keyed on method+params only, so a second verified payment of the same call by
 * a DIFFERENT payer rode the first payer's settlement within the TTL window.
 *
 * @module payments/idempotency-key.test
 */

import { describe, expect, it } from 'vitest';
import { buildSettlementCacheKey } from './settlement-cache-key.js';

describe('buildSettlementCacheKey — payer-scoped idempotency (Finding 7 regression)', () => {
  const REQUEST_HASH = 'a'.repeat(64);

  it('produces different keys for different payers on the same request', () => {
    const a = buildSettlementCacheKey(REQUEST_HASH, 'PayerAAA1111111111111111111111111111111111');
    const b = buildSettlementCacheKey(REQUEST_HASH, 'PayerBBB2222222222222222222222222222222222');
    expect(a).not.toBe(b);
  });

  it('produces the same key for the same payer (retry idempotency preserved)', () => {
    const payer = 'PayerAAA1111111111111111111111111111111111';
    expect(buildSettlementCacheKey(REQUEST_HASH, payer)).toBe(buildSettlementCacheKey(REQUEST_HASH, payer));
  });

  it('undefined payer falls back to a deterministic marker key', () => {
    expect(buildSettlementCacheKey(REQUEST_HASH, undefined)).toBe(
      `${REQUEST_HASH}::unknown-payer`,
    );
  });

  it('empty-string payer is treated like unknown (no colliding empty suffix ambiguity)', () => {
    expect(buildSettlementCacheKey(REQUEST_HASH, '')).toBe(`${REQUEST_HASH}::unknown-payer`);
  });

  it('unknown-payer key never collides with a defined payer key', () => {
    const unknown = buildSettlementCacheKey(REQUEST_HASH, undefined);
    const defined = buildSettlementCacheKey(REQUEST_HASH, 'unknown-payer');
    expect(unknown).not.toBe(defined);
  });
});