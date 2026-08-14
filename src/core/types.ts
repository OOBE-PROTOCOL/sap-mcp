/**
 * @name core/types
 * @description Core type definitions for shared context, configuration, and data structures
 * @module core/types
 */

/**
 * Core Type Definitions for SAP MCP Server
 * 
 * These types define the shared context, configuration, and data structures
 * used throughout the MCP server.
 */

import { Connection } from '@solana/web3.js';
import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import type { logger } from './logger.js';

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
export interface SapMcpConfig {
  mode: SapMcpMode;
  rpcUrl: string;
  rpcUrlDevnet?: string;
  rpcUrlTestnet?: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
  programId: string;
  agentPubkey?: string;
  maxRetries: number;
  retryDelayMs: number;
  walletPath?: string;
  walletEncrypted: boolean;
  walletPassphraseEnv?: string;
  externalSignerUrl?: string;
  externalSignerTimeoutMs: number;
  enableHttp: boolean;
  httpPort: number;
  httpHost: string;
  httpCorsOrigins?: string[];
  maxTxValueSol: number;
  requireApprovalAboveSol: number;
  dailyLimitSol: number;
  allowedTools: string[] | 'all';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFormat: 'json' | 'pretty';
  logFile?: string;
  enableMetrics: boolean;
  metricsPort: number;
  enableCache: boolean;
  cacheTtlSeconds: number;
  enableRateLimit: boolean;
  rateLimitPerMinute: number;
  jupiter: {
    apiBaseUrl: string;
    tokensApiBaseUrl?: string;
    apiKeyConfigured: boolean;
    timeoutMs: number;
  };
  perps: {
    marketsUrl?: string;
    positionsUrl?: string;
    builderUrl?: string;
    adrenaProgramId: string;
    apiKeyConfigured: boolean;
    timeoutMs: number;
  };
  /** Priority fee in micro-lamports prepended to Adrena perps transactions (0 = disabled). */
  priorityFeeMicroLamports: number;
  /** Trading policy: max collateral in USD per single trade. */
  maxCollateralUsdPerTrade?: number;
  /** Trading policy: max leverage allowed. */
  maxLeverage?: number;
  /** Trading policy: max simultaneous open positions. */
  maxOpenPositions?: number;
  /** Trading policy: allowed market symbols. Empty = all markets. */
  allowedMarkets?: string[];
  /** Trading policy: require stop loss on position open. */
  stopLossRequired?: boolean;
  /** Trading policy: max slippage in basis points. */
  maxSlippageBps?: number;
  /** Trading policy: require human acknowledgment above this USD amount. */
  requireHumanAckAboveUsd?: number;
  /** Trading policy: daily loss limit in USD. New trades blocked when exceeded. */
  dailyLossLimitUsd?: number;
  /** Trading policy: max drawdown percentage before blocking new trades. */
  maxDrawdownPct?: number;
  /** Trading policy: cooldown in minutes after a losing trade. */
  cooldownMinutes?: number;
  bento?: {
    enabled: boolean;
    apiKey?: string;
    agentId?: string;
    endpoint?: string;
  };
  policy?: {
    mode: 'local-only' | 'bento-only' | 'hybrid';
    failOpen: boolean;
    logging: boolean;
  };
  monetization: SapMcpMonetizationConfig;
}

/**
 * Supported payment rails for hosted remote MCP monetization.
 */
export type SapMcpMonetizationProvider = 'x402' | 'pay-sh';

/**
 * Runtime configuration for x402/pay.sh gated remote MCP tool execution.
 */
export interface SapMcpMonetizationConfig {
  enabled: boolean;
  provider: SapMcpMonetizationProvider;
  payTo?: string;
  network?: string;
  facilitatorUrl?: string;
  facilitatorAuthToken?: string;
  maxTimeoutSeconds: number;
  payShCheckoutUrl?: string;
  strictTools: boolean;
  prices: {
    microReadUsd: number;
    readPremiumUsd: number;
    builderUsd: number;
    valueFixedUsd: number;
    heavyValueUsd: number;
    valueBps: number;
    minUsd: number;
    maxUsd: number;
  };
}

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

export interface PolicyPermissionContext {
  amountSol?: number;
  toolName?: string;
  args?: Record<string, unknown>;
  programId?: string;
  destination?: string;
  user?: string;
}

export interface PolicyRuntimeStatus {
  mode: string;
  bentoConfigured: boolean;
  bentoAvailable: boolean;
  localEngineActive: boolean;
}

export interface TradingPolicy {
  maxCollateralUsdPerTrade: number;
  maxLeverage: number;
  maxOpenPositions: number;
  allowedMarkets: string[];
  stopLossRequired: boolean;
  maxSlippageBps: number;
  requireHumanAckAboveUsd: number;
  dailyLossLimitUsd?: number;
  maxDrawdownPct?: number;
  cooldownMinutes?: number;
}

export interface TradingPolicyParams {
  market: string;
  side: string;
  collateralUsd: number;
  leverage: number;
  hasStopLoss: boolean;
  slippageBps?: number;
}

export interface PolicyViolationResult {
  allowed: boolean;
  violation?: string;
  message?: string;
  field?: string;
  max?: number;
  received?: number;
  threshold?: number;
  allowed_list?: string[];
}

export interface SapPolicyEngine {
  validatePermissions(permissions: string[]): Promise<{
    valid: boolean;
    permissions: SapPermission[];
    errors?: string[];
  }>;
  checkPermission(
    permission: string,
    context?: PolicyPermissionContext,
  ): Promise<{ allowed: boolean; reason?: string }>;
  getRuntimeStatus(): PolicyRuntimeStatus;
  getTradingPolicy(): TradingPolicy;
  validateTradingPolicy(params: TradingPolicyParams): PolicyViolationResult;
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
  policyEngine: SapPolicyEngine;
  session?: SapAgentSession;
  logger: typeof logger;
  toolCatalog?: SapMcpToolCatalogContext;
}

/**
 * Secret-free modular tool catalog summary attached after tool registration.
 */
export interface SapMcpToolCatalogContext {
  profileId: string;
  profileDescription: string;
  runtimeMode: SapMcpMode;
  paymentsBridgeOnly: boolean;
  moduleCount: number;
  toolCount: number;
  categories: ReadonlyArray<{
    category: string;
    modules: number;
    tools: number;
  }>;
  policy: {
    paymentTiers: Readonly<Record<string, number>>;
    intents: Readonly<Record<string, number>>;
    hostedAccountlessBlockedTools: readonly string[];
    localSignerTools: readonly string[];
  };
  modules: ReadonlyArray<{
    id: string;
    title: string;
    category: string;
    mode: string;
    expectedTools: readonly string[];
  }>;
}

/**
 * Signer interface
 */
export interface SapSigner {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
}
