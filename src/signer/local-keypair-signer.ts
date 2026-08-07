/**
 * @name signer/local-keypair-signer
 * @description Local profile signer for local-dev-keypair mode.
 *
 * The hosted SAP MCP server never receives keypair bytes. Agents receive a
 * signer capability through sap_payments tools, not direct keypair access.
 * Production value flows should use a dedicated capped profile, external
 * signer, hardware wallet, or delegated session policy.
 *
 * @flow
 *   1. `createLocalKeypairSigner` loads a keypair from file via `loadKeypairFromFile`.
 *   2. Returns a `Signer` object with `publicKey`, `signTransaction`, and `signAllTransactions`
 *      that sign transactions locally using the loaded keypair.
 *
 * @module signer/local-keypair-signer
 */

import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { logger } from '../core/logger.js';
import { loadKeypairFromFile } from './load-keypair.js';
import type { Signer } from './signer-types.js';

/**
 * @name createLocalKeypairSigner
 * @description Creates a local `Signer` backed by a keypair loaded from disk.
 *
 * @param walletPath — Filesystem path to the keypair JSON file.
 * @returns A `Signer` implementation that signs `Transaction` and `VersionedTransaction` objects locally.
 *
 * @usedBy `signer-resolver.ts:resolveSigner` when mode is `local-keypair`.
 */
export function createLocalKeypairSigner(walletPath: string): Signer {
  logger.info('Resolving local SAP profile signer', { walletPath: '[REDACTED]' });
  
  const keypair = loadKeypairFromFile(walletPath);
  
  logger.info('Local SAP profile signer ready', {
    custody: 'user-local',
    signerAccess: 'capability-only',
    secretMaterial: 'never-exposed-to-hosted-server',
    recommendation: 'Use a dedicated capped profile or external signer for production/value funds.',
  });
  
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx) => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
      } else if (tx instanceof Transaction) {
        tx.partialSign(keypair);
      } else {
        throw new Error('Unsupported transaction type');
      }
      return tx;
    },
    signAllTransactions: async (txs) => {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) {
          tx.sign([keypair]);
        } else if (tx instanceof Transaction) {
          tx.partialSign(keypair);
        } else {
          throw new Error('Unsupported transaction type');
        }
      }
      return txs;
    },
  };
}
