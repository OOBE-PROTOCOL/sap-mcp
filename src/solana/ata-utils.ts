/**
 * @name solana/ata-utils
 * @description Shared ATA derivation helpers for consistent address calculation.
 *
 * Uses the official @solana/spl-token `getAssociatedTokenAddressSync` which
 * implements the standard SPL Associated Token Account seed layout:
 *   [owner, TOKEN_PROGRAM_ID, mint]
 *
 * All builders and tools should use these helpers instead of reimplementing
 * ATA derivation. This prevents the class of bugs where one code path uses
 * the correct seeds and another uses a wrong prefix or order.
 *
 * @module solana/ata-utils
 */

import { PublicKey, type TransactionInstruction } from '@solana/web3.js';
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';

/** Solana Token Program ID. */
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/** Solana Associated Token Account Program ID. */
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

/**
 * Derive the Associated Token Account address for a wallet and mint.
 *
 * Uses the standard SPL seed layout: [owner, TOKEN_PROGRAM_ID, mint].
 * This is the ONLY correct way to derive an ATA — never use a string
 * prefix like "AssociatedTokenAddress" in the seeds.
 *
 * @param owner — Wallet public key that owns the ATA.
 * @param mint — Token mint public key.
 * @returns ATA public key.
 */
export function deriveAtaAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

/**
 * Create a CreateAssociatedTokenAccountIdempotent instruction.
 * This instruction is a no-op if the ATA already exists, so it's safe to
 * always include in transactions.
 *
 * @param payer — Fee payer public key (usually the owner).
 * @param owner — Wallet public key that will own the ATA.
 * @param mint — Token mint public key.
 * @returns TransactionInstruction for CreateAssociatedTokenAccountIdempotent.
 */
export function createAtaIdempotentIx(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  const ata = deriveAtaAddress(owner, mint);
  return createAssociatedTokenAccountIdempotentInstruction(
    payer,
    ata,
    owner,
    mint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}