/**
 * Constants for SAP MCP Server
 */

/**
 * Default SAP Program ID
 */
export const DEFAULT_SAP_PROGRAM_ID = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';

/**
 * Default RPC URLs
 */
export const DEFAULT_RPC_URLS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  localnet: 'http://localhost:8899',
};

/**
 * Default commitment level
 */
export const DEFAULT_COMMITMENT = 'confirmed' as const;

/**
 * Default HTTP port for API mode
 */
export const DEFAULT_HTTP_PORT = 8787;

/**
 * Default log level
 */
export const DEFAULT_LOG_LEVEL = 'info' as const;

/**
 * Default transaction limits (in SOL)
 */
export const DEFAULT_MAX_TRANSACTION_VALUE_SOL = 1.0;
/**
 * Shared default require approval above sol definition used by the SAP MCP runtime.
 */
export const DEFAULT_REQUIRE_APPROVAL_ABOVE_SOL = 0.5;

/**
 * Session expiration (24 hours)
 */
export const DEFAULT_SESSION_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/**
 * MCP Server metadata
 */
export const MCP_SERVER_NAME = 'sap-mcp-server';
/**
 * Shared mcp server version definition used by the SAP MCP runtime.
 */
export const MCP_SERVER_VERSION = '0.6.0';

/**
 * Tool categories
 */
export const TOOL_CATEGORIES = {
  REGISTRY: 'registry',
  IDENTITY: 'identity',
  TOOL_SCHEMA: 'tool-schema',
  REPUTATION: 'reputation',
  PAYMENTS: 'payments',
  SETTLEMENT: 'settlement',
  EXECUTION_PROOF: 'execution-proof',
  MEMORY: 'memory',
  DEVELOPER: 'developer',
  TRANSACTION: 'transaction',
} as const;

/**
 * Risk level thresholds (in SOL)
 */
export const RISK_THRESHOLDS = {
  safe: 0,
  low: 0.1,
  medium: 1.0,
  high: 10.0,
  critical: Infinity,
};

/**
 * Supported Solana clusters
 */
export const SUPPORTED_CLUSTERS = ['mainnet-beta', 'devnet', 'testnet', 'localnet'] as const;
