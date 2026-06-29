/**
 * Registry schemas
 */

import { z } from 'zod';
import { WalletSchema, PdaSchema } from './common.schema.js';

/**
 * Shared register agent schema definition used by the SAP MCP runtime.
 */
export const RegisterAgentSchema = z.object({
  name: z.string().min(3).max(64),
  description: z.string().optional(),
  capabilities: z.array(z.string()),
  metadataUri: z.string().url().optional(),
  x402Endpoint: z.string().url().optional(),
  pricePerCall: z.number().positive(),
  maxCallsPerSettlement: z.number().positive(),
});

/**
 * Shared update agent schema definition used by the SAP MCP runtime.
 */
export const UpdateAgentSchema = z.object({
  wallet: WalletSchema,
  name: z.string().min(3).max(64).optional(),
  capabilities: z.array(z.string()).optional(),
  metadataUri: z.string().url().optional(),
});

/**
 * Shared get agent schema definition used by the SAP MCP runtime.
 */
export const GetAgentSchema = z.object({
  wallet: WalletSchema.optional(),
  agentPda: PdaSchema.optional(),
});
