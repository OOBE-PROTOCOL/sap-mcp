/**
 * @name schemas/reputation
 * @description Zod schemas for SAP reputation operations — reputation lookups and attestation submission.
 *
 * @flow
 *   1. Reputation MCP tools import these schemas for input validation.
 *   2. `schemas/index.ts` re-exports them for external consumers.
 *
 * @module schemas/reputation
 */

import { z } from 'zod';
import { WalletSchema } from './common.schema.js';

/**
 * @name GetReputationSchema
 * @description Zod schema for retrieving an agent's reputation score.
 *
 * @property wallet — Base58 wallet address of the agent to query.
 *
 * @usedBy Reputation MCP tools in the SAP MCP runtime.
 */
export const GetReputationSchema = z.object({
  wallet: WalletSchema,
});

/**
 * @name SubmitAttestationSchema
 * @description Zod schema for submitting a reputation attestation for an agent.
 *
 * @property agent   — Base58 wallet address of the agent being attested.
 * @property rating  — Numerical rating from 0 to 10000.
 * @property comment — Optional comment accompanying the attestation.
 *
 * @usedBy Reputation MCP tools in the SAP MCP runtime.
 */
export const SubmitAttestationSchema = z.object({
  agent: WalletSchema,
  rating: z.number().min(0).max(10000),
  comment: z.string().optional(),
});