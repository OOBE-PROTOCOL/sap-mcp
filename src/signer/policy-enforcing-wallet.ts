/**
 * @name signer/policy-enforcing-wallet
 * @description Wallet adapter that enforces the configured SOL spending policy
 *   before signing any transaction.
 *
 * Every SAP SDK tool that writes on-chain (agent register/update/close, escrow
 * V2, staking, swaps) signs through the `SapClient` wallet. The SDK modules do
 * not expose pre-sign transaction builders, so the only central, low-risk
 * interception point is the wallet `signTransaction` method used by the
 * underlying Anchor provider. Wrapping the wallet here applies the spending
 * limit (`maxTxValueSol`, `requireApprovalAboveSol`) to ALL local-signer SDK
 * tools without patching each one.
 *
 * If no policy engine is provided the wallet delegates straight to the wrapped
 * signer, preserving current behavior for hosted/delegated modes.
 *
 * @module signer/policy-enforcing-wallet
 */

import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { logger } from '../core/logger.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import { estimateNativeTransfer } from '../tools/transaction-tools.js';

/** Minimal signer surface required by the SAP SDK wallet interface. */
export interface SignerWallet {
  readonly publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

/**
 * @name PolicyEnforcingWallet
 * @description Wraps a signer wallet and enforces the transaction-value policy
 *   before delegating the actual signature.
 */
export class PolicyEnforcingWallet implements SignerWallet {
  readonly publicKey: PublicKey;
  private readonly wrapped: SignerWallet;
  private readonly policyEngine?: PolicyEngine;
  private readonly toolName: string;

  /**
   * @param wrapped    — The underlying wallet/signer that performs the real signature.
   * @param policyEngine — Policy engine used to evaluate transaction:submit. When
   *   omitted, enforcement is skipped (delegated modes / disabled policy).
   * @param toolName    — Tool name reported to the policy engine for audit context.
   */
  constructor(
    wrapped: SignerWallet,
    policyEngine?: PolicyEngine,
    toolName = 'sap_sdk_local_signer'
  ) {
    this.wrapped = wrapped;
    this.publicKey = wrapped.publicKey;
    this.policyEngine = policyEngine;
    this.toolName = toolName;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    await this.assertPolicy(tx);
    return this.wrapped.signTransaction(tx);
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    for (const tx of txs) {
      await this.assertPolicy(tx);
    }
    return this.wrapped.signAllTransactions(txs);
  }

  /**
   * @name assertPolicy
   * @description Estimates the native SOL value moved by the transaction and asks
   *   the policy engine for permission before signing.
   *
   * Zero-SOL transactions (e.g. pure metadata updates) are allowed without a
   * policy lookup because they carry no spend risk.
   */
  private async assertPolicy(tx: Transaction | VersionedTransaction): Promise<void> {
    if (!this.policyEngine) {
      return;
    }

    const nativeTransfer = estimateNativeTransfer(tx, this.publicKey);
    if (nativeTransfer.sol <= 0) {
      return;
    }

    const decision = await this.policyEngine.checkPermission('transaction:submit', {
      amountSol: nativeTransfer.sol,
      toolName: this.toolName,
    });

    if (!decision.allowed) {
      logger.warn('Transaction signing blocked by spending policy', {
        toolName: this.toolName,
        amountSol: nativeTransfer.sol,
        reason: decision.reason,
      });
      throw new Error(
        decision.reason ||
          `Transaction moving ${nativeTransfer.sol} SOL is blocked by spending policy`
      );
    }
  }
}
