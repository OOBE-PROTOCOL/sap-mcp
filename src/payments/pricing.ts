/**
 * @name SapMcpPricing
 * @description Pricing registry for hosted SAP MCP tool monetization.
 */

import type { SapMcpMonetizationConfig } from '../config/env.js';
import type { McpToolCall, ParsedMcpRequest } from './json-rpc.js';
import { isRecord } from './json-rpc.js';

/**
 * @name PaymentTier
 * @description Commercial pricing tier for an MCP request.
 */
export type PaymentTier = 'free' | 'micro-read' | 'read-premium' | 'builder' | 'value-action' | 'batch';

/**
 * @name ToolPricing
 * @description Resolved price classification for one tool call.
 */
export interface ToolPricing {
  toolName: string;
  tier: PaymentTier;
  priceUsd: number;
  reason: string;
  exactPrice?: boolean;
}

/**
 * @name PricingCatalog
 * @description Public, machine-readable pricing and routing model exposed to agents.
 */
export interface PricingCatalog {
  source: 'sap-mcp-pricing-registry';
  version: 1;
  strictTools: boolean;
  currency: 'USD';
  tiers: Record<PaymentTier, {
    paymentRequired: boolean;
    priceUsd?: number;
    pricingRule: string;
    examples: string[];
  }>;
  toolSets: {
    free: string[];
    microRead: string[];
    conditionalFree: string[];
    conditionalMicroRead: string[];
    readPremium: string[];
    builders: string[];
    valueActions: string[];
    heavyValueActions: string[];
    valueActionPrefixes: string[];
  };
  runtimeRules: string[];
}

/**
 * @name PaymentDecision
 * @description Aggregated payment requirement for a JSON-RPC MCP request.
 */
export type PaymentDecision =
  | {
      required: false;
      tier: 'free';
      reason: string;
      toolPricings: ToolPricing[];
    }
  | {
      required: true;
      tier: Exclude<PaymentTier, 'free'>;
      priceUsd: number;
      price: string;
      description: string;
      toolPricings: ToolPricing[];
      toolNames: string[];
    };

const FREE_MCP_METHODS = new Set([
  'initialize',
  'notifications/initialized',
  'ping',
  'tools/list',
  'prompts/list',
  'prompts/get',
  'resources/list',
  'resources/templates/list',
  'resources/read',
]);

const FREE_TOOLS = new Set([
  'sap_agent_start',
  'sap_estimate_tool_cost',
  'sap_agent_runtime_status',
  'sap_agent_next_action',
  'sap_prepare_action',
  'sap_agent_standard_context',
  'sap_prepare_mandate',
  'sap_export_agent_oasf',
  'sap_pricing_catalog',
  'sap_protocol_invariants',
  'sap_agent_identity_plan',
  'sap_profile_current',
  'sap_profile_list',
  'sap_profile_public_key',
  'sap_skills_list',
  'sap_skills_bundle',
  'sap_skills_install',
  'sap_skills_upgrade_plan',
  'sap_runtime_repair_plan',
  'sap_decode_transaction',
  'sap_preview_transaction',
  'sap_x402_estimate_cost',
  'sap_x402_calculate_cost',
  'sap_payments_profile_current',
  'sap_payments_wallet_guard',
  'sap_payments_readiness',
  'sap_payments_prepare_challenge',
  'sap_payments_sign_challenge',
  'sap_payments_call_paid_tool',
  'sap_payments_call_external_x402',
  'sap_payments_register_agent',
  'sap_payments_update_agent',
  'sap_payments_finalize_transaction',
  'sap_payments_verify_receipt',
  'sap_premium_plugin_catalog',
  'sap_stream_catalog',
  'sap_webhook_catalog',
  'sap_premium_validate_plugin_manifest',
  'sap_premium_plugin_template',
  'sap_premium_session_start',
  'sap_premium_session_status',
  'sap_premium_stream_poll',
  'sap_premium_stream_flush',
  'sap_premium_webhook_relay_status',
  'sap_premium_metrics',
  'sap_quick_context',
  'sap_perp_builder_status',
  // Payment readiness and single-asset price checks stay free so agents can
  // decide whether a user wallet needs SOL/USDC before any paid attempt.
  'sol_get_balance',
  'spl-token_getBalance',
  'spl-token_getTokenAccounts',
  'spl-token_getTokenAccount',
  'spl-token_getMint',
  'spl-token_getSupply',
  'sap_x402_get_balance',
  'magicblock_balance',
  'jupiter_getPrice',
  'pyth_getPrice',
  'coingecko_getTokenPrice',
  // Local memory tools — all free, all local
  'sap_memory_record',
  'sap_memory_search',
  'sap_memory_summarize',
  'sap_memory_recall',
  'sap_memory_prune',
  'sap_strategy_save',
  'sap_strategy_load',
  'sap_strategy_list',
  'sap_strategy_activate',
  'sap_stream_buffer',
  'sap_stream_consume',
  'sap_stream_replay',
  'sap_audit_query',
  'sap_audit_record',
  'sap_audit_stats',
  'sap_hermes_search',
  'sap_hermes_recent',
  // Sprint 1-3 tools — free because they read local data or free external APIs.
  'sap_perp_risk_check',
  'sap_perp_portfolio_risk',
  'sap_perp_fear_greed',
  'sap_adrena_simulate_position',
  'sap_strategy_execute',
  'sap_trade_journal',
  'sap_trade_journal_query',
  'sap_payments_start_prepaid',
  'sap_payments_prepaid_balance',
]);

