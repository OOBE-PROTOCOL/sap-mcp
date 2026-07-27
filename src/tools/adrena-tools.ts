/**
 * @name tools/adrena-tools
 * @description MCP tool registrations for the Adrena perps protocol integration.
 *
 * Registers local unsigned transaction builders for all Adrena operations:
 *
 *   Trading builders (10):
 *     - sap_adrena_build_open_long         — Open/increase a long perp position.
 *     - sap_adrena_build_open_short        — Open/increase a short perp position.
 *     - sap_adrena_build_close_long        — Close a long perp position.
 *     - sap_adrena_build_close_short       — Close a short perp position.
 *     - sap_adrena_build_set_stop_loss     — Set stop loss on a position.
 *     - sap_adrena_build_set_take_profit   — Set take profit on a position.
 *     - sap_adrena_build_cancel_stop_loss  — Cancel stop loss.
 *     - sap_adrena_build_cancel_take_profit— Cancel take profit.
 *     - sap_adrena_build_add_limit_order   — Place a limit order.
 *     - sap_adrena_build_cancel_limit_order— Cancel a limit order.
 *
 *   Commodity builders (4):
 *     - sap_adrena_build_open_commodity_long  — Open a commodity long (XAU/XAG/WTI).
 *     - sap_adrena_build_open_commodity_short — Open a commodity short.
 *     - sap_adrena_build_close_commodity_long — Close a commodity long.
 *     - sap_adrena_build_close_commodity_short— Close a commodity short.
 *
 *   Liquidity & Swap builders (3):
 *     - sap_adrena_build_add_liquidity     — Add liquidity to a pool.
 *     - sap_adrena_build_remove_liquidity  — Remove liquidity from a pool.
 *     - sap_adrena_build_swap              — Swap tokens through a pool.
 *
 *   Staking builders (5):
 *     - sap_adrena_build_init_user_staking  — Initialize user staking account.
 *     - sap_adrena_build_add_liquid_stake  — Add liquid stake.
 *     - sap_adrena_build_remove_liquid_stake— Remove liquid stake.
 *     - sap_adrena_build_add_locked_stake  — Add locked stake.
 *     - sap_adrena_build_claim_stakes      — Claim staking rewards.
 *
 *   Data API tools (10):
 *     - sap_adrena_get_positions           — Position history for a wallet.
 *     - sap_adrena_get_pool_info           — Latest pool statistics.
 *     - sap_adrena_get_custody_info        — Per-asset custody statistics.
 *     - sap_adrena_get_trader_info         — Trader performance metrics.
 *     - sap_adrena_get_trader_leaderboard   — Trader leaderboard.
 *     - sap_adrena_get_mutagen             — Mutagen points for a wallet.
 *     - sap_adrena_get_mutagen_leaderboard  — Mutagen leaderboard.
 *     - sap_adrena_get_prices              — ADX and ALP token prices.
 *     - sap_adrena_get_trading_prices      — Latest oracle prices for all assets.
 *     - sap_adrena_get_position_status     — Live position P&L from Data API.
 *
 * All builder tools return an unsigned base64 transaction for local signing
 * via `sap_payments_finalize_transaction`. SAP MCP never signs user-owned
 * Adrena transactions.
 *
 * @module tools/adrena-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey, Connection } from '@solana/web3.js';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { logger } from '../core/logger.js';
import {
  buildOpenPositionLong,
  buildOpenPositionShort,
  buildClosePositionLong,
  buildClosePositionShort,
  buildSetStopLoss,
  buildSetTakeProfit,
  buildCancelStopLoss,
  buildCancelTakeProfit,
  buildAddLimitOrder,
  buildCancelLimitOrder,
  buildAddLiquidity,
  buildRemoveLiquidity,
  buildSwap,
  buildInitUserStaking,
  buildAddLiquidStake,
  buildRemoveLiquidStake,
  buildAddLockedStake,
  buildClaimStakes,
  buildOpenCommodityLong,
  buildOpenCommodityShort,
  buildCloseCommodityLong,
  buildCloseCommodityShort,
  adrenaDataApi,
  type PositionSide,
  type AdrenaPool,
} from '../perps/adrena/index.js';
import { ADRENA_CUSTODIES, ADRENA_MAIN_POOL_ADDRESS } from '../perps/adrena/adrena-constants.js';

/* ═══════════════════════════════════════════════════════════════════
 *  JSON Schema types
 * ═══════════════════════════════════════════════════════════════════ */

