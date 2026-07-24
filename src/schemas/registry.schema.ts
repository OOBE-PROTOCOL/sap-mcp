/**
 * @name schemas/registry
 * @description Zod schemas for SAP agent registry operations — registration, updates, and lookups.
 *
 * @flow
 *   1. Registry MCP tools import these schemas for input validation.
 *   2. `schemas/index.ts` re-exports them for external consumers.
 *
 * @module schemas/registry
 */

import { z } from 'zod';
import { WalletSchema, PdaSchema } from './common.schema.js';

/**
 * @name RegisterAgentSchema
 * @description Zod schema for registering a new SAP agent on-chain.
 *
 * @property name                 — Agent display name (3–64 characters).
 * @property description          — Optional agent description.
 * @property capabilities         — Array of capability identifier strings.
 * @property metadataUri          — Optional URL to off-chain agent metadata.
 * @property x402Endpoint         — Optional URL for the agent's x402 payment endpoint.
 * @property pricePerCall         — Positive price per call in lamports.
 * @property maxCallsPerSettlement — Maximum calls per settlement cycle.
 *
 * @usedBy Registry MCP tools in the SAP MCP runtime.
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
 * @name UpdateAgentSchema
 * @description Zod schema for updating an existing SAP agent's on-chain profile.
 *
 * @property wallet       — Base58 wallet address of the agent to update.
 * @property name         — Optional new display name (3–64 characters).
 * @property capabilities — Optional new array of capability identifiers.
 * @property metadataUri  — Optional new URL to off-chain agent metadata.
 *
 * @usedBy Registry MCP tools in the SAP MCP runtime.
 */
export const UpdateAgentSchema = z.object({
  wallet: WalletSchema,
  name: z.string().min(3).max(64).optional(),
  capabilities: z.array(z.string()).optional(),
  metadataUri: z.string().url().optional(),
});

/**
 * @name GetAgentSchema
 * @description Zod schema for looking up a SAP agent by wallet or PDA.
 *
 * @property wallet   — Optional base58 wallet address to look up.
 * @property agentPda — Optional PDA of the agent account.
 *
 * @usedBy Registry MCP tools in the SAP MCP runtime.
 */
export const GetAgentSchema = z.object({
  wallet: WalletSchema.optional(),
  agentPda: PdaSchema.optional(),
});