const STRICT_FREE_TOOLS = new Set([
  'sap_agent_start',
  'sap_estimate_tool_cost',
  'sap_agent_runtime_status',
  'sap_agent_next_action',
  'sap_prepare_action',
  'sap_agent_standard_context',
  'sap_prepare_mandate',
  'sap_export_agent_oasf',
  'sap_pricing_catalog',
  'sap_protocol_invariants',
  'sap_agent_identity_plan',
  'sap_profile_current',
  'sap_profile_list',
  'sap_profile_public_key',
  'sap_skills_list',
  'sap_skills_bundle',
  'sap_skills_install',
  'sap_skills_upgrade_plan',
  'sap_runtime_repair_plan',
  'sap_decode_transaction',
  'sap_preview_transaction',
  'sap_x402_estimate_cost',
  'sap_x402_calculate_cost',
  'sap_payments_profile_current',
  'sap_payments_wallet_guard',
  'sap_payments_readiness',
  'sap_payments_prepare_challenge',
  'sap_payments_sign_challenge',
  'sap_payments_call_paid_tool',
  'sap_payments_call_external_x402',
  'sap_payments_register_agent',
  'sap_payments_update_agent',
  'sap_payments_finalize_transaction',
  'sap_payments_verify_receipt',
  'sap_premium_plugin_catalog',
  'sap_stream_catalog',
  'sap_webhook_catalog',
  'sap_premium_validate_plugin_manifest',
  'sap_premium_plugin_template',
  'sap_premium_session_start',
  'sap_premium_session_status',
  'sap_premium_stream_poll',
  'sap_premium_stream_flush',
  'sap_premium_webhook_relay_status',
  'sap_premium_metrics',
  'sap_quick_context',
  'sap_perp_builder_status',
  // Payment readiness and single-asset price checks stay free in strict mode too.
  'sol_get_balance',
  'spl-token_getBalance',
  'spl-token_getTokenAccounts',
  'spl-token_getTokenAccount',
  'spl-token_getMint',
  'spl-token_getSupply',
  'sap_x402_get_balance',
  'magicblock_balance',
  'jupiter_getPrice',
  'pyth_getPrice',
  'coingecko_getTokenPrice',
  // Local memory tools — always free, always local
  'sap_memory_record',
  'sap_memory_search',
  'sap_memory_summarize',
  'sap_memory_recall',
  'sap_memory_prune',
  'sap_strategy_save',
  'sap_strategy_load',
  'sap_strategy_list',
  'sap_strategy_activate',
  'sap_stream_buffer',
  'sap_stream_consume',
  'sap_stream_replay',
  'sap_audit_query',
  'sap_audit_record',
  'sap_audit_stats',
  'sap_hermes_search',
  'sap_hermes_recent',
  // Sprint 1-3 tools — free in strict mode too.
  'sap_perp_risk_check',
  'sap_perp_portfolio_risk',
  'sap_perp_fear_greed',
  'sap_adrena_simulate_position',
  'sap_strategy_execute',
  'sap_trade_journal',
  'sap_trade_journal_query',
  'sap_payments_start_prepaid',
  'sap_payments_prepaid_balance',
]);

