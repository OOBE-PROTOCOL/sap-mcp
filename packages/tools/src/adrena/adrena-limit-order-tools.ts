/**
 * @name tools/adrena/adrena-limit-order-tools
 * @description Limit order builder tool registrations for Adrena perps:
 *   add limit order, cancel limit order.
 *
 * @module tools/adrena/adrena-limit-order-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import {
  adrenaPipelineException,
  adrenaPipelineOk,
  registerAdrenaPipelineTool,
} from './adrena-pipeline.js';
import {
  buildAddLimitOrder,
  buildCancelLimitOrder,
  type PositionSide,
} from '../../../perps/src/adrena/index.js';
import {
  MAIN_POOL_TOKENS,
  COLLATERAL_TOKENS,
  priceToRaw,
  getConnection,
  parsePublicKey,
  type JsonSchema,
} from './adrena-helpers.js';

/* ═══════════════════════════════════════════════════════════════════
 *  Limit Order Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaAddLimitOrderTool
 * @description Register sap_adrena_build_add_limit_order.
 * @internal
 */
export function registerAdrenaAddLimitOrderTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Order owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset to trade.', enum: MAIN_POOL_TOKENS },
      collateralToken: { type: 'string', description: 'Collateral token.', enum: COLLATERAL_TOKENS },
      collateralAmount: { type: 'number', description: 'Collateral amount in human-readable units.', minimum: 0 },
      leverage: { type: 'number', description: 'Leverage multiplier.', minimum: 1, maximum: 100 },
      side: { type: 'string', description: 'Order side.', enum: ['long', 'short'] },
      triggerPriceUsd: { type: 'number', description: 'Trigger price in USD. Order fills when oracle reaches this price.', minimum: 0 },
      limitPriceUsd: { type: 'number', description: 'Optional limit price cap. Omit for market price at fill.', minimum: 0 },
    },
    required: ['owner', 'principalToken', 'collateralToken', 'collateralAmount', 'leverage', 'side', 'triggerPriceUsd'],
    additionalProperties: false,
  };

  registerAdrenaPipelineTool(server, context, 'sap_adrena_build_add_limit_order', {
    description: 'Build an unsigned transaction to place a limit order on Adrena. The order fills when the oracle price reaches the trigger price. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const collateralAmount = Number(args['collateralAmount']);
      const leverage = Number(args['leverage']);
      const side = args['side'] === 'short' ? 'short' : 'long';
      const triggerPriceUsd = Number(args['triggerPriceUsd']);
      const limitPriceUsd = args['limitPriceUsd'] !== undefined ? Number(args['limitPriceUsd']) : null;
      const triggerPrice = priceToRaw(triggerPriceUsd);
      const limitPrice = limitPriceUsd !== null ? priceToRaw(limitPriceUsd) : null;

      const result = await buildAddLimitOrder(getConnection(context), owner, principalToken, collateralToken, collateralAmount, leverage, side as PositionSide, triggerPrice, limitPrice);
      return adrenaPipelineOk(result);
    } catch (err) {
      return adrenaPipelineException('Failed to build add limit order transaction', err);
    }
  });
}

/**
 * @name registerAdrenaCancelLimitOrderTool
 * @description Register sap_adrena_build_cancel_limit_order.
 * @internal
 */
export function registerAdrenaCancelLimitOrderTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Order owner wallet public key (base58).' },
      collateralToken: { type: 'string', description: 'Collateral token used for the order.', enum: COLLATERAL_TOKENS },
      orderId: { type: 'number', description: 'Limit order ID to cancel.' },
    },
    required: ['owner', 'collateralToken', 'orderId'],
    additionalProperties: false,
  };

  registerAdrenaPipelineTool(server, context, 'sap_adrena_build_cancel_limit_order', {
    description: 'Build an unsigned transaction to cancel a limit order on Adrena. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const orderId = BigInt(Math.floor(Number(args['orderId'])));

      const result = await buildCancelLimitOrder(getConnection(context), owner, collateralToken, orderId);
      return adrenaPipelineOk(result);
    } catch (err) {
      return adrenaPipelineException('Failed to build cancel limit order transaction', err);
    }
  });
}
