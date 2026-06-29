/**
 * SAP type definitions
 */

import type { PublicKey } from '@solana/web3.js';

/**
 * SAP Agent account
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
 * SAP Agent stats
 */
export interface SapAgentStats {
  totalCalls: number;
  totalEarnings: number;
  reputationScore: number;
  feedbackCount: number;
  averageRating: number;
}

/**
 * SAP Escrow
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
 * SAP Vault
 */
export interface SapVault {
  pda: PublicKey;
  agent: PublicKey;
  nonce: Uint8Array;
  totalInscriptions: number;
  currentEpoch: number;
}

/**
 * SAP Tool
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