const MICRO_READ_TOOLS = new Set([
  'sap_agent_context',
  'sap_get_agent',
  'sap_get_agent_profile',
  'sap_get_agent_stats',
  'sap_get_global_state',
  'sap_is_agent_active',
  'sap_get_network_overview',
  'sap_get_tool_category_summary',
  'sap_find_tools_by_category',
  'sap_fetch_capability_index',
  'sap_fetch_protocol_index',
  'sap_fetch_tool_category_index',
  'sap_x402_has_escrow',
  'sap_x402_fetch_escrow',
  'sap_sns_check_domain',
  // Perps analytics and professional planning — no hosted execution.
  'sap_perp_markets',
  'sap_perp_position_info',
  'sap_perp_funding_history',
  'sap_perp_liquidation_zones',
  'sap_perp_trade_plan',
  'sap_chart_ohlc',
  'sap_chart_long_term',
  'sap_chart_volume_profile',
  // Adrena Data API — lightweight REST reads from datapi.adrena.trade.
  'sap_adrena_get_positions',
  'sap_adrena_get_pool_info',
  'sap_adrena_get_custody_info',
  'sap_adrena_get_trader_info',
  'sap_adrena_get_trader_leaderboard',
  'sap_adrena_get_mutagen',
  'sap_adrena_get_mutagen_leaderboard',
  'sap_adrena_get_prices',
  'sap_adrena_get_trading_prices',
  'sap_adrena_get_position_status',
  // Sprint 1-3 tools — micro-read because they aggregate data in 1 call.
  'sap_perp_signal_score',
  'sap_adrena_get_markets',
  'sap_market_snapshot',
  'sap_chart_indicators',
  'sap_chart_multi_ohlc',
]);

const READ_PREMIUM_TOOLS = new Set([
  'sap_list_all_agents',
  'sap_discover_agents',
  'sap_network_stats',
  'sap_fetch_tool',
  'sap_sns_resolve_domain',
  'sap_sns_resolve_wallet',
  'sap_sns_get_domain_records',
  'sap_sns_get_record',
  'sap_sns_check_ownership',
  'sap_sns_get_domain_pda',
  'sap_sns_get_record_pda',
  'jupiter_getQuote',
  'jupiter_getTokenList',
  'jupiter_getTokenInfo',
  'jupiter_getHoldings',
  'jupiter_programLabels',
  'jupiter_searchTokens',
  'magicblock_swapQuote',
  'pyth_getPriceHistory',
  'pyth_listPriceFeeds',
  'coingecko_getTrending',
  'coingecko_getTopGainersLosers',
  'coingecko_getTokenInfo',
  'coingecko_getPoolsByToken',
  'coingecko_getOHLCV',
  'das_getAsset',
  'das_getAssetsByOwner',
  'das_getAssetsByCreator',
  'das_getAssetsByCollection',
  'das_searchAssets',
]);

const CONDITIONAL_MICRO_READ_TOOLS = new Set([
  'sap_list_agents',
]);

const FREE_DIRECTORY_LIMIT = 20;

