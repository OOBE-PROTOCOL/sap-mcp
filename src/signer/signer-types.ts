/**
 * Signer type definitions
 */

import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { SapAgentSession } from '../core/types.js';

/**
 * Signer interface
 */
export interface Signer {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
}

/**
 * Signer mode
 */
export type SignerMode = 'none' | 'local-keypair' | 'external' | 'delegated';

/**
 * Signer configuration
 */
export interface SignerConfig {
  mode: SignerMode;
  walletPath?: string;
  externalSignerUrl?: string;
  delegatedSession?: SapAgentSession; // Session-based delegated signing
}

/**
 * Signer result
 */
export interface SignerResult {
  signer?: Signer;
  mode: SignerMode;
  publicKey?: string;
}
