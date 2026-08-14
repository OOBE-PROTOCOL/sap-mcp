/**
 * @name schemas/payments
 * @description Zod schemas for SAP payment operations — payment intent creation and x402 protocol requests.
 *
 * @flow
 *   1. Payment MCP tools import these schemas for input validation.
 *   2. `schemas/index.ts` re-exports them for external consumers.
 *
 * @module schemas/payments
 */

import { z } from 'zod';
import { WalletSchema, AmountSchema } from './common.schema.js';

/**
 * @name CreatePaymentIntentSchema
 * @description Zod schema for creating a payment intent for an agent.
 *
 * @property agent    — Base58 wallet address of the paying agent.
 * @property amount   — Positive amount in lamports to escrow.
 * @property maxCalls — Maximum number of calls the payment intent covers.
 *
 * @usedBy Payment MCP tools in the SAP MCP runtime.
 */
export const CreatePaymentIntentSchema = z.object({
  agent: WalletSchema,
  amount: AmountSchema,
  maxCalls: z.number().positive(),
});

/**
 * @name X402RequestSchema
 * @description Zod schema for initiating an x402 protocol payment request.
 *
 * @property agent   — Base58 wallet address of the paying agent.
 * @property amount  — Positive amount in lamports to charge.
 * @property service — Service identifier string for the x402 payment.
 *
 * @usedBy Payment MCP tools in the SAP MCP runtime.
 */
export const X402RequestSchema = z.object({
  agent: WalletSchema,
  amount: AmountSchema,
  service: z.string(),
});