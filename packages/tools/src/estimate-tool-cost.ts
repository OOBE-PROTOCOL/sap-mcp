/**
 * @module estimate-tool-cost
 * @description Free pre-call cost estimator. Lets agents know the exact hosted
 *   pricing tier and estimated USD cost before they call a paid tool.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import type { UiCardContext } from '../../ui-cards/src/ui-resources.js';
import type { SapMcpContext } from '../../core/src/types.js';
import {
  formatUsdPrice,
  priceToolCall,
  type PaymentTier,
} from '../../payments/src/pricing.js';
import { isHostedAccountlessBlockedTool } from '../../payments/src/hosted-tool-eligibility.js';
import { canonicalizeToolName } from './tool-aliases.js';
import {
  createToolFamilyPipelineResult,
  registerToolFamilyPipelineTool,
} from './tool-family-pipeline.js';

const EstimateToolCostInputSchema = z.object({
  toolName: z.string().min(1).describe('The MCP tool name to estimate, such as jupiter_getQuote, magicblock_swap, or sap_discover_agents.'),
  arguments: z.record(z.unknown()).optional().describe('Optional tool arguments. For value-action tools, the amount or size may affect the price.'),
}).passthrough().describe('Estimate Tool Cost input schema.');

type EstimateToolCostInput = z.infer<typeof EstimateToolCostInputSchema>;
type EstimateTier = PaymentTier | 'local-signer-only';

interface ToolCostEstimate {
  toolName: string;
  tier: EstimateTier;
  priceUsd: number;
  priceFormatted: string;
  paymentRequired: boolean;
  maxPriceUsdHint: string;
  reason: string;
}

/**
 * @name registerEstimateToolCost
 * @description Registers the free sap_estimate_tool_cost tool.
 */
export function registerEstimateToolCost(server: Server, context: SapMcpContext): void {
  registerToolFamilyPipelineTool<EstimateToolCostInput, Record<string, unknown>>(
    server,
    context,
    'sap_estimate_tool_cost',
    {
      title: 'Estimate Tool Cost',
      description:
        'Free pre-call cost estimator (dry-run — no charge, no x402 challenge). Given a tool name, returns the hosted pricing tier, estimated USD cost, and the recommended maxPriceUsd to pass to sap_payments_call_paid_tool. Always call this before any paid tool to avoid silent cap aborts. Set your maxPriceUsd to the estimate × 1.25 to avoid abort-and-retry. This tool is always free and never triggers x402 settlement.',
      inputSchema: EstimateToolCostInputSchema,
    },
    async (input) => {
      const toolName = input?.toolName;
      const canonicalToolName = canonicalizeToolName(toolName);
      const monetization = context.config.monetization;
      const pricing = priceToolCall({
        toolName: canonicalToolName,
        arguments: input.arguments,
      }, monetization);
      const tier = pricing.tier;

      // Check if this tool is local-signer-only (never x402, always blocked on hosted)
      const isLocalSignerOnly = context.config.mode === 'hosted-api'
        && !context.config.walletPath
        && !context.config.externalSignerUrl
        && isHostedAccountlessBlockedTool(canonicalToolName);

      if (isLocalSignerOnly) {
        return {
          success: true,
          estimate: {
            toolName: canonicalToolName,
            requestedToolName: toolName === canonicalToolName ? undefined : toolName,
            tier: 'local-signer-only',
            priceUsd: 0,
            priceFormatted: '$0',
            paymentRequired: false,
            maxPriceUsdHint: 'no x402 payment — this tool requires a local signer',
            reason: 'This tool requires a local Solana signature and cannot be executed on the hosted accountless server. No x402 payment will be charged.',
          },
          hint: 'Do NOT use sap_payments_call_paid_tool for this tool. The hosted server will not issue an x402 challenge because the operation requires a user signer, not an access payment. Use the local sap_payments equivalent instead: check sap_payments_readiness first, then call the local signer tool directly (e.g. sap_payments_register_agent, sap_payments_update_agent, sap_payments_finalize_transaction).',
        };
      }

      const priceUsd = pricing.priceUsd;

      const estimate: ToolCostEstimate = {
        toolName: canonicalToolName,
        tier,
        priceUsd,
        priceFormatted: formatUsdPrice(priceUsd),
        paymentRequired: tier !== 'free',
        maxPriceUsdHint: tier === 'free'
          ? 'no maxPriceUsd needed — this tool is free'
          : `Set maxPriceUsd to at least ${formatUsdPrice(priceUsd * 1.5)} to allow for price variance. For sap_payments_call_paid_tool, pass maxPriceUsd: ${(priceUsd * 1.5).toFixed(6)}.`,
        reason: pricing.reason,
      };

      const estimateResult = {
        success: true,
        requestedToolName: toolName === canonicalToolName ? undefined : toolName,
        estimate,
        hint: tier === 'free'
          ? 'This tool is free. Call it directly without sap_payments_call_paid_tool.'
          : `This tool requires x402 payment. Use sap_payments_call_paid_tool with toolName="${canonicalToolName}" and maxPriceUsd >= ${priceUsd.toFixed(6)}. The actual x402 challenge is the final source of truth for pricing.`,
      };
      const cardCtx: UiCardContext = {
        kind: 'pricing',
        toolName: canonicalToolName,
        tier,
        priceUsd,
        recommendedMaxPriceUsd: priceUsd * 1.5,
        isFree: tier === 'free',
      };
      return createToolFamilyPipelineResult(
        estimateResult as unknown as Record<string, unknown>,
        {
          tier,
          priceUsd,
          cardKind: cardCtx.kind,
        },
      );
    },
    {
      uiCard: (result) => buildPricingCardContext(result.data),
    },
  );
}

function buildPricingCardContext(data: Record<string, unknown>): UiCardContext | undefined {
  const estimate = data.estimate;
  if (!estimate || typeof estimate !== 'object' || Array.isArray(estimate)) {
    return undefined;
  }

  const record = estimate as Record<string, unknown>;
  const toolName = typeof record.toolName === 'string' ? record.toolName : undefined;
  const tier = typeof record.tier === 'string' ? record.tier : undefined;
  const priceUsd = typeof record.priceUsd === 'number' ? record.priceUsd : undefined;
  if (!toolName || !tier || priceUsd === undefined) {
    return undefined;
  }

  return {
    kind: 'pricing',
    toolName,
    tier,
    priceUsd,
    recommendedMaxPriceUsd: priceUsd * 1.5,
    isFree: priceUsd === 0,
  };
}
