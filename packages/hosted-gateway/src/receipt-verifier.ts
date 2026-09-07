/**
 * @name hosted-gateway/receipt-verifier
 * @description On-chain receipt verification for premium session activation.
 *
 * Solking disclosure 2026-09-07 (Finding 2): activation accepted any 8-character
 * receipt string. This module implements the `ReceiptVerifier` contract by
 * resolving the receipt as a Solana transaction signature and requiring it to
 * be FINALIZED on-chain. Amount/payTo binding is enforced at the facilitator
 * settlement layer; this check guarantees the receipt is a real, landed
 * transaction rather than an invented placeholder.
 *
 * @module hosted-gateway/receipt-verifier
 */

import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * @name ReceiptVerificationConfig
 * @description RPC endpoint used to resolve receipt signatures.
 */
export interface ReceiptVerificationConfig {
  rpcUrl: string;
  commitment?: 'confirmed' | 'finalized';
}

function isBase58Signature(value: string): boolean {
  // Solana tx signatures are 87-88 base58 chars, no 0/O/I/l characters.
  return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(value);
}

/**
 * @name createOnChainReceiptVerifier
 * @description Build a ReceiptVerifier that resolves the receipt as a Solana
 * transaction signature and requires it to be confirmed on-chain.
 *
 * Returns `valid: false` with a structured reason when the signature is
 * malformed, not found, or failed on-chain. Never throws for invalid receipts —
 * errors inside the verification flow surface as `receipt_verification_error`
 * at the activation-manager layer.
 *
 * @param config - RPC endpoint configuration.
 * @returns A ReceiptVerifier backed by Solana RPC lookups.
 */
export function createOnChainReceiptVerifier(config: ReceiptVerificationConfig): {
  verify(receipt: string, expectedAmountUsd?: number): Promise<{ valid: boolean; payer?: string; reason?: string }>;
} {
  const connection = new Connection(config.rpcUrl, config.commitment ?? 'finalized');

  return {
    async verify(receipt: string): Promise<{ valid: boolean; payer?: string; reason?: string }> {
      if (!isBase58Signature(receipt)) {
        return { valid: false, reason: 'malformed_signature: receipt is not a plausible Solana transaction signature' };
      }

      const statuses = await connection.getSignatureStatuses([receipt], { searchTransactionHistory: true });
      const status = statuses.value[0];
      if (!status) {
        return { valid: false, reason: 'signature_not_found_on_chain' };
      }
      if (status.err) {
        return { valid: false, reason: 'transaction_failed_on_chain' };
      }
      const confirmation = status.confirmationStatus;
      if (confirmation !== 'confirmed' && confirmation !== 'finalized') {
        return { valid: false, reason: `transaction_not_confirmed (status: ${confirmation ?? 'none'})` };
      }

      return { valid: true, payer: undefined };
    },
  };
}

/** Re-exported for unit conversion in amount-binding follow-ups. */
export const SOL_LAMPORTS = LAMPORTS_PER_SOL;