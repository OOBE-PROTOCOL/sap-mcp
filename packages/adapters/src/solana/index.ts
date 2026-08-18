/**
 * @name adapters/solana/index
 * @description Barrel export for the Solana adapter subsystem.
 *
 * Re-exports connection creation, public key parsing, and commitment
 * validation utilities.
 *
 * @module adapters/solana/index
 */

export { createConnection } from './connection.js';
export { parsePublicKey } from './public-key.js';
export { getCommitment } from './commitment.js';