const BUILDER_TOOLS = new Set([
  'sap_sns_batch_check_domains',
  'sap_sns_validate_records',
  'sap_sns_build_manage_record_transaction',
  'sap_sns_build_set_primary_domain_transaction',
  'sap_escrow_build_create_transaction',
  'sap_escrow_build_deposit_transaction',
  'sap_escrow_build_settle_transaction',
  'sap_escrow_build_finalize_transaction',
  'sap_escrow_build_withdraw_transaction',
  'sap_escrow_build_close_transaction',
  'sap_x402_build_payment_headers',
  'sap_x402_build_headers_from_escrow',
  'sap_build_sol_transfer',
  'sap_build_spl_transfer',
  'sap_perp_build_order_transaction',
  'jupiter_swapInstructions',
  'magicblock_deposit',
  'magicblock_transfer',
  'magicblock_withdraw',
  'magicblock_initializeMint',
  'magicblock_requestRandomness',
  // Adrena perps protocol — local unsigned transaction builders.
  'sap_adrena_build_open_long',
  'sap_adrena_build_open_short',
  'sap_adrena_build_close_long',
  'sap_adrena_build_close_short',
  'sap_adrena_build_set_stop_loss',
  'sap_adrena_build_set_take_profit',
  'sap_adrena_build_cancel_stop_loss',
  'sap_adrena_build_cancel_take_profit',
  'sap_adrena_build_add_limit_order',
  'sap_adrena_build_cancel_limit_order',
  'sap_adrena_build_open_commodity_long',
  'sap_adrena_build_open_commodity_short',
  'sap_adrena_build_close_commodity_long',
  'sap_adrena_build_close_commodity_short',
  'sap_adrena_build_add_liquidity',
  'sap_adrena_build_remove_liquidity',
  'sap_adrena_build_swap',
  'sap_adrena_build_init_user_staking',
  'sap_adrena_build_add_liquid_stake',
  'sap_adrena_build_remove_liquid_stake',
  'sap_adrena_build_add_locked_stake',
  'sap_adrena_build_claim_stakes',
  // Sprint 1-3 tools — builders that construct unsigned transactions.
  'sap_adrena_build_position_package',
  'sap_adrena_build_trailing_stop',
  'sap_adrena_build_modify_position',
  'sap_adrena_trade_intent',
]);

const VALUE_ACTION_TOOLS = new Set([
  'jupiter_getOrder',
  'jupiter_swap',
  'jupiter_smartSwap',
  'jupiter_executeOrder',
  'jupiter_createLimitOrder',
  'jupiter_executeTrigger',
  'jupiter_cancelLimitOrder',
  'jupiter_cancelLimitOrders',
  'jupiter_createDCA',
  'jupiter_executeDCA',
  'jupiter_cancelDCA',
  'magicblock_swap',
  'sap_x402_prepare_payment',
  'sap_x402_settle',
  'sap_x402_settle_batch',
  'sap_payments_fund_prepaid',
]);

const HEAVY_VALUE_ACTION_TOOLS = new Set([
  'jupiter_executeOrder',
  'jupiter_executeTrigger',
  'jupiter_executeDCA',
  'magicblock_swap',
  'sap_x402_settle_batch',
]);

const VALUE_ACTION_PREFIXES = [
  'sap_register',
  'sap_update',
  'sap_deactivate',
  'sap_reactivate',
  'sap_close',
  'sap_publish',
  'sap_create',
  'sap_fund',
  'sap_cancel',
  'sap_deposit',
  'sap_withdraw',
  'sap_settle',
  'sap_finalize',
  'sap_file',
  'sap_submit',
  'sap_sign',
  'sap_sns_register',
];

const BUILDER_KEYWORDS = [
  'analytics',
  'batch',
  'build',
  'builder',
  'domain',
  'enriched',
  'insight',
  'route',
  'sns',
  'swap',
];

const READ_PREMIUM_KEYWORDS = [
  'discover',
  'index',
  'market',
  'network',
  'overview',
  'price',
  'protocol',
  'stats',
];

/**
 * @name buildPricingCatalog
 * @description Returns the public pricing catalog used by docs, agents, and marketplace metadata.
 */
