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
 * Human-readable MCP server title shown by registry and client UIs.
 */
export const MCP_SERVER_TITLE = 'SAP MCP Server | OOBE Protocol';
/**
 * Public MCP server description shown by registries and hosted discovery surfaces.
 */
export const MCP_SERVER_DESCRIPTION = 'Solana-native MCP gateway for Synapse Agent Protocol tools, DeFi protocols, SNS identity, x402/pay.sh payments, and user-controlled agent operations.';
/**
 * MCP initialize instructions. Clients may surface this text to the model as
 * server guidance, so keep it concise, standard-compliant, and action-oriented.
 */
export const MCP_SERVER_INSTRUCTIONS = [
  'SAP MCP is a Solana-native, non-custodial MCP gateway. Hosted mode is accountless: OOBE never receives user keypair bytes.',
  'When the user says "Start SAP MCP", "Initialize SAP MCP", "Load SAP", or asks to use SAP MCP, first call free tool sap_agent_start, then sap_skills_bundle with includeContents=true, and load the returned skills before selecting tools.',
  'For simple connection/status questions, answer briefly with endpoint, mode, non-custodial status, local sap_payments readiness only if checked, and one next action. Do not dump the full tool catalog unless asked.',
  'Use exact tool names from tools/list. Do not rewrite hyphenated tool names such as spl-token_getTokenAccounts.',
  'Hosted paid/write tools return HTTP 402 x402/pay.sh challenges. This is normal. Prefer the local sap_payments_call_paid_tool bridge for paid hosted calls; it signs locally and retries without exposing keypair bytes.',
  'If sap_payments is missing, ask the user to run the SAP MCP wizard repair flow and restart the agent runtime. Do not claim hosted SAP MCP can custody or see local wallet config.',
  'When a hosted tool returns an unsigned or partially signed Solana transaction, use local sap_payments_finalize_transaction. For local stdio transactions, use sap_preview_transaction, then sap_sign_transaction, then sap_submit_signed_transaction. Never create temporary signing scripts, read keypair JSON, export secret bytes, or sign raw messages outside SAP MCP tools.',
  'Escrow writes are V2-only. Use sap_create_escrow_v2 and related V2 tools. Default settlementSecurity is DisputeWindow (2); never default to SelfReport (0). Amounts are smallest units: lamports for SOL, micro-USDC for USDC.',
].join('\n');
/**
 * Public homepage for hosted SAP MCP documentation and runtime onboarding.
 */
export const MCP_SERVER_WEBSITE_URL = 'https://mcp.sap.oobeprotocol.ai/';
/**
 * Public PNG icon used by MCP clients and registries.
 */
export const MCP_SERVER_ICON_URL = 'https://mcp.sap.oobeprotocol.ai/favicon.png';
/**
 * Shared mcp server version definition used by the SAP MCP runtime.
 */
export const MCP_SERVER_VERSION = '0.9.13-rc';

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
