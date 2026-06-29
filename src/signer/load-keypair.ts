/**
 * Load keypair from file
 * 
 * WARNING: Only use in local-dev-keypair mode. NEVER in production.
 */

import { Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { logger } from '../core/logger.js';
import { SignerError } from '../core/errors.js';

/**
 * Load keypair from JSON file
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
 * Load keypair from environment variable (base58 encoded)
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
