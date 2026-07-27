/**
 * @name tools/adrena/adrena-trading-tools
 * @description Trading builder tool registrations for Adrena perps:
 *   open/close long/short, set/cancel stop loss, set/cancel take profit.
 *
 * @module tools/adrena/adrena-trading-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/types.js';
import { createTextResponse } from '../../adapters/mcp/tool-response.js';
import { registerTool } from '../../adapters/mcp/sdk-compat.js';
import {
  buildOpenPositionLong,
  buildOpenPositionShort,
  buildClosePositionLong,
  buildClosePositionShort,
  buildSetStopLoss,
  buildSetTakeProfit,
  buildCancelStopLoss,
  buildCancelTakeProfit,
  type PositionSide,
} from '../../perps/adrena/index.js';
import {
  MAIN_POOL_TOKENS,
  COMMODITY_TOKENS,
  COLLATERAL_TOKENS,
  priceToRaw,
  getConnection,
  parsePublicKey,
  type JsonSchema,
} from './adrena-helpers.js';

/* ═══════════════════════════════════════════════════════════════════
 *  Trading Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaOpenLongTool
 * @description Register sap_adrena_build_open_long.
 * @internal
 */
export function registerAdrenaOpenLongTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58). This is the fee payer and signer.' },
      principalToken: { type: 'string', description: 'Asset to trade (long). Supported: JITOSOL, WBTC, BONK.', enum: MAIN_POOL_TOKENS },
      collateralToken: { type: 'string', description: 'Collateral token. Must match principal for longs. Supported: JITOSOL, WBTC, BONK.', enum: COLLATERAL_TOKENS },
      collateralAmount: { type: 'number', description: 'Collateral amount in human-readable units (e.g. 10 = 10 JITOSOL).', minimum: 0 },
      leverage: { type: 'number', description: 'Leverage multiplier (e.g. 3 = 3x).', minimum: 1, maximum: 100 },
      priceUsd: { type: 'number', description: 'Optional limit price in USD. Omit for market order.', minimum: 0 },
    },
    required: ['owner', 'principalToken', 'collateralToken', 'collateralAmount', 'leverage'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_open_long', {
    description: 'Build an unsigned transaction to open or increase a long perp position on Adrena. Returns transactionBase64 for local signing via sap_payments_finalize_transaction. The agent must sign locally — SAP MCP never signs user-owned perp transactions.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const collateralAmount = Number(args['collateralAmount']);
      const leverage = Number(args['leverage']);
      const priceUsd = args['priceUsd'] !== undefined ? Number(args['priceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;

      const result = await buildOpenPositionLong(
        getConnection(context), owner, principalToken, collateralToken, collateralAmount, leverage, price,
      );
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build open long transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaOpenShortTool
 * @description Register sap_adrena_build_open_short.
 * @internal
 */
export function registerAdrenaOpenShortTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset to short. Supported: JITOSOL, WBTC, BONK.', enum: MAIN_POOL_TOKENS },
      collateralToken: { type: 'string', description: 'Collateral token. Must be USDC for shorts.', enum: ['USDC'] },
      collateralAmount: { type: 'number', description: 'Collateral (USDC) amount in human-readable units.', minimum: 0 },
      leverage: { type: 'number', description: 'Leverage multiplier.', minimum: 1, maximum: 100 },
      priceUsd: { type: 'number', description: 'Optional limit price in USD. Omit for market order.', minimum: 0 },
    },
    required: ['owner', 'principalToken', 'collateralToken', 'collateralAmount', 'leverage'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_open_short', {
    description: 'Build an unsigned transaction to open or increase a short perp position on Adrena. Collateral must be USDC for shorts. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const collateralAmount = Number(args['collateralAmount']);
      const leverage = Number(args['leverage']);
      const priceUsd = args['priceUsd'] !== undefined ? Number(args['priceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;

      const result = await buildOpenPositionShort(
        getConnection(context), owner, principalToken, collateralToken, collateralAmount, leverage, price,
      );
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build open short transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaCloseLongTool
 * @description Register sap_adrena_build_close_long.
 * @internal
 */
export function registerAdrenaCloseLongTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset of the position. Supported: JITOSOL, WBTC, BONK.', enum: MAIN_POOL_TOKENS },
      priceUsd: { type: 'number', description: 'Optional close price in USD. Omit for market close.', minimum: 0 },
      percentage: { type: 'number', description: 'Percentage to close (0-1000000, where 1000000 = 100%). Default 1000000.', minimum: 0, maximum: 1000000 },
    },
    required: ['owner', 'principalToken'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_close_long', {
    description: 'Build an unsigned transaction to close a long perp position on Adrena. Default closes 100% at market price. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const priceUsd = args['priceUsd'] !== undefined ? Number(args['priceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;
      const percentage = args['percentage'] !== undefined ? BigInt(Math.floor(Number(args['percentage']))) : 1_000_000n;

      const result = await buildClosePositionLong(getConnection(context), owner, principalToken, price, percentage);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build close long transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaCloseShortTool
 * @description Register sap_adrena_build_close_short.
 * @internal
 */
export function registerAdrenaCloseShortTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset of the position.', enum: MAIN_POOL_TOKENS },
      collateralToken: { type: 'string', description: 'Collateral token. USDC for shorts.', enum: ['USDC'] },
      priceUsd: { type: 'number', description: 'Optional close price in USD.', minimum: 0 },
      percentage: { type: 'number', description: 'Percentage to close (0-1000000). Default 1000000.', minimum: 0, maximum: 1000000 },
    },
    required: ['owner', 'principalToken', 'collateralToken'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_close_short', {
    description: 'Build an unsigned transaction to close a short perp position on Adrena. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const priceUsd = args['priceUsd'] !== undefined ? Number(args['priceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;
      const percentage = args['percentage'] !== undefined ? BigInt(Math.floor(Number(args['percentage']))) : 1_000_000n;

      const result = await buildClosePositionShort(getConnection(context), owner, principalToken, collateralToken, price, percentage);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build close short transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  SL / TP Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaSetStopLossTool
 * @description Register sap_adrena_build_set_stop_loss.
 * @internal
 */
export function registerAdrenaSetStopLossTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset of the position.', enum: [...MAIN_POOL_TOKENS, ...COMMODITY_TOKENS] },
      side: { type: 'string', description: 'Position side.', enum: ['long', 'short'] },
      stopLossPriceUsd: { type: 'number', description: 'Stop loss trigger price in USD.', minimum: 0 },
      closePositionPriceUsd: { type: 'number', description: 'Optional close position price in USD. If set, the position closes at this price when triggered.', minimum: 0 },
    },
    required: ['owner', 'principalToken', 'side', 'stopLossPriceUsd'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_set_stop_loss', {
    description: 'Build an unsigned transaction to set stop loss on an Adrena position. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const side = args['side'] === 'short' ? 'short' : 'long';
      const stopLossPriceUsd = Number(args['stopLossPriceUsd']);
      const closePositionPriceUsd = args['closePositionPriceUsd'] !== undefined ? Number(args['closePositionPriceUsd']) : null;
      const stopLossLimitPrice = priceToRaw(stopLossPriceUsd);
      const closePositionPrice = closePositionPriceUsd !== null ? priceToRaw(closePositionPriceUsd) : null;

      const result = await buildSetStopLoss(getConnection(context), owner, principalToken, side as PositionSide, stopLossLimitPrice, closePositionPrice);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build set stop loss transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaSetTakeProfitTool
 * @description Register sap_adrena_build_set_take_profit.
 * @internal
 */
export function registerAdrenaSetTakeProfitTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset of the position.', enum: [...MAIN_POOL_TOKENS, ...COMMODITY_TOKENS] },
      side: { type: 'string', description: 'Position side.', enum: ['long', 'short'] },
      takeProfitPriceUsd: { type: 'number', description: 'Take profit trigger price in USD.', minimum: 0 },
    },
    required: ['owner', 'principalToken', 'side', 'takeProfitPriceUsd'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_set_take_profit', {
    description: 'Build an unsigned transaction to set take profit on an Adrena position. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const side = args['side'] === 'short' ? 'short' : 'long';
      const takeProfitPriceUsd = Number(args['takeProfitPriceUsd']);
      const takeProfitLimitPrice = priceToRaw(takeProfitPriceUsd);

      const result = await buildSetTakeProfit(getConnection(context), owner, principalToken, side as PositionSide, takeProfitLimitPrice);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build set take profit transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaCancelStopLossTool
 * @description Register sap_adrena_build_cancel_stop_loss.
 * @internal
 */
export function registerAdrenaCancelStopLossTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset of the position.', enum: [...MAIN_POOL_TOKENS, ...COMMODITY_TOKENS] },
      side: { type: 'string', description: 'Position side.', enum: ['long', 'short'] },
    },
    required: ['owner', 'principalToken', 'side'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_cancel_stop_loss', {
    description: 'Build an unsigned transaction to cancel stop loss on an Adrena position. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const side = args['side'] === 'short' ? 'short' : 'long';

      const result = await buildCancelStopLoss(getConnection(context), owner, principalToken, side as PositionSide);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build cancel stop loss transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaCancelTakeProfitTool
 * @description Register sap_adrena_build_cancel_take_profit.
 * @internal
 */
export function registerAdrenaCancelTakeProfitTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset of the position.', enum: [...MAIN_POOL_TOKENS, ...COMMODITY_TOKENS] },
      side: { type: 'string', description: 'Position side.', enum: ['long', 'short'] },
    },
    required: ['owner', 'principalToken', 'side'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_cancel_take_profit', {
    description: 'Build an unsigned transaction to cancel take profit on an Adrena position. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const side = args['side'] === 'short' ? 'short' : 'long';

      const result = await buildCancelTakeProfit(getConnection(context), owner, principalToken, side as PositionSide);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build cancel take profit transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}