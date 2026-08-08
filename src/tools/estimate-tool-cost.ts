/**
 * @module estimate-tool-cost
 * @description Free pre-call cost estimator. Lets agents know the exact hosted
 *   pricing tier and estimated USD cost before they call a paid tool.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse, createUiCardResponse } from '../adapters/mcp/tool-response.js';
import type { UiCardContext } from '../ui/ui-resources.js';
import type { SapMcpContext } from '../core/types.js';
import {
  formatUsdPrice,
  priceToolCall,
  type PaymentTier,
} from '../payments/pricing.js';
import { isHostedAccountlessBlockedTool } from '../payments/hosted-tool-eligibility.js';
import { canonicalizeToolName } from './tool-aliases.js';

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
        'Free pre-call cost estimator (dry-run — no charge, no x402 challenge). Given a tool name, returns the hosted pricing tier, estimated USD cost, and the recommended maxPriceUsd to pass to sap_payments_call_paid_tool. Always call this before any paid tool to avoid silent cap aborts. Set your maxPriceUsd to the estimate × 1.25 to avoid abort-and-retry. This tool is always free and never triggers x402 settlement.',
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
          return createTextResponse(JSON.stringify({
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
          }, null, 2));
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
        return createUiCardResponse(estimateResult as unknown as Record<string, unknown>, cardCtx);
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
