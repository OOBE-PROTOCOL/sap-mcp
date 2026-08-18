/**
 * @name sap/sap-types
 * @description SAP Protocol on-chain account type definitions.
 *
 * These types mirror the on-chain data structures for agents, stats, escrows,
 * vaults, and tools in the SAP Protocol program.
 *
 * @flow
 *   1. SAP MCP tool handlers cast deserialized on-chain account data to these types.
 *   2. `sap/index.ts` re-exports them for external consumers.
 *
 * @module sap/sap-types
 */

import type { PublicKey } from '@solana/web3.js';

/**
 * @name SapAgent
 * @description On-chain SAP agent account data.
 *
 * @property wallet       — Agent's Solana wallet public key.
 * @property pda          — Program Derived Address of the agent account.
 * @property name         — Agent display name.
 * @property capabilities — Array of capability identifier strings.
 * @property metadataUri  — Optional URI to off-chain agent metadata.
 * @property x402Endpoint — Optional URL for the agent's x402 payment endpoint.
 * @property isActive     — Whether the agent is currently active.
 * @property registeredAt — Unix timestamp of agent registration.
 *
 * @usedBy SAP registry tools, `sap/index.ts`
 */
export interface SapAgent {
  wallet: PublicKey;
  pda: PublicKey;
  name: string;
  capabilities: string[];
  metadataUri?: string;
  x402Endpoint?: string;
  isActive: boolean;
  registeredAt: number;
}

/**
 * @name SapAgentStats
 * @description Aggregate statistics for a SAP agent.
 *
 * @property totalCalls      — Total number of calls made by the agent.
 * @property totalEarnings   — Total earnings in lamports.
 * @property reputationScore — Numerical reputation score.
 * @property feedbackCount   — Number of feedback attestations received.
 * @property averageRating   — Average rating from attestations.
 *
 * @usedBy SAP reputation tools, `sap/index.ts`
 */
export interface SapAgentStats {
  totalCalls: number;
  totalEarnings: number;
  reputationScore: number;
  feedbackCount: number;
  averageRating: number;
}

/**
 * @name SapEscrow
 * @description On-chain SAP escrow account data for payment settlement.
 *
 * @property pda           — Program Derived Address of the escrow account.
 * @property depositor     — Public key of the depositor.
 * @property agent         — Public key of the agent the escrow is for.
 * @property balance       — Current escrow balance in lamports.
 * @property pricePerCall  — Price per call in lamports.
 * @property maxCalls      — Maximum calls covered by the escrow.
 * @property callsRemaining — Number of calls remaining in the escrow.
 * @property expiresAt     — Unix timestamp of escrow expiry.
 * @property isActive      — Whether the escrow is currently active.
 *
 * @usedBy SAP settlement tools, `sap/index.ts`
 */
export interface SapEscrow {
  pda: PublicKey;
  depositor: PublicKey;
  agent: PublicKey;
  balance: number;
  pricePerCall: number;
  maxCalls: number;
  callsRemaining: number;
  expiresAt: number;
  isActive: boolean;
}

/**
 * @name SapVault
 * @description On-chain SAP memory vault account data.
 *
 * @property pda               — Program Derived Address of the vault account.
 * @property agent             — Public key of the agent owning the vault.
 * @property nonce             — Cryptographic nonce for the vault.
 * @property totalInscriptions — Total number of inscriptions in the vault.
 * @property currentEpoch      — Current epoch number of the vault.
 *
 * @usedBy SAP memory tools, `sap/index.ts`
 */
export interface SapVault {
  pda: PublicKey;
  agent: PublicKey;
  nonce: Uint8Array;
  totalInscriptions: number;
  currentEpoch: number;
}

/**
 * @name SapTool
 * @description On-chain SAP tool schema account data.
 *
 * @property pda              — Program Derived Address of the tool schema account.
 * @property agent            — Public key of the agent that published the tool.
 * @property name             — Tool name string.
 * @property protocolHash     — Hash of the tool protocol definition.
 * @property descriptionHash  — Hash of the tool description.
 * @property inputSchemaHash  — Hash of the tool input JSON schema.
 * @property outputSchemaHash — Hash of the tool output JSON schema.
 * @property httpMethod       — HTTP method the tool exposes.
 * @property category         — Numeric category code for tool classification.
 * @property paramsCount      — Total number of parameters the tool accepts.
 * @property requiredParams   — Number of required parameters.
 * @property isCompound       — Whether the tool is a compound (multi-step) tool.
 *
 * @usedBy SAP tool-schema tools, `sap/index.ts`
 */
export interface SapTool {
  pda: PublicKey;
  agent: PublicKey;
  name: string;
  protocolHash: Uint8Array;
  descriptionHash: Uint8Array;
  inputSchemaHash: Uint8Array;
  outputSchemaHash: Uint8Array;
  httpMethod: string;
  category: number;
  paramsCount: number;
  requiredParams: number;
  isCompound: boolean;
}