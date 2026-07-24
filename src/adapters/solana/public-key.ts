/**
 * @name adapters/solana/public-key
 * @description Solana public key parsing utility.
 *
 * @module adapters/solana/public-key
 */

import { PublicKey } from '@solana/web3.js';

/**
 * @name parsePublicKey
 * @description Parses a string into a Solana `PublicKey` instance.
 *
 * @param value — The base58-encoded public key string.
 * @returns A `PublicKey` instance from `@solana/web3.js`.
 *
 * @usedBy `adapters/solana/index.ts`, tool handlers
 */
export function parsePublicKey(value: string): PublicKey {
  return new PublicKey(value);
}
