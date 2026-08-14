/**
 * @name schemas/common
 * @description Shared Zod schema primitives reused across every SAP MCP tool schema.
 *
 * These base schemas — wallet addresses, public keys, signatures, PDAs, pagination,
 * amounts, and SOL amounts — are imported by domain-specific schema modules to
 * build consistent validation rules without duplication.
 *
 * @flow
 *   1. Domain schema modules (identity, registry, payments, etc.) import the
 *      primitives they need from this file.
 *   2. `schemas/index.ts` re-exports everything for the MCP tool layer.
 *   3. Tool handlers consume the composed schemas for input validation.
 *
 * @module schemas/common
 */

import { z } from 'zod';

/**
 * @name WalletSchema
 * @description Zod schema validating a base58-encoded Solana wallet address.
 *
 * @usedBy `identity.schema.ts`, `registry.schema.ts`, `payments.schema.ts`, `reputation.schema.ts`, `settlement.schema.ts`
 */
export const WalletSchema = z.string().describe('Wallet address (base58)');

/**
 * @name PublicKeySchema
 * @description Zod schema validating a base58-encoded Solana public key.
 *
 * @usedBy Domain schema modules requiring generic public key validation.
 */
export const PublicKeySchema = z.string().describe('Public key (base58)');

/**
 * @name SignatureSchema
 * @description Zod schema validating a base58-encoded transaction signature.
 *
 * @usedBy `execution-proof.schema.ts`, `transaction.schema.ts`
 */
export const SignatureSchema = z.string().describe('Transaction signature (base58)');

/**
 * @name PdaSchema
 * @description Zod schema validating a base58-encoded Program Derived Address.
 *
 * @usedBy `memory.schema.ts`, `registry.schema.ts`, `settlement.schema.ts`
 */
export const PdaSchema = z.string().describe('Program Derived Address (base58)');

/**
 * @name PaginationSchema
 * @description Zod schema for pagination parameters (limit and offset) with sensible defaults.
 *
 * @property limit  — Maximum number of items to return (default 50).
 * @property offset — Number of items to skip (default 0).
 *
 * @usedBy List-type MCP tools across the SAP MCP runtime.
 */
export const PaginationSchema = z.object({
  limit: z.number().default(50),
  offset: z.number().default(0),
});

/**
 * @name AmountSchema
 * @description Zod schema validating a positive amount in lamports (1 SOL = 1e9 lamports).
 *
 * @usedBy `payments.schema.ts`, `settlement.schema.ts`
 */
export const AmountSchema = z.number().positive().describe('Amount in lamports');

/**
 * @name SolAmountSchema
 * @description Zod schema validating a non-negative amount in SOL.
 *
 * @usedBy Transaction and balance-related MCP tools.
 */
export const SolAmountSchema = z.number().nonnegative().describe('Amount in SOL');