export function buildPricingCatalog(config: SapMcpMonetizationConfig): PricingCatalog {
  const freeTools = config.strictTools ? STRICT_FREE_TOOLS : FREE_TOOLS;
  return {
    source: 'sap-mcp-pricing-registry',
    version: 1,
    strictTools: Boolean(config.strictTools),
    currency: 'USD',
    tiers: {
      free: {
        paymentRequired: false,
        pricingRule: 'No x402/pay.sh payment challenge. Free calls cover MCP handshake, tool/schema discovery, runtime bootstrap, cost estimation, repair planning, local payment bridge control, payment-readiness balances, single-asset price snapshots, local memory, and transaction preflight.',
        examples: [
          'initialize',
          'tools/list',
          'sap_agent_start',
          'sap_agent_runtime_status',
          'sap_prepare_action',
          'sap_agent_next_action',
          'sap_pricing_catalog',
          'sap_estimate_tool_cost',
          'sap_payments_readiness',
          'sol_get_balance',
          'spl-token_getTokenAccounts',
          'jupiter_getPrice',
          'sap_decode_transaction',
          'sap_preview_transaction',
        ],
      },
      'micro-read': {
        paymentRequired: true,
        priceUsd: clampPrice(config.prices.microReadUsd, config),
        pricingRule: 'Flat micro-read fee for fresh lightweight hosted data beyond readiness. Use these for exact agent/profile reads, compact directory pages, SNS availability checks, escrow state, and lightweight trader context.',
        examples: [
          'sap_agent_context',
          'sap_get_agent_profile',
          'sap_list_agents limit<=20 view=compact',
          'sap_sns_check_domain',
          'sap_perp_trade_plan',
          'sap_chart_ohlc',
        ],
      },
      'read-premium': {
        paymentRequired: true,
        priceUsd: clampPrice(config.prices.readPremiumUsd, config),
        pricingRule: 'Flat premium read/discovery fee per tool call. Broad scans, enriched directory views, analytics, OHLCV/history, quotes/routes, and large pages are paid. Narrow filters, small limits, and pagination are expected.',
        examples: ['sap_discover_agents', 'sap_list_all_agents', 'sap_list_agents view=full', 'jupiter_getQuote', 'pyth_getPriceHistory', 'das_getAsset'],
      },
      builder: {
        paymentRequired: true,
        priceUsd: clampPrice(config.prices.builderUsd, config),
        pricingRule: 'Flat builder fee for unsigned transaction builders, batched domain checks, payment-header builders, routing builders, and complex pre-execution preparation.',
        examples: ['sap_escrow_build_create_transaction', 'sap_sns_build_manage_record_transaction', 'sap_perp_build_order_transaction', 'jupiter_swapInstructions'],
      },
      'value-action': {
        paymentRequired: true,
        priceUsd: clampPrice(config.prices.valueFixedUsd, config),
        pricingRule: `Standard value-action calls are fixed at ${formatUsdPrice(config.prices.valueFixedUsd)}. Heavy execution paths are fixed at ${formatUsdPrice(config.prices.heavyValueUsd)}. Optional notional bps is ${config.prices.valueBps}, then clamped between ${formatUsdPrice(config.prices.minUsd)} and ${formatUsdPrice(config.prices.maxUsd)}. sap_payments_fund_prepaid is exact-priced: the x402 charge equals amountUsd because it becomes hosted prepaid credit.`,
        examples: [
          'jupiter_getOrder',
          'jupiter_swap',
          'magicblock_swap',
          'sap_create_escrow_v2',
          'sap_submit_signed_transaction',
          'sap_payments_fund_prepaid amountUsd=0.25',
        ],
      },
      batch: {
        paymentRequired: true,
        pricingRule: `Sum paid calls in the JSON-RPC batch, then clamp the aggregate between ${formatUsdPrice(config.prices.minUsd)} and ${formatUsdPrice(config.prices.maxUsd)}.`,
        examples: ['JSON-RPC batch with sap_discover_agents + sap_sns_batch_check_domains'],
      },
    },
    toolSets: {
      free: [...freeTools].sort(),
      microRead: [...MICRO_READ_TOOLS].sort(),
      conditionalFree: [],
      conditionalMicroRead: [...CONDITIONAL_MICRO_READ_TOOLS].sort(),
      readPremium: [...READ_PREMIUM_TOOLS].sort(),
      builders: [...BUILDER_TOOLS].sort(),
      valueActions: [...VALUE_ACTION_TOOLS].sort(),
      heavyValueActions: [...HEAVY_VALUE_ACTION_TOOLS].sort(),
      valueActionPrefixes: [...VALUE_ACTION_PREFIXES].sort(),
    },
    runtimeRules: [
      'The x402 Payment Required challenge is the final source of truth for paid hosted calls.',
      `Free tools include control-plane calls, local bridge readiness, SOL/SPL/x402 balance checks, MagicBlock balance, and single-asset price snapshots. Use them before paid calls so agents can detect missing SOL/USDC and ask the user to top up.`,
      `Fresh hosted SAP data beyond readiness starts at the micro-read tier (${formatUsdPrice(config.prices.microReadUsd)}): exact SAP agent/profile reads, compact directory pages, SNS availability checks, escrow state, and lightweight trader context.`,
      `Read-premium calls (${formatUsdPrice(config.prices.readPremiumUsd)}) cover broad discovery, enriched holdings, token lists, OHLCV/history, DAS enrichment, quotes/routes, analytics, and larger pages. Prefer exact IDs and small limits before broad scans.`,
      'Use sap_estimate_tool_cost before any paid tool call to know the exact tier, estimated USD cost, and recommended maxPriceUsd. This avoids silent cap aborts and failed x402 attempts on local-signer-only tools.',
      'Call sap_agent_next_action before retrying payment_required, hosted_local_signer_required, transient RPC failures, missing sap_payments, or submitted signatures that have not confirmed.',
      'Call sap_prepare_action before swaps, registry writes, escrow, external x402 calls, premium streams, or transaction finalization. It returns the fresh-data requirements, local/hosted route, confirmation policy, retry rules, and proof-tape shape without charging x402.',
      'Call sap_perp_builder_status before any perps execution request. Perps analytics can run from hosted data/RPC, but sap_perp_build_order_transaction is registered only when a real unsigned builder provider is configured.',
      'Use session memory for operational context and audit only. Never use memory as cached truth for token prices, Jupiter quotes/orders, balances, blockhashes, simulations, liquidity, routes, or agent account state.',
      `sap_list_agents compact pages with limit <= ${FREE_DIRECTORY_LIMIT} are micro-read. Larger pages, full hydration, sap_discover_agents, and sap_list_all_agents are read-premium.`,
      'Use sap_payments_call_paid_tool for hosted paid tools when the runtime does not replay x402 natively.',
      'Use sap_payments_call_external_x402 for external HTTP x402 agents discovered through SAP registry metadata.',
      'Use hosted unsigned builders plus sap_payments_finalize_transaction for hosted non-custodial transaction flows.',
      'Use sap_premium_plugin_catalog, sap_stream_catalog, sap_webhook_catalog, and sap_premium_session_start before premium streams/webhooks. Planning is free; live premium delivery must be activated by an x402/pay.sh delivery rail and must not be attempted when providerStatus is false.',
      'Do not create temporary signing scripts, read keypair JSON, or call hosted signing tools for user-owned signatures.',
      'If a hosted write returns hosted_local_signer_required, no hosted x402 payment was charged; route to the local sap_payments tool or an unsigned builder.',
    ],
  };
}

