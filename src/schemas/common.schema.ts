/**
 * Common Zod schemas
 */

import { z } from 'zod';

/**
 * Shared wallet schema definition used by the SAP MCP runtime.
 */
export const WalletSchema = z.string().describe('Wallet address (base58)');
/**
 * Shared public key schema definition used by the SAP MCP runtime.
 */
export const PublicKeySchema = z.string().describe('Public key (base58)');
/**
 * Shared signature schema definition used by the SAP MCP runtime.
 */
export const SignatureSchema = z.string().describe('Transaction signature (base58)');
/**
 * Shared pda schema definition used by the SAP MCP runtime.
 */
export const PdaSchema = z.string().describe('Program Derived Address (base58)');

/**
 * Shared pagination schema definition used by the SAP MCP runtime.
 */
export const PaginationSchema = z.object({
  limit: z.number().default(50),
  offset: z.number().default(0),
});

/**
 * Shared amount schema definition used by the SAP MCP runtime.
 */
export const AmountSchema = z.number().positive().describe('Amount in lamports');
/**
 * Shared sol amount schema definition used by the SAP MCP runtime.
 */
export const SolAmountSchema = z.number().nonnegative().describe('Amount in SOL');
