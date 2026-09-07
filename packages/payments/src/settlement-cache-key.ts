/**
 * @name payments/settlement-cache-key
 * @description Payer-scoped cache key construction for x402 settlement idempotency.
 *
 * Solking disclosure 2026-09-07 (Finding 7): the settlement idempotency cache
 * was keyed by the canonical request hash (JSON-RPC method + params) only. A
 * second caller presenting a DIFFERENT verified payment for the same call
 * within the 5-minute TTL rode the first payer's settlement. Keys MUST be
 * scoped by payer so each payer's settlement is cached independently.
 *
 * @module payments/settlement-cache-key
 */

/**
 * @description Marker used when the facilitator did not report a payer address
 * on the verify/settle response. Chosen so it can never collide with a real
 * payer key (real payers are wrapped in `payer:<addr>` segments).
 */
const UNKNOWN_PAYER_SEGMENT = 'unknown-payer';

/**
 * @name buildSettlementCacheKey
 * @description Build the settlement idempotency cache key for a verified
 * payment, scoped by payer address.
 *
 * @param requestHash - Canonical request hash (JSON-RPC method + params).
 * @param payer       - Payer address reported by the facilitator, if any.
 * @returns Cache key unique to (request, payer) pairs.
 */
export function buildSettlementCacheKey(requestHash: string, payer: string | undefined): string {
  if (!payer || payer.trim().length === 0) {
    return `${requestHash}::${UNKNOWN_PAYER_SEGMENT}`;
  }
  return `${requestHash}::payer:${payer}`;
}