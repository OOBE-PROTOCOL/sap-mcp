/**
 * @name core/constants
 * @description Compile-time and runtime constants for the SAP MCP Server.
 *
 * Includes default program IDs, RPC URLs, commitment levels, HTTP ports,
 * transaction limits, MCP server metadata, protocol treasury, registration
 * fees, tool categories, risk thresholds, and supported clusters.
 *
 * @module core/constants
 */

/**
 * @name DEFAULT_SAP_PROGRAM_ID
 * @description Default SAP on-chain program ID used when none is specified in config.
 *
 * @usedBy `config/defaults.ts`, config pipeline
 */
export const DEFAULT_SAP_PROGRAM_ID = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';

/**
 * @name DEFAULT_RPC_URLS
 * @description Default Solana RPC endpoints for each supported cluster.
 *
 * @usedBy config pipeline, `adapters/solana/connection.ts`
 */
export const DEFAULT_RPC_URLS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  localnet: 'http://localhost:8899',
};

/**
 * @name DEFAULT_COMMITMENT
 * @description Default Solana commitment level used when none is configured.
 *
 * @usedBy config pipeline
 */
export const DEFAULT_COMMITMENT = 'confirmed' as const;

/**
 * @name DEFAULT_HTTP_PORT
 * @description Default HTTP port for the SAP MCP server in API mode.
 *
 * @usedBy config pipeline
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
 * Neutral catalog metadata used for third-party catalogs where the acronym
 * "SAP" could be confused with SAP SE.
 */
export const OOBE_CATALOG_SERVER_NAME = 'oobe-protocol';
export const OOBE_CATALOG_SERVER_TITLE = 'OOBE Protocol MCP';
export const OOBE_CATALOG_SERVER_DESCRIPTION = 'Read-only OOBE Protocol agent discovery on Solana: public agent profiles, protocol indexes, network stats, SNS records, and bundled skill metadata.';
export const OOBE_CATALOG_SERVER_WEBSITE_URL = 'https://mcp.sap.oobeprotocol.ai/';
export const OOBE_CATALOG_SERVER_INSTRUCTIONS = [
  'OOBE Protocol MCP is a read-only public discovery endpoint for Solana agent metadata.',
  'Use it only for public agent profiles, protocol indexes, network stats, SNS record reads, and bundled skill metadata.',
  'This catalog surface cannot sign, submit, build, or pay for blockchain transactions, and it does not expose local bridge, wallet, install, self-update, webhook, memory-write, or meta-execution tools.',
  'For connection checks, call sap_agent_start or sap_agent_runtime_status. For discovery, use sap_get_agent, sap_get_agent_profile, sap_list_agents, sap_discover_agents, sap_fetch_protocol_index, or sap_network_stats.',
].join('\n');
/**
 * MCP initialize instructions. Clients may surface this text to the model as
 * server guidance, so keep it concise, standard-compliant, and action-oriented.
 */