/**
 * @name resolvePaymentDecision
 * @description Calculates whether a parsed MCP request requires payment and the exact USD price.
 */
export function resolvePaymentDecision(
  parsedRequest: ParsedMcpRequest,
  config: SapMcpMonetizationConfig,
): PaymentDecision {
  if (parsedRequest.toolCalls.length === 0) {
    const allFreeMethods = parsedRequest.methods.every(method => FREE_MCP_METHODS.has(method));
    return {
      required: false,
      tier: 'free',
      reason: allFreeMethods ? 'free MCP protocol method' : 'non-tool MCP request',
      toolPricings: [],
    };
  }

  const toolPricings = parsedRequest.toolCalls.map(toolCall => priceToolCall(toolCall, config));
  const paidPricings = toolPricings.filter(pricing => pricing.tier !== 'free');

  if (paidPricings.length === 0) {
    return {
      required: false,
      tier: 'free',
      reason: 'all tool calls are in the free tier',
      toolPricings,
    };
  }

  const exactPrice = paidPricings.some(pricing => pricing.exactPrice);
  const priceUsd = exactPrice
    ? paidPricings.reduce((sum, pricing) => sum + pricing.priceUsd, 0)
    : clampPrice(
      paidPricings.reduce((sum, pricing) => sum + pricing.priceUsd, 0),
      config,
    );

  return {
    required: true,
    tier: parsedRequest.isBatch || paidPricings.length > 1 ? 'batch' : toPaidTier(paidPricings[0].tier),
    priceUsd,
    price: formatUsdPrice(priceUsd),
    description: buildPaymentDescription(paidPricings),
    toolPricings,
    toolNames: paidPricings.map(pricing => pricing.toolName),
  };
}

