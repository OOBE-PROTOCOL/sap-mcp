/**
 * Core Type Definitions for SAP MCP Server
 * 
 * These types define the shared context, configuration, and data structures
 * used throughout the MCP server.
 */

import { Connection } from '@solana/web3.js';
import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import type { SapMcpConfig as RuntimeSapMcpConfig } from '../config/env.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import type { logger } from '../core/logger.js';

// ============================================================================
// Server Modes
// ============================================================================

/**
 * SAP MCP Server operating modes
 */
export type SapMcpMode =
  | 'readonly'
  | 'local-dev-keypair'
  | 'external-signer'
  | 'delegated-session'
  | 'hosted-api';

/**
 * Signer mode - derived from MCP mode
 */
export type SapSignerMode =
  | 'none'           // readonly, hosted-api
  | 'local-keypair'  // local-dev-keypair
  | 'external'       // external-signer
  | 'delegated';     // delegated-session

// ============================================================================
// Configuration
// ============================================================================

/**
 * SAP MCP Server configuration resolved by the config pipeline.
 */
export type SapMcpConfig = RuntimeSapMcpConfig;

// ============================================================================
// Session & Permissions
// ============================================================================

/**
 * Agent session with permissions and limits
 */
export interface SapAgentSession {
  sessionId: string;
  agentId: string;
  permissions: SapPermission[];
  spendingLimits: SapSpendingLimits;
  expiresAt: number;
  createdAt: number;
}

/**
 * Permission types for agent sessions
 */
export type SapPermission =
  | 'config:read'
  | 'config:write'
  | 'registry:read'
  | 'registry:write'
  | 'identity:read'
  | 'identity:write'
  | 'reputation:read'
  | 'reputation:write'
  | 'payments:read'
  | 'payments:write'
  | 'settlement:read'
  | 'settlement:write'
  | 'memory:read'
  | 'memory:write'
  | 'transaction:submit';

/**
 * Spending limits for a session
 */
export interface SapSpendingLimits {
  maxPerTransactionSol: number;
  maxPerDaySol: number;
  maxPerSessionSol: number;
  remainingSessionSol: number;
}

// ============================================================================
// Policy & Risk
// ============================================================================

/**
 * Policy definition
 */
export interface SapPolicy {
  id: string;
  name: string;
  description: string;
  rules: SapPolicyRule[];
  enabled: boolean;
}

/**
 * Policy rule
 */
export interface SapPolicyRule {
  condition: string;
  action: 'allow' | 'deny' | 'require_approval';
  tools?: string[];
  maxAmountSol?: number;
}

/**
 * Risk level for transactions
 */
export type SapRiskLevel =
  | 'safe'       // No risk, read-only
  | 'low'        // Small amounts, well-known operations
  | 'medium'     // Moderate amounts, standard operations
  | 'high'       // Large amounts, complex operations
  | 'critical';  // Very large amounts, unknown operations

// ============================================================================
// Transaction Preview
// ============================================================================

/**
 * Transaction preview before signing
 */
export interface SapTransactionPreview {
  transactionType: string;
  description: string;
  riskLevel: SapRiskLevel;
  estimatedFeeSol: number;
  estimatedValueSol: number;
  accountsInvolved: string[];
  instructions: TransactionInstructionPreview[];
  requiresApproval: boolean;
  approvalReason?: string;
}

/**
 * Individual instruction preview
 */
export interface TransactionInstructionPreview {
  programId: string;
  programName: string;
  instructionName: string;
  accounts: AccountPreview[];
  dataPreview: string;
}

/**
 * Account preview
 */
export interface AccountPreview {
  pubkey: string;
  role: string;
  isSigner: boolean;
  isWritable: boolean;
}

// ============================================================================
// Tool Results
// ============================================================================

/**
 * Standard SAP tool result
 */
export interface SapToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: SapToolError;
  metadata?: {
    durationMs: number;
    rpcSlot?: number;
    transactionSignature?: string;
  };
}

/**
 * Tool error
 */
export interface SapToolError {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// MCP Context
// ============================================================================

/**
 * Shared context passed to all MCP handlers
 */
export interface SapMcpContext {
  config: SapMcpConfig;
  connection: Connection;
  sapClient: SapClient;
  signer?: SapSigner;
  policyEngine: PolicyEngine;
  session?: SapAgentSession;
  logger: typeof logger;
}

/**
 * Signer interface
 */
export interface SapSigner {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
}

// ============================================================================
// Re-exports from schema
// ============================================================================

export type { SapEnvConfig } from '../config/env.js';
