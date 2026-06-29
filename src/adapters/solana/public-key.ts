/**
 * Parse public key
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Executes the parse public key operation.
 */
export function parsePublicKey(value: string): PublicKey {
  return new PublicKey(value);
}
