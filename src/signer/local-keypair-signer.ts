/**
 * Local keypair signer (for development only)
 * 
 * WARNING: NEVER use in production or hosted environments.
 */

import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { logger } from '../core/logger.js';
import { loadKeypairFromFile } from './load-keypair.js';
import type { Signer } from './signer-types.js';

/**
 * Create local keypair signer
 */
export function createLocalKeypairSigner(walletPath: string): Signer {
  logger.info('Creating local keypair signer', { walletPath: '[REDACTED]' });
  
  const keypair = loadKeypairFromFile(walletPath);
  
  logger.warn('Local keypair signer created - DO NOT USE IN PRODUCTION');
  
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