export const MCP_SERVER_INSTRUCTIONS = [
  'SAP MCP is a Solana-native, non-custodial MCP gateway. Hosted mode is accountless: OOBE never receives user keypair bytes.',
  'When the user says "Start SAP MCP", "Initialize SAP MCP", "Load SAP", asks whether SAP MCP is connected, or asks to use SAP MCP, first call free tool sap_agent_start, then sap_agent_runtime_status with the closest intent, then sap_skills_bundle with includeContents=true before selecting advanced tools. If prompts are available, use sap-agent-intent-router to choose the shortest safe route for paid calls, registry writes, escrow, identity, and repair flows. Use sap_pricing_catalog for planning paid hosted calls. Use sap_estimate_tool_cost before any paid tool call to know the exact tier and estimated cost. Core balance checks are free (sol_get_balance, spl-token_getBalance, spl-token_getTokenAccounts, magicblock_balance) — always verify USDC and SOL balances before attempting paid calls. Enriched holdings tools such as jupiter_getHoldings are paid read-premium. Use hosted tools for reads, sap_payments_* for local payment/signing, hosted unsigned builders plus sap_payments_finalize_transaction for user-signed transactions, and never create temporary signing scripts or read keypair JSON.',
  'Before SAP registry writes, call free tool sap_protocol_invariants when treasury, registration fee, hosted/local routing, or lifecycle-complete rules are unclear.',
  'For simple connection/status questions, answer briefly with endpoint, mode, non-custodial status, local sap_payments readiness only if checked, and one next action. Do not dump the full tool catalog unless asked.',
  'Use exact tool names from tools/list. Do not rewrite hyphenated tool names such as spl-token_getTokenAccounts.',
  'Hosted paid/write tools return HTTP 402 x402/pay.sh challenges. This is normal. Prefer the local sap_payments_call_paid_tool bridge for paid hosted calls; it signs locally and retries without exposing keypair bytes.',
  'If sap_payments is missing, ask the user to run the SAP MCP wizard repair flow and restart the agent runtime. Do not claim hosted SAP MCP can custody or see local wallet config.',
  'When a hosted tool returns an unsigned or partially signed Solana transaction, use local sap_payments_finalize_transaction. For local stdio transactions, use sap_preview_transaction, then sap_sign_transaction, then sap_submit_signed_transaction. Never create temporary signing scripts, read keypair JSON, export secret bytes, or sign raw messages outside SAP MCP tools.',
  'For SAP agent registration and profile updates, hosted accountless writes return hosted_local_signer_required. Use local sap_payments_register_agent or sap_payments_update_agent, then verify the agent account, transaction signature, and registration protocolFee audit before calling the lifecycle complete. If an update returns Anchor 3012, AccountNotInitialized, or pricing_menu, do not run runtime repair or retry paid hosted writes: classify it as an SAP registry account lifecycle issue and call sap_agent_next_action plus sap_protocol_invariants.',
  'Escrow writes are V2-only. In hosted mode, use sap_escrow_build_*_transaction tools and finalize locally with sap_payments_finalize_transaction. In local SAP MCP signer mode, direct sap_create_escrow_v2 and related V2 tools may sign locally. Default settlementSecurity is DisputeWindow (2); never default to SelfReport (0). Amounts are smallest units: lamports for SOL, micro-USDC for USDC.',
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
export const MCP_SERVER_VERSION = '0.9.81';

/**
 * Read-only tool surface intended for third-party catalogs whose presence
 * implies endorsement. It excludes spend, signing, submit, builder, install,
 * self-update, memory-write, webhook, and meta-execution helpers.
 */
export const CATALOG_READONLY_TOOL_ALLOWLIST = [
  'sap_agent_start',
  'sap_agent_runtime_status',
  'sap_pricing_catalog',
  'sap_network_stats',
  'sap_protocol_invariants',
  'sap_get_agent',
  'sap_get_agent_stats',
  'sap_get_global_state',
  'sap_get_network_overview',
  'sap_agent_context',
  'sap_get_agent_profile',
  'sap_is_agent_active',
  'sap_discover_agents',
  'sap_list_agents',
  'sap_list_all_agents',
  'sap_fetch_capability_index',
  'sap_fetch_protocol_index',
  'sap_fetch_tool_category_index',
  'sap_fetch_tool',
  'sap_fetch_feedback',
  'sap_fetch_attestation',
  'sap_fetch_escrow',
  'sap_fetch_escrow_v2',
  'sap_fetch_pending_settlement',
  'sap_fetch_dispute',
  'sap_fetch_vault',
  'sap_fetch_session',
  'sap_fetch_epoch_page',
  'sap_fetch_stake',
  'sap_fetch_subscription',
  'sap_sns_check_domain',
  'sap_sns_batch_check_domains',
  'sap_sns_resolve_domain',
  'sap_sns_validate_records',
  'sap_sns_get_domain_pda',
  'sap_sns_get_record_pda',
  'sap_sns_get_domain_records',
  'sap_sns_get_record',
  'sap_sns_resolve_wallet',
  'sap_sns_check_ownership',
  'sap_skills_list',
  'sap_skills_bundle',
  'sap_skills_upgrade_plan',
  'sap_skills_check_updates',
  'sap_profile_current',
  'sap_profile_list',
  'sap_profile_public_key',
] as const;

export function isCatalogReadonlyAllowedTools(allowedTools: readonly string[] | 'all'): boolean {
  if (allowedTools === 'all' || allowedTools.length !== CATALOG_READONLY_TOOL_ALLOWLIST.length) {
    return false;
  }

  const requested = new Set(allowedTools);
  return CATALOG_READONLY_TOOL_ALLOWLIST.every((toolName) => requested.has(toolName));
}

/**
 * SAP protocol treasury that should receive protocol-owned registration fees.
 */
export const SAP_PROTOCOL_TREASURY = 'J7PyZAGKvprCz4SQ5DKBLAHstJxgVqZcz6kguUoWpP7P';

/**
 * Current SAP agent registration protocol fee in lamports.
 */
export const SAP_REGISTRATION_FEE_LAMPORTS = 100_000_000n;

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
