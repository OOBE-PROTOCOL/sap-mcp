/**
 * Reputation schemas
 */

import { z } from 'zod';
import { WalletSchema } from './common.schema.js';

/**
 * Shared get reputation schema definition used by the SAP MCP runtime.
 */
export const GetReputationSchema = z.object({
  wallet: WalletSchema,
});

/**
 * Shared submit attestation schema definition used by the SAP MCP runtime.
 */
export const SubmitAttestationSchema = z.object({
  agent: WalletSchema,
  rating: z.number().min(0).max(10000),
  comment: z.string().optional(),
});
