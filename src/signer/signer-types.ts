/**
 * @name signer/signer-types
 * @description Core type definitions for the SAP MCP signer subsystem.
 *
 * Defines the `Signer` interface, signer modes, signer configuration, and the
 * result of signer resolution. These types flow through the signer resolver,
 * local keypair signer, and external signer modules.
 *
 * @flow
 *   1. `signer-resolver.ts` uses `SignerResult` to return the resolved signer.
 *   2. `local-keypair-signer.ts` and `external-signer.ts` implement the `Signer` interface.
 *   3. `signer/index.ts` re-exports all types for external consumers.
 *
 * @module signer/signer-types
 */

import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { SapAgentSession } from '../core/types.js';

/**
 * @name Signer
 * @description Interface for signing Solana transactions in the SAP MCP runtime.
 *
 * @property publicKey           — The signer's Solana public key.
 * @property signTransaction     — Signs a single transaction (legacy or versioned).
 * @property signAllTransactions — Signs multiple transactions in batch.
 *
 * @usedBy `local-keypair-signer.ts`, `external-signer.ts`, `core/types.ts:SapMcpContext`
 */
export interface Signer {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
}

/**
 * @name SignerMode
 * @description The operational mode of the signer in the SAP MCP runtime.
 *
 * - `none`           — Read-only mode, no signing capability.
 * - `local-keypair`  — Local hot-key signer loaded from disk.
 * - `external`       — External signer reached over HTTP.
 * - `delegated`      — Session-bound delegated signer (resolved per-session).
 *
 * @usedBy `SignerConfig.mode`, `SignerResult.mode`, `signer-resolver.ts`
 */
export type SignerMode = 'none' | 'local-keypair' | 'external' | 'delegated';

/**
 * @name SignerConfig
 * @description Configuration for constructing a signer instance.
 *
 * @property mode             — The signer operational mode.
 * @property walletPath       — Optional filesystem path to a local keypair file.
 * @property externalSignerUrl — Optional URL for an external signer service.
 * @property delegatedSession — Optional session for delegated signing.
 *
 * @usedBy Signer construction logic across the signer module.
 */
export interface SignerConfig {
  mode: SignerMode;
  walletPath?: string;
  externalSignerUrl?: string;
  delegatedSession?: SapAgentSession; // Session-based delegated signing
}

/**
 * @name SignerResult
 * @description Result of resolving a signer from configuration.
 *
 * @property signer     — The resolved `Signer` instance (absent when mode is `none`).
 * @property mode       — The resolved signer mode.
 * @property publicKey  — Optional base58-encoded public key of the signer.
 *
 * @usedBy `signer-resolver.ts:resolveSigner`, `create-server.ts:createSapMcpServer`
 */
export interface SignerResult {
  signer?: Signer;
  mode: SignerMode;
  publicKey?: string;
}