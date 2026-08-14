/**
 * @name schemas/identity
 * @description Zod schemas for identity verification operations across SAP Protocol bridges.
 *
 * @flow
 *   1. Identity MCP tools import these schemas for input validation.
 *   2. `schemas/index.ts` re-exports them for external consumers.
 *
 * @module schemas/identity
 */

import { z } from 'zod';
import { WalletSchema } from './common.schema.js';

/**
 * @name BridgeIdentitySchema
 * @description Zod schema for resolving a bridge identity (Metaplex or SAID) for a given wallet.
 *
 * @property wallet  — Base58 wallet address of the agent.
 * @property bridge  — Identity bridge type: `metaplex` or `said`.
 * @property assetId — Optional on-chain asset id associated with the identity.
 *
 * @usedBy Identity MCP tools in the SAP MCP runtime.
 */
export const BridgeIdentitySchema = z.object({
  wallet: WalletSchema,
  bridge: z.enum(['metaplex', 'said']),
  assetId: z.string().optional(),
});

/**
 * @name VerifyIdentitySchema
 * @description Zod schema for verifying an agent's identity on a SAP Protocol bridge.
 *
 * @property wallet — Base58 wallet address of the agent to verify.
 * @property bridge — Identity bridge type: `metaplex` or `said`.
 *
 * @usedBy Identity MCP tools in the SAP MCP runtime.
 */
export const VerifyIdentitySchema = z.object({
  wallet: WalletSchema,
  bridge: z.enum(['metaplex', 'said']),
});