function toPaidTier(tier: PaymentTier): Exclude<PaymentTier, 'free'> {
  if (tier === 'free') {
    return 'read-premium';
  }
  return tier;
}

/**
 * @name priceToolCall
 * @description Classifies and prices a single MCP tool invocation.
 */
export function priceToolCall(
  toolCall: McpToolCall,
  config: SapMcpMonetizationConfig,
): ToolPricing {
  if (toolCall.toolName === 'sap_payments_fund_prepaid') {
    return pricePrepaidFundingToolCall(toolCall, config);
  }

  if (isConditionalMicroReadToolCall(toolCall)) {
    return {
      toolName: toolCall.toolName,
      tier: 'micro-read',
      priceUsd: clampPrice(config.prices.microReadUsd, config),
      reason: 'micro-paid compact fresh data read',
    };
  }

  const tier = classifyTool(toolCall.toolName, config);

  if (tier === 'free') {
    return {
      toolName: toolCall.toolName,
      tier,
      priceUsd: 0,
      reason: 'free tool',
    };
  }

  if (tier === 'micro-read') {
    return {
      toolName: toolCall.toolName,
      tier,
      priceUsd: clampPrice(config.prices.microReadUsd, config),
      reason: 'fresh lightweight hosted data read',
    };
  }

  if (tier === 'read-premium') {
    return {
      toolName: toolCall.toolName,
      tier,
      priceUsd: clampPrice(config.prices.readPremiumUsd, config),
      reason: 'premium read/discovery tool',
    };
  }

  if (tier === 'builder') {
    return {
      toolName: toolCall.toolName,
      tier,
      priceUsd: clampPrice(config.prices.builderUsd, config),
      reason: 'complex builder, batch, SNS, analytics, or routing tool',
    };
  }

  const notionalUsd = extractUsdNotional(toolCall.arguments);
  const baseValueUsd = getValueActionBasePrice(toolCall.toolName, config);
  const variableUsd = notionalUsd === undefined ? 0 : notionalUsd * (config.prices.valueBps / 10_000);

  return {
    toolName: toolCall.toolName,
    tier,
    priceUsd: clampPrice(baseValueUsd + variableUsd, config),
    reason: [
      isHeavyValueActionTool(toolCall.toolName) ? 'heavy value-changing action fixed fee' : 'value-changing action fixed fee',
      variableUsd > 0 ? 'plus configured basis-points fee' : undefined,
    ].filter(Boolean).join(' '),
  };
}

function pricePrepaidFundingToolCall(
  toolCall: McpToolCall,
  config: SapMcpMonetizationConfig,
): ToolPricing {
  const amountUsd = isRecord(toolCall.arguments)
    ? readOptionalNumber(toolCall.arguments['amountUsd'])
    : undefined;
  if (amountUsd === undefined || amountUsd <= 0) {
    return {
      toolName: toolCall.toolName,
      tier: 'value-action',
      priceUsd: Math.max(config.prices.minUsd, 0),
      reason: 'prepaid funding deposit missing amountUsd; minimum x402 guard price applies',
      exactPrice: true,
    };
  }

  return {
    toolName: toolCall.toolName,
    tier: 'value-action',
    priceUsd: Math.max(amountUsd, config.prices.minUsd),
    reason: 'exact prepaid funding deposit; x402 charge equals credited session balance',
    exactPrice: true,
  };
}

