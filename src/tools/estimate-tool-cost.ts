/**
 * @module estimate-tool-cost
 * @description Free pre-call cost estimator. Lets agents know the exact hosted
 *   pricing tier and estimated USD cost before they call a paid tool.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import type { SapMcpContext } from '../core/types.js';
import {
  classifyTool,
  formatUsdPrice,
  type PaymentTier,
} from '../payments/pricing.js';
import { isHostedAccountlessBlockedTool } from '../payments/hosted-tool-eligibility.js';

interface EstimateToolCostInput {
  toolName: string;
  arguments?: Record<string, unknown>;
}

interface ToolCostEstimate {
  toolName: string;
  tier: PaymentTier;
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
  registerTool(
    server,
    'sap_estimate_tool_cost',
    {
      title: 'Estimate Tool Cost',
      description:
        'Free pre-call cost estimator. Given a tool name, returns the hosted pricing tier, estimated USD cost, and the recommended maxPriceUsd to pass to sap_payments_call_paid_tool. Call this before any paid tool to avoid silent cap aborts and plan USDC spending.',
      inputSchema: {
        type: 'object',
        properties: {
          toolName: {
            type: 'string',
            description: 'The MCP tool name to estimate (e.g. "jupiter_getQuote", "magicblock_swap", "sap_discover_agents").',
          },
          arguments: {
            type: 'object',
            description: 'Optional tool arguments. For value-action tools, the amount/size may affect the price.',
            additionalProperties: true,
          },
        },
        required: ['toolName'],
      },
    },
    async (raw: unknown) => {
      try {
        const input = raw as EstimateToolCostInput;
        const toolName = input?.toolName;

        if (!toolName || typeof toolName !== 'string') {
          return createTextResponse(
            JSON.stringify({
              error: 'missing_required_field: toolName',
              message: 'toolName is required. Pass the MCP tool name you want to estimate.',
            }, null, 2),
            { isError: true },
          );
        }

        const monetization = context.config.monetization;
        const strictTools = monetization?.strictTools ?? false;
        const tier = classifyTool(toolName, { strictTools });

        // Check if this tool is local-signer-only (never x402, always blocked on hosted)
        const isLocalSignerOnly = context.config.mode === 'hosted-api'
          && !context.config.walletPath
          && !context.config.externalSignerUrl
          && isHostedAccountlessBlockedTool(toolName);

        if (isLocalSignerOnly) {
          return createTextResponse(JSON.stringify({
            success: true,
            estimate: {
              toolName,
              tier: 'local-signer-only',
              priceUsd: 0,
              priceFormatted: '$0',
              paymentRequired: false,
              maxPriceUsdHint: 'no x402 payment — this tool requires a local signer',
              reason: 'This tool requires a local Solana signature and cannot be executed on the hosted accountless server. No x402 payment will be charged.',
            },
            hint: `Do NOT use sap_payments_call_paid_tool for this tool — it will fail with "Invalid payment required response" because the hosted server never issues a 402 challenge. Instead, use the local sap_payments equivalent: check sap_payments_readiness first, then use the local signer tool directly (e.g. sap_payments_register_agent, sap_payments_update_agent, sap_payments_finalize_transaction).`,
          }, null, 2));
        }

        let priceUsd = 0;
        let reason = 'free tool — no x402 payment required';

        if (tier !== 'free') {
          const prices = monetization?.prices;
          if (prices) {
            switch (tier) {
              case 'read-premium':
                priceUsd = prices.readPremiumUsd;
                reason = 'premium read/discovery tool';
                break;
              case 'builder':
                priceUsd = prices.builderUsd;
                reason = 'complex builder, batch, SNS, analytics, or routing tool';
                break;
              case 'value-action':
                priceUsd = prices.valueFixedUsd;
                reason = 'value-changing action fixed fee (plus bps on notional if applicable)';
                break;
              case 'batch':
                priceUsd = prices.valueFixedUsd;
                reason = 'batch call — sum of individual tool costs, clamped';
                break;
              default:
                priceUsd = prices.readPremiumUsd;
                reason = 'unknown tier — defaulting to read-premium';
            }
          } else {
            // Fallback to defaults if monetization config is not available
            switch (tier) {
              case 'read-premium': priceUsd = 0.001; break;
              case 'builder': priceUsd = 0.008; break;
              case 'value-action': priceUsd = 0.20; break;
              default: priceUsd = 0.001;
            }
          }
        }

        const estimate: ToolCostEstimate = {
          toolName,
          tier,
          priceUsd,
          priceFormatted: formatUsdPrice(priceUsd),
          paymentRequired: tier !== 'free',
          maxPriceUsdHint: tier === 'free'
            ? 'no maxPriceUsd needed — this tool is free'
            : `Set maxPriceUsd to at least ${formatUsdPrice(priceUsd * 1.5)} to allow for price variance. For sap_payments_call_paid_tool, pass maxPriceUsd: ${(priceUsd * 1.5).toFixed(6)}.`,
          reason,
        };

        return createTextResponse(JSON.stringify({
          success: true,
          estimate,
          hint: tier === 'free'
            ? 'This tool is free. Call it directly without sap_payments_call_paid_tool.'
            : `This tool requires x402 payment. Use sap_payments_call_paid_tool with toolName="${toolName}" and maxPriceUsd >= ${priceUsd.toFixed(6)}. The actual x402 challenge is the final source of truth for pricing.`,
        }, null, 2));
      } catch (error) {
        return createTextResponse(
          JSON.stringify({
            error: 'estimate_failed',
            message: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2),
          { isError: true },
        );
      }
    },
  );
}