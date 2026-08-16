/**
 * @name signer/policy-enforcing-wallet
 * @description Wallet adapter that enforces the configured value-movement policy
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
import { logger } from '../../core/src/logger.js';
import type { SapPolicyEngine } from '../../core/src/types.js';
import {
  estimateTransactionValue,
  explicitApprovalRiskPolicyReason,
  tokenTransferPolicyReason,
} from '../../tools/src/transaction-tools.js';

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
  private readonly policyEngine?: SapPolicyEngine;
  private readonly toolName: string;
  private readonly sapProgramId?: string;

  /**
   * @param wrapped    — The underlying wallet/signer that performs the real signature.
   * @param policyEngine — Policy engine used to evaluate transaction:submit. When
   *   omitted, enforcement is skipped (delegated modes / disabled policy).
   * @param toolName    — Tool name reported to the policy engine for audit context.
   * @param sapProgramId — Configured SAP program id allowed for SDK metadata writes.
   */
  constructor(
    wrapped: SignerWallet,
    policyEngine?: SapPolicyEngine,
    toolName = 'sap_sdk_local_signer',
    sapProgramId?: string,
  ) {
    this.wrapped = wrapped;
    this.publicKey = wrapped.publicKey;
    this.policyEngine = policyEngine;
    this.toolName = toolName;
    this.sapProgramId = sapProgramId;
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
   * @description Estimates value moved by the transaction and asks the policy
   *   engine for permission before signing.
   *
   * Zero-value transactions (e.g. pure metadata updates) are allowed without a
   * policy lookup. Token transfers require an explicit approval path because
   * their SOL-equivalent value cannot be safely inferred without a price oracle.
   */
  private async assertPolicy(tx: Transaction | VersionedTransaction): Promise<void> {
    if (!this.policyEngine) {
      return;
    }

    const valueEstimate = estimateTransactionValue(
      tx,
      this.publicKey,
      this.sapProgramId ? { config: { programId: this.sapProgramId } } : undefined,
    );
    if (valueEstimate.tokenTransfers.length > 0) {
      const reason = tokenTransferPolicyReason(valueEstimate);
      logger.warn('Transaction signing blocked by token transfer policy', {
        toolName: this.toolName,
        tokenTransferCount: valueEstimate.tokenTransfers.length,
        reason,
      });
      throw new Error(reason);
    }
    if (valueEstimate.explicitApprovalRisks.length > 0) {
      const reason = explicitApprovalRiskPolicyReason(valueEstimate);
      logger.warn('Transaction signing blocked by explicit approval policy', {
        toolName: this.toolName,
        explicitApprovalRiskCount: valueEstimate.explicitApprovalRisks.length,
        reason,
      });
      throw new Error(reason);
    }

    const { nativeTransfer } = valueEstimate;
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
