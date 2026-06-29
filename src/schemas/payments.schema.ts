/**
 * Payments schemas
 */

import { z } from 'zod';
import { WalletSchema, AmountSchema } from './common.schema.js';

/**
 * Shared create payment intent schema definition used by the SAP MCP runtime.
 */
export const CreatePaymentIntentSchema = z.object({
  agent: WalletSchema,
  amount: AmountSchema,
  maxCalls: z.number().positive(),
});

/**
 * Shared x402 request schema definition used by the SAP MCP runtime.
 */
export const X402RequestSchema = z.object({
  agent: WalletSchema,
  amount: AmountSchema,
  service: z.string(),
});
