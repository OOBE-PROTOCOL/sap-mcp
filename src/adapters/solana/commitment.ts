/**
 * @name adapters/solana/commitment
 * @description Solana commitment level validation and normalization.
 *
 * @module adapters/solana/commitment
 */

import type { Commitment } from '@solana/web3.js';

/**
 * @name getCommitment
 * @description Parses and validates a commitment level string.
 *
 * Falls back to `'confirmed'` when the input is not one of the valid
 * Solana commitment levels (`'processed'`, `'confirmed'`, `'finalized'`).
 *
 * @param value — The commitment level string to validate.
 * @returns A valid `Commitment` value from `@solana/web3.js`.
 *
 * @usedBy `adapters/solana/index.ts`, config pipeline
 */
export function getCommitment(value: string): Commitment {
  const valid = ['processed', 'confirmed', 'finalized'];
  if (!valid.includes(value)) {
    return 'confirmed';
  }
  return value as Commitment;
}
