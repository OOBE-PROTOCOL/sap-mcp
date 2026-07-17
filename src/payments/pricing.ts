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
export type PaymentTier = 'free' | 'read-premium' | 'builder' | 'value-action' | 'batch';

/**
 * @name ToolPricing
 * @description Resolved price classification for one tool call.
 */
export interface ToolPricing {
  toolName: string;
  tier: PaymentTier;
  priceUsd: number;
  reason: string;
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
  'sol_get_balance',
  'spl-token_getBalance',
  'spl-token_getTokenAccounts',
  'spl-token_getTokenAccount',
  'spl-token_getMint',
  'spl-token_getSupply',
  'sap_profile_current',
  'sap_profile_list',
  'sap_profile_public_key',
  'sap_skills_list',
  'sap_skills_bundle',
  'sap_skills_install',
  'sap_get_network_overview',
  'sap_get_tool_category_summary',
  'sap_find_tools_by_category',
  'sap_fetch_capability_index',
  'sap_fetch_protocol_index',
  'sap_fetch_tool_category_index',
  'sap_decode_transaction',
  'sap_preview_transaction',
  'sap_x402_estimate_cost',
  'sap_x402_calculate_cost',
  'sap_x402_has_escrow',
  'sap_x402_fetch_escrow',
  'sap_x402_get_balance',
  'sap_payments_profile_current',
  'sap_payments_readiness',
  'sap_payments_prepare_challenge',
  'sap_payments_sign_challenge',
  'sap_payments_call_paid_tool',
  'sap_payments_verify_receipt',
]);

const STRICT_FREE_TOOLS = new Set([
  'sap_agent_start',
  'sap_profile_current',
  'sap_profile_list',
  'sap_profile_public_key',
  'sap_skills_list',
  'sap_skills_bundle',
  'sap_skills_install',
  'sap_decode_transaction',
  'sap_preview_transaction',
  'sap_x402_estimate_cost',
  'sap_x402_calculate_cost',
  'sap_payments_profile_current',
  'sap_payments_readiness',
  'sap_payments_prepare_challenge',
  'sap_payments_sign_challenge',
  'sap_payments_call_paid_tool',
  'sap_payments_verify_receipt',
]);

const READ_PREMIUM_TOOLS = new Set([
  'sap_list_all_agents',
  'sap_discover_agents',
  'sap_list_agents',
  'sap_network_stats',
  'sap_fetch_tool',
  'sap_sns_check_domain',
  'sap_sns_resolve_domain',
  'sap_sns_resolve_wallet',
  'sap_sns_get_domain_records',
  'sap_sns_get_record',
  'sap_sns_check_ownership',
  'sap_sns_get_domain_pda',
  'sap_sns_get_record_pda',
  'jupiter_getQuote',
  'jupiter_getPrice',
  'jupiter_getTokenList',
  'jupiter_getTokenInfo',
  'jupiter_getHoldings',
  'jupiter_programLabels',
  'jupiter_searchTokens',
  'magicblock_swapQuote',
  'pyth_getPrice',
  'pyth_getPriceHistory',
  'pyth_listPriceFeeds',
  'coingecko_getTokenPrice',
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

const BUILDER_TOOLS = new Set([
  'sap_sns_batch_check_domains',
  'sap_sns_validate_records',
  'sap_sns_build_manage_record_transaction',
  'sap_sns_build_set_primary_domain_transaction',
  'sap_x402_build_payment_headers',
  'sap_x402_build_headers_from_escrow',
  'jupiter_swapInstructions',
  'magicblock_deposit',
  'magicblock_transfer',
  'magicblock_withdraw',
  'magicblock_initializeMint',
  'magicblock_requestRandomness',
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

  const priceUsd = clampPrice(
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
  const tier = classifyTool(toolCall.toolName, config);

  if (tier === 'free') {
    return {
      toolName: toolCall.toolName,
      tier,
      priceUsd: 0,
      reason: 'free tool',
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
  const variableUsd = notionalUsd === undefined ? 0 : notionalUsd * (config.prices.valueBps / 10_000);

  return {
    toolName: toolCall.toolName,
    tier,
    priceUsd: clampPrice(config.prices.valueFixedUsd + variableUsd, config),
    reason: notionalUsd === undefined
      ? 'value-changing action fixed fee'
      : 'value-changing action fixed fee plus configured basis-points fee',
  };
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
