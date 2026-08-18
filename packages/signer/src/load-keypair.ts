/**
 * @name signer/load-keypair
 * @description Loads Solana keypairs from filesystem or environment variables.
 *
 * WARNING: Only use in `local-dev-keypair` mode. NEVER in production.
 *
 * @flow
 *   1. `loadKeypairFromFile` reads a JSON keypair array from disk and constructs a `Keypair`.
 *   2. `loadKeypairFromEnv` reads a base58-encoded secret key from an environment variable.
 *
 * @module signer/load-keypair
 */

import { Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { logger } from '../../core/src/logger.js';
import { SignerError } from '../../core/src/errors.js';

/**
 * @name loadKeypairFromFile
 * @description Loads a Solana keypair from a JSON file on disk.
 *
 * @param walletPath — Filesystem path to the keypair JSON file (array of 64 bytes).
 * @returns A Solana `Keypair` constructed from the secret key.
 * @throws `SignerError` if the file cannot be read or parsed.
 *
 * @usedBy `local-keypair-signer.ts:createLocalKeypairSigner`, `sap-client-manager.ts:SapClientManager.initialize`
 */
export function loadKeypairFromFile(walletPath: string): Keypair {
  logger.debug('Loading keypair from file', { walletPath: '[REDACTED]' });
  
  try {
    const secretKeyString = readFileSync(walletPath, 'utf-8');
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    logger.error('Failed to load keypair', { error });
    throw new SignerError('Failed to load configured keypair');
  }
}

/**
 * @name loadKeypairFromEnv
 * @description Loads a Solana keypair from a base58-encoded environment variable.
 *
 * @param envVar — Name of the environment variable containing the base58-encoded secret key.
 * @returns A Solana `Keypair` constructed from the decoded secret key.
 * @throws `SignerError` if the environment variable is not set.
 *
 * @usedBy Signer initialization in environments where file-based keypairs are not available.
 */
export async function loadKeypairFromEnv(envVar: string): Promise<Keypair> {
  const secretKeyBase58 = process.env[envVar];
  
  if (!secretKeyBase58) {
    throw new SignerError(`Environment variable ${envVar} not set`);
  }
  
  // Decode base58 to bytes (ESM compatible)
  const bs58 = await import('bs58');
  const secretKey = Uint8Array.from(bs58.default.decode(secretKeyBase58));
  
  logger.debug('Loaded keypair from environment', { envVar, publicKey: Keypair.fromSecretKey(secretKey).publicKey.toBase58() });
  
  return Keypair.fromSecretKey(secretKey);
}