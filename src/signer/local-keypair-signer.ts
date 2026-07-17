/**
 * Local keypair signer.
 * 
 * WARNING: This is a local hot-key signer. The hosted SAP MCP server never
 * receives keypair bytes, but production custody should prefer an external
 * signer, hardware wallet, delegated session, or a tightly capped profile.
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
  
  logger.warn('Local hot-key signer created', {
    custody: 'user-local',
    secretMaterial: 'never-exposed-to-hosted-server',
    recommendation: 'Use external signer, hardware wallet, or capped profile for production/value funds.',
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
