/**
 * @name schemas/settlement
 * @description Zod schemas for SAP escrow settlement operations — escrow creation, settlement, and dispute opening.
 *
 * @flow
 *   1. Settlement MCP tools import these schemas for input validation.
 *   2. `schemas/index.ts` re-exports them for external consumers.
 *
 * @module schemas/settlement
 */

import { z } from 'zod';
import { WalletSchema, PdaSchema, AmountSchema } from './common.schema.js';

/**
 * @name CreateEscrowSchema
 * @description Zod schema for creating an escrow account for agent payment settlement.
 *
 * @property agent     — Base58 wallet address of the agent to escrow funds for.
 * @property amount    — Positive amount in lamports to deposit into escrow.
 * @property maxCalls  — Maximum number of calls the escrow covers.
 * @property expiresAt — Optional Unix timestamp after which escrow expires.
 *
 * @usedBy Settlement MCP tools in the SAP MCP runtime.
 */
export const CreateEscrowSchema = z.object({
  agent: WalletSchema,
  amount: AmountSchema,
  maxCalls: z.number().positive(),
  expiresAt: z.number().optional(),
});

/**
 * @name SettleEscrowSchema
 * @description Zod schema for settling an escrow account by paying out for completed calls.
 *
 * @property escrow        — PDA of the escrow account to settle.
 * @property callsToSettle — Number of completed calls to settle payment for.
 *
 * @usedBy Settlement MCP tools in the SAP MCP runtime.
 */
export const SettleEscrowSchema = z.object({
  escrow: PdaSchema,
  callsToSettle: z.number().positive(),
});

/**
 * @name OpenDisputeSchema
 * @description Zod schema for opening a dispute against an escrow settlement.
 *
 * @property escrow — PDA of the escrow account under dispute.
 * @property reason — Human-readable dispute reason string.
 *
 * @usedBy Settlement MCP tools in the SAP MCP runtime.
 */
export const OpenDisputeSchema = z.object({
  escrow: PdaSchema,
  reason: z.string(),
});