function getValueActionBasePrice(toolName: string, config: SapMcpMonetizationConfig): number {
  return isHeavyValueActionTool(toolName)
    ? config.prices.heavyValueUsd
    : config.prices.valueFixedUsd;
}

function isHeavyValueActionTool(toolName: string): boolean {
  return HEAVY_VALUE_ACTION_TOOLS.has(toolName);
}

/**
 * @name classifyTool
 * @description Maps a tool name to the default hosted monetization tier.
 */
export function classifyTool(toolName: string, config?: Pick<SapMcpMonetizationConfig, 'strictTools'>): PaymentTier {
  const freeTools = config?.strictTools ? STRICT_FREE_TOOLS : FREE_TOOLS;
  if (freeTools.has(toolName)) {
    return 'free';
  }

  if (READ_PREMIUM_TOOLS.has(toolName)) {
    return 'read-premium';
  }

  if (MICRO_READ_TOOLS.has(toolName)) {
    return 'micro-read';
  }

  if (CONDITIONAL_MICRO_READ_TOOLS.has(toolName)) {
    return 'read-premium';
  }

  if (BUILDER_TOOLS.has(toolName)) {
    return 'builder';
  }

  if (VALUE_ACTION_TOOLS.has(toolName)) {
    return 'value-action';
  }

  if (VALUE_ACTION_PREFIXES.some(prefix => toolName.startsWith(prefix))) {
    return 'value-action';
  }

  const normalized = toolName.toLowerCase();
  if (BUILDER_KEYWORDS.some(keyword => normalized.includes(keyword))) {
    return 'builder';
  }

  if (READ_PREMIUM_KEYWORDS.some(keyword => normalized.includes(keyword))) {
    return 'read-premium';
  }

  return 'read-premium';
}

function isConditionalMicroReadToolCall(toolCall: McpToolCall): boolean {
  if (toolCall.toolName !== 'sap_list_agents') {
    return false;
  }
  const args = isRecord(toolCall.arguments) ? toolCall.arguments : {};
  const limit = readOptionalNumber(args.limit) ?? FREE_DIRECTORY_LIMIT;
  const view = typeof args.view === 'string' ? args.view : undefined;
  const hydrate = args.hydrate === true;
  const includeProtocolIndexes = args.includeProtocolIndexes === true;

  return limit <= FREE_DIRECTORY_LIMIT
    && !hydrate
    && view !== 'full'
    && !includeProtocolIndexes;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * @name formatUsdPrice
 * @description Formats a decimal USD price for x402 money parsing while preserving small prices.
 */
export function formatUsdPrice(priceUsd: number): string {
  const fixed = priceUsd.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return `$${fixed}`;
}

function clampPrice(priceUsd: number, config: SapMcpMonetizationConfig): number {
  const minimum = Math.max(config.prices.minUsd, 0);
  const maximum = Math.max(config.prices.maxUsd, minimum);
  return Math.min(maximum, Math.max(minimum, priceUsd));
}

function buildPaymentDescription(toolPricings: ToolPricing[]): string {
  if (toolPricings.length === 1) {
    const [pricing] = toolPricings;
    return `SAP MCP paid tool call: ${pricing.toolName} (${pricing.tier})`;
  }

  return `SAP MCP paid batch: ${toolPricings.length} tool calls`;
}

function extractUsdNotional(value: unknown, depth = 0): number | undefined {
  if (depth > 4 || !isRecord(value)) {
    return undefined;
  }

  const candidateKeys = [
    'amountUsd',
    'usdAmount',
    'valueUsd',
    'usdValue',
    'notionalUsd',
    'settlementUsd',
    'paymentUsd',
  ];

  for (const key of candidateKeys) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
    if (typeof candidate === 'string') {
      const parsed = Number.parseFloat(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  for (const nested of Object.values(value)) {
    const nestedValue = extractUsdNotional(nested, depth + 1);
    if (nestedValue !== undefined) {
      return nestedValue;
    }
  }

  return undefined;
}
