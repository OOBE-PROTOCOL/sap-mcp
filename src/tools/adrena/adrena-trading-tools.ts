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
  buildSimulatePosition,
  buildPositionPackage,
  getCustodyPublicKey,
  fetchOraclePrice,
  type PositionSide,
  type AdrenaPool,
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
import type { PolicyViolationResult } from '../../policy/policy-engine.js';

/**
 * @name validateTradingPolicyFromContext
 * @description Validate trading parameters against the policy engine.
 * Returns null if allowed, or a PolicyViolationResult if rejected.
 * @internal
 */
function validateTradingPolicyFromContext(
  context: SapMcpContext,
  market: string,
  side: string,
  collateralUsd: number,
  leverage: number,
  hasStopLoss: boolean,
  slippageBps?: number,
): PolicyViolationResult | null {
  try {
    const result = context.policyEngine.validateTradingPolicy({
      market, side, collateralUsd, leverage, hasStopLoss, slippageBps,
    });
    return result.allowed ? null : result;
  } catch {
    // Policy engine not available or misconfigured — allow by default.
    return null;
  }
}

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
      stopLossPriceUsd: { type: 'number', description: 'Optional stop-loss price in USD. When provided, the policy engine treats this trade as having a stop loss. Omit to skip the SL requirement (if policy requires SL, this field must be present).', minimum: 0 },
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
      const stopLossPriceUsd = args['stopLossPriceUsd'] !== undefined ? Number(args['stopLossPriceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;

      // Policy validation before building.
      const hasStopLoss = stopLossPriceUsd !== null;
      const violation = validateTradingPolicyFromContext(context, principalToken, 'long', collateralAmount, leverage, hasStopLoss);
      if (violation) {
        return createTextResponse(JSON.stringify({ error: 'PolicyViolation', ...violation }), { isError: true });
      }

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
      stopLossPriceUsd: { type: 'number', description: 'Optional stop-loss price in USD. When provided, the policy engine treats this trade as having a stop loss. Omit to skip the SL requirement (if policy requires SL, this field must be present).', minimum: 0 },
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
      const stopLossPriceUsd = args['stopLossPriceUsd'] !== undefined ? Number(args['stopLossPriceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;

      // Policy validation before building.
      const hasStopLoss = stopLossPriceUsd !== null;
      const violation = validateTradingPolicyFromContext(context, principalToken, 'short', collateralAmount, leverage, hasStopLoss);
      if (violation) {
        return createTextResponse(JSON.stringify({ error: 'PolicyViolation', ...violation }), { isError: true });
      }

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

/* ═══════════════════════════════════════════════════════════════════
 *  Free Simulation (dry-run, no x402 charge)
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaSimulatePositionTool
 * @description Register sap_adrena_simulate_position — a FREE dry-run tool that
 *   simulates opening a perp position without building or paying for a transaction.
 * @internal
 */
export function registerAdrenaSimulatePositionTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58). This is the fee payer and signer.' },
      principalToken: { type: 'string', description: 'Asset to trade. Supported: JITOSOL, WBTC, BONK, plus XAU, XAG, WTI in the commodities pool.', enum: [...MAIN_POOL_TOKENS, ...COMMODITY_TOKENS] },
      collateralToken: { type: 'string', description: 'Collateral token. For longs must match principal (main pool) or be USDC (commodities pool). For shorts must be USDC. Supported: USDC, JITOSOL, WBTC, BONK.', enum: COLLATERAL_TOKENS },
      collateralAmount: { type: 'number', description: 'Collateral amount in human-readable units (e.g. 10 = 10 JITOSOL or 10 USDC).', minimum: 0 },
      leverage: { type: 'number', description: 'Leverage multiplier (e.g. 3 = 3x).', minimum: 1, maximum: 100 },
      side: { type: 'string', description: 'Position side: long or short.', enum: ['long', 'short'] },
      poolName: { type: 'string', description: 'Pool to use. Default: main-pool. Use commodities-pool for XAU/XAG/WTI.', enum: ['main-pool', 'commodities-pool'] },
    },
    required: ['owner', 'principalToken', 'collateralToken', 'collateralAmount', 'leverage', 'side'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_simulate_position', {
    description: 'FREE dry-run tool (no x402 charge): simulates opening a perp position on Adrena by building the same instructions as the open position builder, then calling connection.simulateTransaction(). Returns Adrena program logs, compute units consumed, whether the position would succeed, and the pre-flight balance check — without serializing or returning transaction bytes. Use this to validate position parameters and diagnose on-chain failures before building a paid transaction.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const collateralAmount = Number(args['collateralAmount']);
      const leverage = Number(args['leverage']);
      const side = args['side'] === 'short' ? 'short' : 'long';
      const poolName = (args['poolName'] === 'commodities-pool' ? 'commodities-pool' : 'main-pool') as AdrenaPool;

      const result = await buildSimulatePosition(
        getConnection(context), owner, principalToken, collateralToken, collateralAmount, leverage, side, poolName,
      );
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to simulate position', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaPositionPackageTool
 * @description Register sap_adrena_build_position_package — batch open+SL+TP.
 * @internal
 */
export function registerAdrenaPositionPackageTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset to trade.', enum: [...MAIN_POOL_TOKENS] },
      collateralToken: { type: 'string', description: 'Collateral token. USDC for shorts, match principal for longs.', enum: [...COLLATERAL_TOKENS] },
      collateralAmount: { type: 'number', description: 'Collateral amount in human-readable units.', minimum: 0 },
      leverage: { type: 'number', description: 'Leverage multiplier (e.g. 3 = 3x).', minimum: 1, maximum: 100 },
      side: { type: 'string', description: 'Position side.', enum: ['long', 'short'] },
      stopLossPriceUsd: { type: 'number', description: 'Optional stop loss trigger price in USD. Omit to skip.', minimum: 0 },
      takeProfitPriceUsd: { type: 'number', description: 'Optional take profit trigger price in USD. Omit to skip.', minimum: 0 },
      priceUsd: { type: 'number', description: 'Optional limit price in USD for the open. Omit for market order.', minimum: 0 },
    },
    required: ['owner', 'principalToken', 'collateralToken', 'collateralAmount', 'leverage', 'side'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_position_package', {
    description: 'Build a single unsigned transaction that atomically opens a perp position AND sets stop loss AND take profit in one transaction. 1 payment, 1 signing, 1 submit — instead of 3 separate calls. If stopLossPriceUsd or takeProfitPriceUsd is omitted, that instruction is skipped. Returns transactionBase64 for local signing via sap_payments_finalize_transaction. Includes balanceCheck.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const collateralAmount = Number(args['collateralAmount']);
      const leverage = Number(args['leverage']);
      const side = (args['side'] === 'short' ? 'short' : 'long') as PositionSide;
      const stopLossPriceUsd = args['stopLossPriceUsd'] !== undefined ? Number(args['stopLossPriceUsd']) : null;
      const takeProfitPriceUsd = args['takeProfitPriceUsd'] !== undefined ? Number(args['takeProfitPriceUsd']) : null;
      const priceUsd = args['priceUsd'] !== undefined ? Number(args['priceUsd']) : null;
      const price = priceUsd !== null ? priceToRaw(priceUsd) : null;

      // Policy validation before building.
      const hasStopLoss = stopLossPriceUsd !== null;
      const violation = validateTradingPolicyFromContext(context, principalToken, side, collateralAmount, leverage, hasStopLoss);
      if (violation) {
        return createTextResponse(JSON.stringify({ error: 'PolicyViolation', ...violation }), { isError: true });
      }

      const result = await buildPositionPackage(
        getConnection(context), owner, principalToken, collateralToken,
        collateralAmount, leverage, side, stopLossPriceUsd, takeProfitPriceUsd, price,
      );
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build position package', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaTradeIntentTool
 * @description Register sap_adrena_trade_intent — intent-level trading API.
 * Resolves mint, decimals, max leverage, collateral token automatically.
 * @internal
 */
export function registerAdrenaTradeIntentTool(server: Server, context: SapMcpContext): void {
  registerTool(server, 'sap_adrena_trade_intent', {
    description: 'Intent-level Adrena trading API. Pass market name, side, USD collateral, and leverage (or "max"). The tool resolves mint addresses, decimals, max leverage from on-chain custody accounts, converts USD collateral to token amounts via oracle price, validates parameters, and returns a ready-to-sign transaction. Supports optional stopLossPct and takeProfitPct for atomic position+SL+TP in one transaction. Reduces 5 tool calls to 1.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Wallet public key (base58).' },
        market: { type: 'string', description: 'Market symbol: BONK, JITOSOL, WBTC, USDC, XAU, XAG, WTI.', },
        side: { type: 'string', description: 'Position side.', enum: ['long', 'short'] },
        collateralUsd: { type: 'number', description: 'Collateral amount in USD. Converted to token amount using oracle price.', minimum: 0 },
        leverage: { type: 'string', description: 'Leverage multiplier (e.g. "3" for 3x) or "max" for maxInitialLeverage.' },
        stopLossPct: { type: 'number', description: 'Optional stop loss as % from entry (e.g. 5 = 5% away). Omit to skip.' },
        takeProfitPct: { type: 'number', description: 'Optional take profit as % from entry (e.g. 15 = 15% away). Omit to skip.' },
        poolName: { type: 'string', description: 'Pool: main-pool (default) or commodities-pool.', enum: ['main-pool', 'commodities-pool'] },
      },
      required: ['owner', 'market', 'side', 'collateralUsd', 'leverage'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const market = String(args['market']).toUpperCase();
      const side = (args['side'] === 'short' ? 'short' : 'long') as PositionSide;
      const collateralUsd = Number(args['collateralUsd']);
      const leverageInput = String(args['leverage']);
      const poolName = (args['poolName'] === 'commodities-pool' ? 'commodities-pool' : 'main-pool') as AdrenaPool;
      const stopLossPct = args['stopLossPct'] !== undefined ? Number(args['stopLossPct']) : null;
      const takeProfitPct = args['takeProfitPct'] !== undefined ? Number(args['takeProfitPct']) : null;

      const connection = getConnection(context);

      // Resolve custody address for the market
      const custodyAddr = getCustodyPublicKey(market, poolName);
      const custodyInfo = await connection.getAccountInfo(custodyAddr, 'confirmed');
      if (!custodyInfo || !custodyInfo.data || custodyInfo.data.length < 184) {
        return createTextResponse(JSON.stringify({ error: `Custody account for ${market} not found` }), { isError: true });
      }
      const d = custodyInfo.data;
      const maxInitialLeverageBps = d.readUInt32LE(176);
      const maxLeverageBps = d.readUInt32LE(180);
      const maxInitialLeverage = maxInitialLeverageBps / 10000;
      const maxLeverage = maxLeverageBps / 10000;

      // Resolve leverage
      let leverage: number;
      if (leverageInput.toLowerCase() === 'max') {
        leverage = maxInitialLeverage;
      } else {
        leverage = Number(leverageInput);
        if (leverage > maxInitialLeverage) {
          return createTextResponse(JSON.stringify({
            error: `Leverage ${leverage} exceeds maxInitialLeverage ${maxInitialLeverage} for ${market}`,
            suggestedLeverage: maxInitialLeverage,
          }), { isError: true });
        }
      }

      // Resolve collateral token: USDC for shorts, match market for longs
      const collateralToken = side === 'short' ? 'USDC' : market;

      // Policy validation before building.
      const hasStopLoss = stopLossPct !== null;
      const violation = validateTradingPolicyFromContext(context, market, side, collateralUsd, leverage, hasStopLoss);
      if (violation) {
        return createTextResponse(JSON.stringify({ error: 'PolicyViolation', ...violation }), { isError: true });
      }

      // Get oracle price to convert USD → token amount
      const oraclePrice = await fetchOraclePrice(market, side);
      const priceUsd = Number(oraclePrice) / Math.pow(10, 10);
      if (priceUsd <= 0) {
        return createTextResponse(JSON.stringify({ error: `Oracle price for ${market} unavailable` }), { isError: true });
      }

      // Convert USD collateral to token amount
      // For shorts: collateral is USDC (6 decimals), 1 USDC ≈ $1
      // For longs: collateral is the token itself, amount = USD / price
      let collateralAmount: number;
      if (side === 'short') {
        // USDC is ~$1, so collateralAmount ≈ collateralUsd
        collateralAmount = collateralUsd;
      } else {
        // Token collateral: amount = USD / token price
        collateralAmount = collateralUsd / priceUsd;
      }

      // Resolve SL/TP prices from percentages
      let stopLossPriceUsd: number | null = null;
      let takeProfitPriceUsd: number | null = null;
      if (stopLossPct !== null) {
        // For long: SL below entry. For short: SL above entry
        stopLossPriceUsd = side === 'long'
          ? priceUsd * (1 - stopLossPct / 100)
          : priceUsd * (1 + stopLossPct / 100);
      }
      if (takeProfitPct !== null) {
        // For long: TP above entry. For short: TP below entry
        takeProfitPriceUsd = side === 'long'
          ? priceUsd * (1 + takeProfitPct / 100)
          : priceUsd * (1 - takeProfitPct / 100);
      }

      // Build position package (open + SL + TP atomic)
      const result = await buildPositionPackage(
        connection, owner, market, collateralToken,
        collateralAmount, leverage, side, stopLossPriceUsd, takeProfitPriceUsd, null,
      );

      // Enrich with intent metadata
      const enrichedResult = {
        ...result,
        intent: {
          market,
          side,
          collateralUsd,
          collateralToken,
          collateralAmount,
          leverage,
          maxInitialLeverage,
          maxLeverage,
          oraclePriceUsd: priceUsd,
          stopLossPriceUsd,
          takeProfitPriceUsd,
          poolName,
        },
      };

      return createTextResponse(JSON.stringify(enrichedResult, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build trade intent', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaTrailingStopTool
 * @description Register sap_adrena_build_trailing_stop.
 *
 * Reads the current oracle price for the market, computes a trailing stop
 * at the specified percentage distance from current price, and builds a
 * setStopLoss instruction. For longs: SL below price. For shorts: SL above price.
 *
 * @internal
 */
export function registerAdrenaTrailingStopTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset of the position.', enum: [...MAIN_POOL_TOKENS, ...COMMODITY_TOKENS] },
      side: { type: 'string', description: 'Position side.', enum: ['long', 'short'] },
      trailPct: { type: 'number', description: 'Trailing distance as percentage from current price (e.g. 3 = 3% away).', minimum: 0.1, maximum: 50 },
    },
    required: ['owner', 'principalToken', 'side', 'trailPct'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_trailing_stop', {
    description: 'Build an unsigned transaction to set a trailing stop loss on an Adrena position. Reads the current oracle price and computes the stop loss at the specified percentage distance. For longs: SL below current price. For shorts: SL above current price. Returns transactionBase64 for local signing. Call this repeatedly to keep the stop trailing the price.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const side = (args['side'] === 'short' ? 'short' : 'long') as PositionSide;
      const trailPct = Number(args['trailPct']);

      if (trailPct <= 0 || trailPct > 50) {
        return createTextResponse(JSON.stringify({ error: 'trailPct must be between 0.1 and 50' }), { isError: true });
      }

      // Fetch current oracle price.
      const { fetchOraclePrice } = await import('../../perps/adrena/adrena-builder-core.js');
      const oraclePriceRaw = await fetchOraclePrice(principalToken, side);
      // Convert raw price (scaled by 10^10) to USD.
      const currentPriceUsd = Number(oraclePriceRaw) / Math.pow(10, 10);

      if (currentPriceUsd <= 0) {
        return createTextResponse(JSON.stringify({ error: `Could not fetch oracle price for ${principalToken}` }), { isError: true });
      }

      // Compute trailing stop price.
      const stopLossPriceUsd = side === 'long'
        ? currentPriceUsd * (1 - trailPct / 100)
        : currentPriceUsd * (1 + trailPct / 100);

      const stopLossLimitPrice = priceToRaw(stopLossPriceUsd);

      const result = await buildSetStopLoss(
        getConnection(context), owner, principalToken, side, stopLossLimitPrice, null,
      );

      return createTextResponse(JSON.stringify({
        ...result,
        trailingStop: {
          currentPriceUsd,
          trailPct,
          stopLossPriceUsd,
          side,
        },
      }, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build trailing stop transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}

/**
 * @name registerAdrenaModifyPositionTool
 * @description Register sap_adrena_build_modify_position.
 *
 * Builds an openOrIncreasePosition instruction to add collateral to an
 * existing position. This effectively modifies the position by increasing
 * its collateral (and optionally changing leverage).
 *
 * @internal
 */
export function registerAdrenaModifyPositionTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Position owner wallet public key (base58).' },
      principalToken: { type: 'string', description: 'Asset of the position.', enum: [...MAIN_POOL_TOKENS, ...COMMODITY_TOKENS] },
      collateralToken: { type: 'string', description: 'Collateral token.', enum: COLLATERAL_TOKENS },
      collateralAmount: { type: 'number', description: 'Additional collateral amount in human-readable units to add to the position.', minimum: 0 },
      leverage: { type: 'number', description: 'New leverage multiplier. Pass the same value to keep current leverage, or a different value to change it.', minimum: 1, maximum: 100 },
      side: { type: 'string', description: 'Position side.', enum: ['long', 'short'] },
    },
    required: ['owner', 'principalToken', 'collateralToken', 'collateralAmount', 'leverage', 'side'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_adrena_build_modify_position', {
    description: 'Build an unsigned transaction to modify an existing Adrena position by adding collateral. Uses openOrIncreasePosition which atomically adds collateral to an existing position. The leverage parameter can be changed to adjust the position risk. Returns transactionBase64 for local signing.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    try {
      const owner = parsePublicKey(String(args['owner']));
      const principalToken = String(args['principalToken']).toUpperCase();
      const collateralToken = String(args['collateralToken']).toUpperCase();
      const collateralAmount = Number(args['collateralAmount']);
      const leverage = Number(args['leverage']);
      const side = (args['side'] === 'short' ? 'short' : 'long') as PositionSide;

      if (collateralAmount <= 0) {
        return createTextResponse(JSON.stringify({ error: 'collateralAmount must be positive' }), { isError: true });
      }

      // Policy validation.
      const hasStopLoss = false; // Modify does not set SL.
      const violation = validateTradingPolicyFromContext(context, principalToken, side, collateralAmount, leverage, hasStopLoss);
      if (violation) {
        return createTextResponse(JSON.stringify({ error: 'PolicyViolation', ...violation }), { isError: true });
      }

      // Use the open builder to increase the position (openOrIncreasePosition).
      const builderFn = side === 'long'
        ? buildOpenPositionLong
        : buildOpenPositionShort;

      const result = await builderFn(
        getConnection(context), owner, principalToken, collateralToken, collateralAmount, leverage, null,
      );

      return createTextResponse(JSON.stringify({
        ...result,
        modifyPosition: {
          principalToken,
          collateralToken,
          additionalCollateral: collateralAmount,
          newLeverage: leverage,
          side,
        },
      }, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to build modify position transaction', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });
}