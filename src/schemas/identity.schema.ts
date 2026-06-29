/**
 * Identity schemas
 */

import { z } from 'zod';
import { WalletSchema } from './common.schema.js';

/**
 * Shared bridge identity schema definition used by the SAP MCP runtime.
 */
export const BridgeIdentitySchema = z.object({
  wallet: WalletSchema,
  bridge: z.enum(['metaplex', 'said']),
  assetId: z.string().optional(),
});

/**
 * Shared verify identity schema definition used by the SAP MCP runtime.
 */
export const VerifyIdentitySchema = z.object({
  wallet: WalletSchema,
  bridge: z.enum(['metaplex', 'said']),
});
