/**
 * Get commitment level
 */

import type { Commitment } from '@solana/web3.js';

/**
 * Executes the get commitment operation.
 */
export function getCommitment(value: string): Commitment {
  const valid = ['processed', 'confirmed', 'finalized'];
  if (!valid.includes(value)) {
    return 'confirmed';
  }
  return value as Commitment;
}