interface JsonSchemaProperty {
  readonly type: string;
  readonly description: string;
  readonly enum?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
}

interface JsonSchema {
  readonly type: 'object';
  readonly properties: Record<string, JsonSchemaProperty>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Helpers
 * ═══════════════════════════════════════════════════════════════════ */

/** Supported principal tokens for the main pool. */
const MAIN_POOL_TOKENS = ['JITOSOL', 'WBTC', 'BONK'] as const;

/** Supported commodity tokens. */
const COMMODITY_TOKENS = ['XAU', 'XAG', 'WTI'] as const;

/** Supported collateral tokens. */
const COLLATERAL_TOKENS = ['USDC', 'JITOSOL', 'WBTC', 'BONK'] as const;

/**
 * Convert a human-readable price to Adrena raw price (10^10 scaling).
 * @param priceUsd — Price in USD.
 * @returns Raw price as bigint.
 */
function priceToRaw(priceUsd: number): bigint {
  return BigInt(Math.floor(priceUsd * Math.pow(10, 10)));
}

/**
 * Get the connection from context.
 * @param context — SAP MCP context.
 * @returns Solana connection.
 */
function getConnection(context: SapMcpContext): Connection {
  return context.connection;
}

/**
 * Parse and validate a public key.
 * @param value — Base58 public key string.
 * @returns PublicKey or throws.
 */
function parsePublicKey(value: string): PublicKey {
  return new PublicKey(value);
}

/* ═══════════════════════════════════════════════════════════════════
 *  Trading Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaOpenLongTool
 * @description Register sap_adrena_build_open_long.
 * @internal
 */
function registerAdrenaOpenLongTool(server: Server, context: SapMcpContext): void {
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
function registerAdrenaOpenShortTool(server: Server, context: SapMcpContext): void {
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
function registerAdrenaCloseLongTool(server: Server, context: SapMcpContext): void {
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
function registerAdrenaCloseShortTool(server: Server, context: SapMcpContext): void {
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
function registerAdrenaSetStopLossTool(server: Server, context: SapMcpContext): void {
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
function registerAdrenaSetTakeProfitTool(server: Server, context: SapMcpContext): void {
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
function registerAdrenaCancelStopLossTool(server: Server, context: SapMcpContext): void {
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
function registerAdrenaCancelTakeProfitTool(server: Server, context: SapMcpContext): void {
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

/* ═══════════════════════════════════════════════════════════════════
 *  Limit Order Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaAddLimitOrderTool
 * @description Register sap_adrena_build_add_limit_order.
 * @internal
 */
function registerAdrenaAddLimitOrderTool(server: Server, context: SapMcpContext): void {
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

  registerTool(server, 'sap_adrena_build_add_limit_order', {
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
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build add limit order transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaCancelLimitOrderTool
 * @description Register sap_adrena_build_cancel_limit_order.
 * @internal
 */
function registerAdrenaCancelLimitOrderTool(server: Server, context: SapMcpContext): void {
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

  registerTool(server, 'sap_adrena_build_cancel_limit_order', {
    description: 'Build an unsigned transaction to cancel a limit order on Adrena. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const orderId = BigInt(Math.floor(Number(args['orderId'])));

      const result = await buildCancelLimitOrder(getConnection(context), owner, collateralToken, orderId);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build cancel limit order transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Commodity Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaCommodityTools
 * @description Register commodity (synthetic perp) builder tools.
 * @internal
 */
function registerAdrenaCommodityTools(server: Server, context: SapMcpContext): void {
  // Open commodity long
  registerTool(server, 'sap_adrena_build_open_commodity_long', {
    description: 'Build an unsigned transaction to open a long position on a synthetic commodity (XAU, XAG, WTI) on Adrena. Uses the commodities pool with USDC collateral. Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
        principalToken: { type: 'string', description: 'Commodity to trade.', enum: COMMODITY_TOKENS },
        collateralAmount: { type: 'number', description: 'USDC collateral amount in human-readable units.', minimum: 0 },
        leverage: { type: 'number', description: 'Leverage multiplier.', minimum: 1, maximum: 100 },
        priceUsd: { type: 'number', description: 'Optional limit price in USD.', minimum: 0 },
      },
      required: ['owner', 'principalToken', 'collateralAmount', 'leverage'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const collateralAmount = Number(args['collateralAmount']);
      const leverage = Number(args['leverage']);
      const priceUsd = args['priceUsd'] !== undefined ? Number(args['priceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;

      const result = await buildOpenCommodityLong(getConnection(context), owner, principalToken, collateralAmount, leverage, price);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build commodity long transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });

  // Open commodity short
  registerTool(server, 'sap_adrena_build_open_commodity_short', {
    description: 'Build an unsigned transaction to open a short position on a synthetic commodity (XAU, XAG, WTI) on Adrena. Uses the commodities pool with USDC collateral. Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
        principalToken: { type: 'string', description: 'Commodity to short.', enum: COMMODITY_TOKENS },
        collateralAmount: { type: 'number', description: 'USDC collateral amount.', minimum: 0 },
        leverage: { type: 'number', description: 'Leverage multiplier.', minimum: 1, maximum: 100 },
        priceUsd: { type: 'number', description: 'Optional limit price in USD.', minimum: 0 },
      },
      required: ['owner', 'principalToken', 'collateralAmount', 'leverage'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const collateralAmount = Number(args['collateralAmount']);
      const leverage = Number(args['leverage']);
      const priceUsd = args['priceUsd'] !== undefined ? Number(args['priceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;

      const result = await buildOpenCommodityShort(getConnection(context), owner, principalToken, collateralAmount, leverage, price);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build commodity short transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });

  // Close commodity long
  registerTool(server, 'sap_adrena_build_close_commodity_long', {
    description: 'Build an unsigned transaction to close a long commodity position on Adrena. Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
        principalToken: { type: 'string', description: 'Commodity of the position.', enum: COMMODITY_TOKENS },
        priceUsd: { type: 'number', description: 'Optional close price in USD.', minimum: 0 },
        percentage: { type: 'number', description: 'Percentage to close (0-1000000). Default 1000000.', minimum: 0, maximum: 1000000 },
      },
      required: ['owner', 'principalToken'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const priceUsd = args['priceUsd'] !== undefined ? Number(args['priceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;
      const percentage = args['percentage'] !== undefined ? BigInt(Math.floor(Number(args['percentage']))) : 1_000_000n;

      const result = await buildCloseCommodityLong(getConnection(context), owner, principalToken, price, percentage);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build close commodity long transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });

  // Close commodity short
  registerTool(server, 'sap_adrena_build_close_commodity_short', {
    description: 'Build an unsigned transaction to close a short commodity position on Adrena. Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
        principalToken: { type: 'string', description: 'Commodity of the position.', enum: COMMODITY_TOKENS },
        priceUsd: { type: 'number', description: 'Optional close price in USD.', minimum: 0 },
        percentage: { type: 'number', description: 'Percentage to close (0-1000000). Default 1000000.', minimum: 0, maximum: 1000000 },
      },
      required: ['owner', 'principalToken'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const priceUsd = args['priceUsd'] !== undefined ? Number(args['priceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;
      const percentage = args['percentage'] !== undefined ? BigInt(Math.floor(Number(args['percentage']))) : 1_000_000n;

      const result = await buildCloseCommodityShort(getConnection(context), owner, principalToken, price, percentage);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build close commodity short transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Liquidity & Swap Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaLiquiditySwapTools
 * @description Register liquidity and swap builder tools.
 * @internal
 */
function registerAdrenaLiquiditySwapTools(server: Server, context: SapMcpContext): void {
  // Add liquidity
  registerTool(server, 'sap_adrena_build_add_liquidity', {
    description: 'Build an unsigned transaction to add liquidity to an Adrena pool. Deposits collateral and receives LP tokens. Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Liquidity provider wallet public key (base58).' },
        collateralToken: { type: 'string', description: 'Collateral token to deposit.', enum: COLLATERAL_TOKENS },
        amount: { type: 'number', description: 'Amount in human-readable units.', minimum: 0 },
        minLpAmountOut: { type: 'number', description: 'Minimum LP tokens to receive (raw). 0 for no slippage protection.', minimum: 0 },
        poolName: { type: 'string', description: 'Pool to add liquidity to.', enum: ['main-pool', 'commodities-pool'] },
      },
      required: ['owner', 'collateralToken', 'amount'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const amount = Number(args['amount']);
      const minLpAmountOut = args['minLpAmountOut'] !== undefined ? BigInt(Math.floor(Number(args['minLpAmountOut']))) : 0n;
      const poolName = (args['poolName'] === 'commodities-pool' ? 'commodities-pool' : 'main-pool') as AdrenaPool;

      const result = await buildAddLiquidity(getConnection(context), owner, collateralToken, amount, minLpAmountOut, poolName);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build add liquidity transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });

  // Remove liquidity
  registerTool(server, 'sap_adrena_build_remove_liquidity', {
    description: 'Build an unsigned transaction to remove liquidity from an Adrena pool. Burns LP tokens and receives collateral. Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Liquidity provider wallet public key (base58).' },
        collateralToken: { type: 'string', description: 'Collateral token to receive.', enum: COLLATERAL_TOKENS },
        lpAmountIn: { type: 'number', description: 'LP tokens to burn (raw, 6 decimals).', minimum: 0 },
        minAmountOut: { type: 'number', description: 'Minimum collateral to receive (raw). 0 for no slippage protection.', minimum: 0 },
        poolName: { type: 'string', description: 'Pool to remove liquidity from.', enum: ['main-pool', 'commodities-pool'] },
      },
      required: ['owner', 'collateralToken', 'lpAmountIn'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const lpAmountIn = BigInt(Math.floor(Number(args['lpAmountIn'])));
      const minAmountOut = args['minAmountOut'] !== undefined ? BigInt(Math.floor(Number(args['minAmountOut']))) : 0n;
      const poolName = (args['poolName'] === 'commodities-pool' ? 'commodities-pool' : 'main-pool') as AdrenaPool;

      const result = await buildRemoveLiquidity(getConnection(context), owner, collateralToken, lpAmountIn, minAmountOut, poolName);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build remove liquidity transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });

  // Swap
  registerTool(server, 'sap_adrena_build_swap', {
    description: 'Build an unsigned transaction to swap tokens through an Adrena pool. Uses zero-slippage oracle pricing. Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Swapper wallet public key (base58).' },
        fromToken: { type: 'string', description: 'Token to swap from.', enum: COLLATERAL_TOKENS },
        toToken: { type: 'string', description: 'Token to swap to.', enum: COLLATERAL_TOKENS },
        amount: { type: 'number', description: 'Amount to swap in human-readable units.', minimum: 0 },
        minAmountOut: { type: 'number', description: 'Minimum amount to receive (raw). 0 for no slippage protection.', minimum: 0 },
      },
      required: ['owner', 'fromToken', 'toToken', 'amount'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const fromToken = String(args['fromToken']).toUpperCase();
      const toToken = String(args['toToken']).toUpperCase();
      const amount = Number(args['amount']);
      const minAmountOut = args['minAmountOut'] !== undefined ? BigInt(Math.floor(Number(args['minAmountOut']))) : 0n;

      const result = await buildSwap(getConnection(context), owner, fromToken, toToken, amount, minAmountOut);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build swap transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Staking Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaStakingTools
 * @description Register staking builder tools.
 * @internal
 */
function registerAdrenaStakingTools(server: Server, context: SapMcpContext): void {
  // Init user staking
  registerTool(server, 'sap_adrena_build_init_user_staking', {
    description: 'Build an unsigned transaction to initialize a user staking account on Adrena. Must be called before add_liquid_stake or add_locked_stake. Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Staker wallet public key (base58).' },
      },
      required: ['owner'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const result = await buildInitUserStaking(getConnection(context), owner);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build init user staking transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });

  // Add liquid stake
  registerTool(server, 'sap_adrena_build_add_liquid_stake', {
    description: 'Build an unsigned transaction to add a liquid stake on Adrena (stake LP tokens). Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Staker wallet public key (base58).' },
        amount: { type: 'number', description: 'Amount of LP tokens to stake (raw, 6 decimals).', minimum: 0 },
      },
      required: ['owner', 'amount'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const amount = BigInt(Math.floor(Number(args['amount'])));
      const result = await buildAddLiquidStake(getConnection(context), owner, amount);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build add liquid stake transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });

  // Remove liquid stake
  registerTool(server, 'sap_adrena_build_remove_liquid_stake', {
    description: 'Build an unsigned transaction to remove a liquid stake on Adrena (unstake LP tokens). Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Staker wallet public key (base58).' },
        amount: { type: 'number', description: 'Amount of staked LP tokens to withdraw (raw, 6 decimals).', minimum: 0 },
      },
      required: ['owner', 'amount'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const amount = BigInt(Math.floor(Number(args['amount'])));
      const result = await buildRemoveLiquidStake(getConnection(context), owner, amount);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build remove liquid stake transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });

  // Add locked stake
  registerTool(server, 'sap_adrena_build_add_locked_stake', {
    description: 'Build an unsigned transaction to add a locked stake on Adrena. LP tokens are locked for a specified duration. Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Staker wallet public key (base58).' },
        amount: { type: 'number', description: 'Amount of LP tokens to lock (raw, 6 decimals).', minimum: 0 },
        lockedDays: { type: 'number', description: 'Lock duration in days.', minimum: 1 },
      },
      required: ['owner', 'amount', 'lockedDays'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const amount = BigInt(Math.floor(Number(args['amount'])));
      const lockedDays = Math.floor(Number(args['lockedDays']));
      const result = await buildAddLockedStake(getConnection(context), owner, amount, lockedDays);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build add locked stake transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });

  // Claim stakes
  registerTool(server, 'sap_adrena_build_claim_stakes', {
    description: 'Build an unsigned transaction to claim staking rewards on Adrena. Returns transactionBase64 for local signing.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Staker wallet public key (base58).' },
        lockedStakeIndexes: { type: 'string', description: 'Optional comma-separated list of locked stake indexes to claim. Omit to claim all.' },
      },
      required: ['owner'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const indexesStr = typeof args['lockedStakeIndexes'] === 'string' ? args['lockedStakeIndexes'] : null;
      const lockedStakeIndexes = indexesStr
        ? indexesStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
        : null;
      const result = await buildClaimStakes(getConnection(context), owner, lockedStakeIndexes);
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build claim stakes transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Data API Tools
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaDataApiTools
 * @description Register Adrena Data API (REST) tools for market data and analytics.
 * @internal
 */
function registerAdrenaDataApiTools(server: Server): void {
  // Get positions
  registerTool(server, 'sap_adrena_get_positions', {
    description: 'Fetch position history for a wallet from the Adrena Data API. Returns closed and open positions with P&L, entry/exit prices, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Wallet public key (base58).' },
      },
      required: ['wallet'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const wallet = String(args['wallet'] ?? '').trim();
    if (!wallet) {
      return createTextResponse(JSON.stringify({ error: 'wallet is required' }), { isError: true });
    }
    const positions = await adrenaDataApi.getPositions(wallet);
    if (positions === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch positions from Adrena Data API', wallet }), { isError: true });
    }
    return createTextResponse(JSON.stringify({ wallet, positions, count: positions.length }, null, 2));
  });

  // Get pool info
  registerTool(server, 'sap_adrena_get_pool_info', {
    description: 'Fetch latest pool statistics from the Adrena Data API. Returns TVL, AUM, LP token price, volume, fees, and open interest.',
    inputSchema: {
      type: 'object',
      properties: {
        poolName: { type: 'string', description: 'Optional pool name filter.' },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const poolName = typeof args['poolName'] === 'string' ? args['poolName'] : undefined;
    const pool = await adrenaDataApi.getPoolInfo(poolName);
    if (pool === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch pool info from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify(pool, null, 2));
  });

  // Get custody info
  registerTool(server, 'sap_adrena_get_custody_info', {
    description: 'Fetch per-asset custody statistics from the Adrena Data API. Returns open interest, utilization, volume, and fees for each custody.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional symbol filter (e.g. JITOSOL, WBTC).' },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const symbol = typeof args['symbol'] === 'string' ? args['symbol'] : undefined;
    const custodies = await adrenaDataApi.getCustodyInfo(symbol);
    if (custodies === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch custody info from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify({ custodies, count: custodies.length }, null, 2));
  });

  // Get trader info
  registerTool(server, 'sap_adrena_get_trader_info', {
    description: 'Fetch trader performance metrics from the Adrena Data API. Returns total volume, P&L, fees, win rate, and rank.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Trader wallet public key (base58).' },
      },
      required: ['wallet'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const wallet = String(args['wallet'] ?? '').trim();
    if (!wallet) {
      return createTextResponse(JSON.stringify({ error: 'wallet is required' }), { isError: true });
    }
    const trader = await adrenaDataApi.getTraderInfo(wallet);
    if (trader === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch trader info from Adrena Data API', wallet }), { isError: true });
    }
    return createTextResponse(JSON.stringify(trader, null, 2));
  });

  // Get trader leaderboard
  registerTool(server, 'sap_adrena_get_trader_leaderboard', {
    description: 'Fetch trader leaderboard from the Adrena Data API. Returns top traders by volume and P&L.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Optional limit. Default 50.', minimum: 1, maximum: 500 },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const limit = typeof args['limit'] === 'number' ? args['limit'] : undefined;
    const traders = await adrenaDataApi.getTraderProfiles(limit);
    if (traders === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch trader leaderboard from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify({ traders, count: traders.length }, null, 2));
  });

  // Get mutagen points
  registerTool(server, 'sap_adrena_get_mutagen', {
    description: 'Fetch Mutagen points for a wallet from the Adrena Data API. Returns total points, rank, and breakdown.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Wallet public key (base58).' },
      },
      required: ['wallet'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const wallet = String(args['wallet'] ?? '').trim();
    if (!wallet) {
      return createTextResponse(JSON.stringify({ error: 'wallet is required' }), { isError: true });
    }
    const mutagen = await adrenaDataApi.getMutagen(wallet);
    if (mutagen === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch mutagen points from Adrena Data API', wallet }), { isError: true });
    }
    return createTextResponse(JSON.stringify(mutagen, null, 2));
  });

  // Get mutagen leaderboard
  registerTool(server, 'sap_adrena_get_mutagen_leaderboard', {
    description: 'Fetch Mutagen points leaderboard from the Adrena Data API. Returns top wallets by points.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Optional limit. Default 50.', minimum: 1, maximum: 500 },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const limit = typeof args['limit'] === 'number' ? args['limit'] : undefined;
    const leaderboard = await adrenaDataApi.getMutagenLeaderboard(limit);
    if (leaderboard === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch mutagen leaderboard from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify({ leaderboard, count: leaderboard.length }, null, 2));
  });

  // Get prices (ADX/ALP)
  registerTool(server, 'sap_adrena_get_prices', {
    description: 'Fetch current ADX and ALP token prices from the Adrena Data API.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  }, async () => {
    const prices = await adrenaDataApi.getPrice();
    if (prices === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch prices from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify(prices, null, 2));
  });

  // Get last trading prices
  registerTool(server, 'sap_adrena_get_trading_prices', {
    description: 'Fetch latest oracle trading prices for all Adrena assets. Returns price and custody address for each traded asset.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  }, async () => {
    const prices = await adrenaDataApi.getLastTradingPrices();
    if (prices === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch trading prices from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify({ prices, count: prices.length }, null, 2));
  });

  // Get position status (live P&L)
  registerTool(server, 'sap_adrena_get_position_status', {
    description: 'Fetch live position status (P&L, size, liquidation price, entry price, oracle price) from the Adrena Data API for a specific wallet and token.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Wallet public key (base58).' },
        principalToken: { type: 'string', description: 'Principal token symbol (e.g. JITOSOL, WBTC, BONK, XAU).' },
        side: { type: 'string', description: 'Position side.', enum: ['long', 'short'] },
      },
      required: ['wallet', 'principalToken', 'side'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const wallet = String(args['wallet'] ?? '').trim();
    const principalToken = String(args['principalToken'] ?? '').trim().toUpperCase();
    const side = args['side'] === 'short' ? 'short' : 'long';
    if (!wallet || !principalToken) {
      return createTextResponse(JSON.stringify({ error: 'wallet and principalToken are required' }), { isError: true });
    }
    const positions = await adrenaDataApi.getPositions(wallet);
    if (positions === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch positions from Adrena Data API' }), { isError: true });
    }
    const matching = positions.filter(p =>
      p.principalToken?.toUpperCase() === principalToken &&
      p.side?.toLowerCase() === side,
    );
    if (matching.length === 0) {
      return createTextResponse(JSON.stringify({ wallet, principalToken, side, status: 'no_open_position', message: `No ${side} position found for ${principalToken}` }));
    }
    return createTextResponse(JSON.stringify({ wallet, principalToken, side, positions: matching, count: matching.length }, null, 2));
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  On-chain Markets Reader
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaGetMarketsTool
 * @description Register sap_adrena_get_markets — reads all custody accounts on-chain
 * and returns real market data: mint, decimals, max leverage, trade/swap flags,
 * oracle feed IDs, open interest, and collateral stats.
 * @internal
 */
function registerAdrenaGetMarketsTool(server: Server, context: SapMcpContext): void {
  registerTool(server, 'sap_adrena_get_markets', {
    description: 'Read all Adrena custody accounts directly from Solana mainnet and return real market data for every supported asset: mint address, decimals, max initial leverage, max leverage, allowTrade/allowSwap flags, oracle feed IDs, open interest (long/short USD), locked amounts, borrow rates, and funding rates. This is the authoritative source for what markets Adrena supports and their current on-chain parameters. Use this before opening positions to verify leverage limits and trade availability.',
    inputSchema: {
      type: 'object',
      properties: {
        poolName: {
          type: 'string',
          description: 'Optional pool filter. Supported: main-pool, commodities-pool. Omit for all pools.',
          enum: ['main-pool', 'commodities-pool'],
        },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const poolFilter = args['poolName'] === 'commodities-pool'
        ? 'commodities-pool'
        : args['poolName'] === 'main-pool'
          ? 'main-pool'
          : null;

      const connection = getConnection(context);
      const allCustodies = Object.entries(ADRENA_CUSTODIES).map(([symbol, info]) => ({
        symbol,
        address: info.address,
        pool: info.pool === ADRENA_MAIN_POOL_ADDRESS ? 'main-pool' : 'commodities-pool',
        kind: info.kind,
      }));

      const markets = [];
      for (const cust of allCustodies) {
        if (poolFilter && cust.pool !== poolFilter) continue;

        try {
          const accountInfo = await connection.getAccountInfo(new PublicKey(cust.address), 'confirmed');
          if (!accountInfo || !accountInfo.data || accountInfo.data.length < 916) {
            markets.push({
              symbol: cust.symbol,
              custodyAddress: cust.address,
              pool: cust.pool,
              kind: cust.kind,
              error: 'Custody account not found or too small',
            });
            continue;
          }

          const d = accountInfo.data;
          const mintRaw = new PublicKey(d.subarray(48, 80)).toBase58();
          const tokenAccount = new PublicKey(d.subarray(80, 112)).toBase58();

          // Leverage values are in BPS: divide by 10000 for human-readable
          const maxInitialLeverageBps = d.readUInt32LE(176);
          const maxLeverageBps = d.readUInt32LE(180);
          const maxPositionLockedUsd = Number(d.readBigUInt64LE(184)) / 1e6; // USD 6 decimals

          // Open interest
          const longOiUsd = Number(d.readBigUInt64LE(408)) / 1e6;
          const shortOiUsd = Number(d.readBigUInt64LE(608)) / 1e6;

          // Collateral
          const longCollateralUsd = Number(d.readBigUInt64LE(472)) / 1e6;
          const shortCollateralUsd = Number(d.readBigUInt64LE(672)) / 1e6;

          // Locked amounts
          const longLockedRaw = d.readBigUInt64LE(424).toString();
          const shortLockedRaw = d.readBigUInt64LE(624).toString();

          // Position counts
          const longCount = Number(d.readBigUInt64LE(400));
          const shortCount = Number(d.readBigUInt64LE(600));

          // Borrow rate
          const borrowRateRaw = d.readBigUInt64LE(800).toString();
          const borrowRateLastUpdate = Number(d.readBigUInt64LE(808));

          // Funding
          const fundingLongToShortRaw = d.readBigUInt64LE(864).toString();
          const fundingLastUpdate = Number(d.readBigUInt64LE(872));
          const fundingMaxHourlyRateRaw = d.readBigUInt64LE(840).toString();
          const minTotalOiUsd = Number(d.readBigUInt64LE(848)) / 1e6;
          const imbalanceSensitivityBps = d.readUInt32LE(856);

          // Flags
          const allowTrade = d[10] === 1;
          const allowSwap = d[11] === 1;
          const oracleFeedId = d[914];
          const tradeOracleFeedId = d[915];

          // Assets
          const assetsCollateralRaw = d.readBigUInt64LE(376).toString();
          const assetsOwnedRaw = d.readBigUInt64LE(384).toString();
          const assetsLockedRaw = d.readBigUInt64LE(392).toString();

          const isSystemMint = mintRaw === '11111111111111111111111111111111';

          markets.push({
            symbol: cust.symbol,
            custodyAddress: cust.address,
            pool: cust.pool,
            kind: cust.kind,
            mint: isSystemMint ? null : mintRaw,
            mintIsSynthetic: isSystemMint,
            decimals: d[12],
            tokenAccount,
            allowTrade,
            allowSwap,
            maxInitialLeverage: maxInitialLeverageBps / 10000,
            maxLeverage: maxLeverageBps / 10000,
            maxInitialLeverageBps,
            maxLeverageBps,
            maxPositionLockedUsd,
            openInterest: {
              longUsd: longOiUsd,
              shortUsd: shortOiUsd,
              longPositions: longCount,
              shortPositions: shortCount,
            },
            collateral: {
              longUsd: longCollateralUsd,
              shortUsd: shortCollateralUsd,
            },
            lockedAmounts: {
              longRaw: longLockedRaw,
              shortRaw: shortLockedRaw,
            },
            assets: {
              collateralRaw: assetsCollateralRaw,
              ownedRaw: assetsOwnedRaw,
              lockedRaw: assetsLockedRaw,
            },
            borrowRate: {
              raw: borrowRateRaw,
              lastUpdate: borrowRateLastUpdate,
            },
            funding: {
              currentLongToShortRaw: fundingLongToShortRaw,
              maxHourlyRateRaw: fundingMaxHourlyRateRaw,
              lastUpdate: fundingLastUpdate,
              minTotalOiUsd,
              imbalanceSensitivityBps,
            },
            oracle: {
              feedId: oracleFeedId,
              tradeFeedId: tradeOracleFeedId,
            },
          });
        } catch (err) {
          markets.push({
            symbol: cust.symbol,
            custodyAddress: cust.address,
            pool: cust.pool,
            kind: cust.kind,
            error: err instanceof Error ? err.message : 'Failed to read custody account',
          });
        }
      }

      return createTextResponse(JSON.stringify({
        poolFilter: poolFilter ?? 'all',
        marketCount: markets.length,
        markets,
      }, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({
        error: 'Failed to read Adrena markets from on-chain custody accounts',
        message: err instanceof Error ? err.message : 'Unknown error',
      }), { isError: true });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Main registration function
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaTools
 * @description Register all Adrena perps protocol tools: trading builders, commodity builders, liquidity/swap, staking, and Data API.
 *
 * @param server  — MCP server instance.
 * @param context — Shared runtime context with Solana connection.
 *
 * @usedBy `register-tools.ts`
 */
export function registerAdrenaTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Adrena perps protocol tools');

  // Trading builders
  registerAdrenaOpenLongTool(server, context);
  registerAdrenaOpenShortTool(server, context);
  registerAdrenaCloseLongTool(server, context);
  registerAdrenaCloseShortTool(server, context);

  // SL / TP builders
  registerAdrenaSetStopLossTool(server, context);
  registerAdrenaSetTakeProfitTool(server, context);
  registerAdrenaCancelStopLossTool(server, context);
  registerAdrenaCancelTakeProfitTool(server, context);

  // Limit order builders
  registerAdrenaAddLimitOrderTool(server, context);
  registerAdrenaCancelLimitOrderTool(server, context);

  // Commodity builders
  registerAdrenaCommodityTools(server, context);

  // Liquidity & swap builders
  registerAdrenaLiquiditySwapTools(server, context);

  // Staking builders
  registerAdrenaStakingTools(server, context);

  // Data API tools
  registerAdrenaDataApiTools(server);

  // On-chain markets reader
  registerAdrenaGetMarketsTool(server, context);

  logger.debug('Adrena perps tools registered', { count: 33 });
}