/**
 * @name tools/phoenix/phoenix-trading-tools
 * @description Phoenix perps trading builder tools (unsigned transactions).
 *
 * All builders return unsigned serialized transactions — NO signing server-side.
 * Execution class: unsigned-builder.
 *
 * @module tools/phoenix/phoenix-trading-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import { logger } from '../../../core/src/logger.js';
import { getConnection, parsePublicKey, validateAuthority } from './phoenix-helpers.js';
import { createToolExecutionResult } from '../tool-execution-pipeline.js';
import type { JsonSchema } from './phoenix-helpers.js';
import {
  registerPhoenixPipelineTool,
  phoenixPipelineOk,
  phoenixPipelineException,
} from './phoenix-pipeline.js';
import { PhoenixDataApiClient } from '../../../perps/src/phoenix/phoenix-data-api.js';
import {
  baseUnitsToBaseLots,
  priceUsdToTicks,
} from '../../../perps/src/phoenix/phoenix-builder-trading.js';
import {
  buildPlaceLimitOrder,
  buildPlaceMarketOrder,
  buildCancelOrdersById,
  buildCancelAll,
  buildPlaceStopLoss,
  buildCancelStopLoss,
  buildPlacePositionConditionalOrder,
} from '../../../perps/src/phoenix/phoenix-builder-trading.js';

let cachedDataClient: PhoenixDataApiClient | null = null;

/** Market unit metadata (baseLotsDecimals + tickSize) for human-input conversion. */
interface PhoenixMarketUnits {
  baseLotsDecimals: number;
  tickSize: number;
}

/**
 * Resolve baseLotsDecimals + tickSize for a symbol from the Phoenix exchange
 * config (GET /v1/view/exchange/markets). Cached module-level per symbol.
 */
async function resolveMarketUnits(symbol: string): Promise<PhoenixMarketUnits> {
  if (!cachedDataClient) cachedDataClient = new PhoenixDataApiClient();
  const exchange = await cachedDataClient.getExchange();
  const markets = (exchange as { markets?: Array<{ symbol?: string; baseLotsDecimals?: number; tickSize?: number }> }).markets;
  const match = Array.isArray(markets)
    ? markets.find((m) => typeof m.symbol === 'string' && m.symbol.toUpperCase() === symbol.toUpperCase())
    : undefined;
  if (!match || typeof match.baseLotsDecimals !== 'number' || typeof match.tickSize !== 'number') {
    throw new Error(`Unknown Phoenix market '${symbol}'. Cannot resolve baseLotsDecimals/tickSize for unit conversion.`);
  }
  return { baseLotsDecimals: match.baseLotsDecimals, tickSize: match.tickSize };
}

export function registerPhoenixTradingTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Phoenix trading builder tools');

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_place_limit_order', {
    description: 'Build an unsigned Phoenix limit order transaction. Pass authority, symbol, side, priceUsd (human limit price, e.g. "106.50"), baseUnits (human size). Raw priceInTicks/numBaseLots also accepted. Returns transactionBase64 for browser approval. Builder fee applies.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key (base58)' },
        symbol: { type: 'string', description: 'Market symbol (e.g. SOL)' },
        side: { type: 'string', enum: ['bid', 'ask'], description: 'Order side: bid (buy) or ask (sell)' },
        priceUsd: { type: 'string', description: 'Human limit price in USD (e.g. "106.50")' },
        limitPrice: { type: 'string', description: 'Alias of priceUsd' },
        price: { type: 'string', description: 'Alias of priceUsd' },
        priceInTicks: { type: 'string', description: 'Limit price in ticks (raw integer; overrides priceUsd)' },
        baseUnits: { type: 'string', description: 'Human size in base units (e.g. "0.01")' },
        size: { type: 'string', description: 'Alias of baseUnits' },
        numBaseLots: { type: 'string', description: 'Raw base lots (overrides baseUnits)' },
        clientOrderId: { type: 'string', description: 'Client order ID (unique per trader); optional' },
        reduceOnly: { type: 'boolean', description: 'Reduce-only: order can only decrease an existing position (OrderFlags.ReduceOnly)' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'symbol', 'side'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the FULL wallet public key (base58, 44 chars, no dots). Do NOT use abbreviated addresses. Call steve_get_wallet_balance to get the complete address.' } as Record<string, unknown>, undefined, { isError: true });
      const owner = parsePublicKey(authorityStr);
      const units = await resolveMarketUnits(input.symbol as string);
      // Price: raw ticks win, else human priceUsd.
      let priceInTicks: bigint;
      if (input.priceInTicks !== undefined && input.priceInTicks !== null && `${input.priceInTicks}`.trim() !== '') {
        priceInTicks = BigInt(input.priceInTicks as string);
      } else {
        const priceUsd = (input.priceUsd ?? input.limitPrice ?? input.price) as string | undefined;
        if (typeof priceUsd !== 'string' || !priceUsd.trim()) {
          return createToolExecutionResult({ error: 'Limit price is required: pass priceUsd (e.g. "106.50") or priceInTicks.' } as Record<string, unknown>, undefined, { isError: true });
        }
        priceInTicks = priceUsdToTicks(priceUsd, units);
      }
      // Size: raw lots win, else human baseUnits.
      let numBaseLots: bigint;
      if (input.numBaseLots !== undefined && input.numBaseLots !== null && `${input.numBaseLots}`.trim() !== '') {
        numBaseLots = BigInt(input.numBaseLots as string);
      } else {
        const baseUnits = (input.baseUnits ?? input.size) as string | undefined;
        if (typeof baseUnits !== 'string' || !baseUnits.trim()) {
          return createToolExecutionResult({ error: 'Order size is required: pass baseUnits (e.g. "0.01") or numBaseLots.' } as Record<string, unknown>, undefined, { isError: true });
        }
        numBaseLots = baseUnitsToBaseLots(baseUnits, units);
      }
      // clientOrderId: optional — derive a stable value when absent.
      const clientOrderId = input.clientOrderId !== undefined && input.clientOrderId !== null && `${input.clientOrderId}`.trim() !== ''
        ? BigInt(input.clientOrderId as string)
        : BigInt(Date.now() % 1_000_000_000);
      const result = await buildPlaceLimitOrder(
        connection, owner,
        input.symbol as string, input.side as 'bid' | 'ask',
        priceInTicks, numBaseLots,
        clientOrderId,
        {
          // OrderFlags.ReduceOnly = 128 (Phoenix OrderPacket bit flag).
          orderFlags: input.reduceOnly === true || input.reduceOnly === 'true' ? 128 : 0,
          traderPdaIndex: (input.traderPdaIndex as number) ?? 0, traderSubaccountIndex: (input.traderSubaccountIndex as number) ?? 0,
        },
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix limit order', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_place_market_order', {
    description: 'Build an unsigned Phoenix market order transaction. Pass authority, symbol, side (bid=buy, ask=sell), and baseUnits (human size, e.g. "0.01" SOL). numBaseLots raw lots also accepted. Returns transactionBase64 for browser approval. Builder fee applies.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key' },
        symbol: { type: 'string', description: 'Market symbol' },
        side: { type: 'string', enum: ['bid', 'ask'], description: 'Order side' },
        baseUnits: { type: 'string', description: 'Human-readable size in base units (e.g. "0.01" = 0.01 SOL)' },
        size: { type: 'string', description: 'Alias of baseUnits' },
        numBaseLots: { type: 'string', description: 'Raw base lots (advanced; overrides baseUnits)' },
        reduceOnly: { type: 'boolean', description: 'Reduce-only: order can only decrease an existing position (OrderFlags.ReduceOnly)' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'symbol', 'side'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the FULL wallet public key (base58, 44 chars, no dots). Do NOT use abbreviated addresses. Call steve_get_wallet_balance to get the complete address.' } as Record<string, unknown>, undefined, { isError: true });
      const owner = parsePublicKey(authorityStr);
      let numBaseLots: bigint;
      if (input.numBaseLots !== undefined && input.numBaseLots !== null && `${input.numBaseLots}`.trim() !== '') {
        numBaseLots = BigInt(input.numBaseLots as string);
      } else {
        const baseUnits = (input.baseUnits ?? input.size) as string | undefined;
        if (typeof baseUnits !== 'string' || !baseUnits.trim()) {
          return createToolExecutionResult({
            error: 'Order size is required: pass baseUnits (human size, e.g. "0.01") or numBaseLots (raw lots).',
          } as Record<string, unknown>, undefined, { isError: true });
        }
        const units = await resolveMarketUnits(input.symbol as string);
        numBaseLots = baseUnitsToBaseLots(baseUnits, units);
      }
      const result = await buildPlaceMarketOrder(
        connection, owner,
        input.symbol as string, input.side as 'bid' | 'ask',
        numBaseLots,
        {
          // OrderFlags.ReduceOnly = 128 (Phoenix OrderPacket bit flag).
          orderFlags: input.reduceOnly === true || input.reduceOnly === 'true' ? 128 : 0,
          traderPdaIndex: (input.traderPdaIndex as number) ?? 0, traderSubaccountIndex: (input.traderSubaccountIndex as number) ?? 0,
        },
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix market order', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_cancel_orders', {
    description: 'Build an unsigned cancel orders by ID transaction for Phoenix. Returns transactionBase64.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key' },
        symbol: { type: 'string', description: 'Market symbol' },
        orders: { type: 'array', description: 'Array of { priceInTicks, orderSequenceNumber } objects' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'symbol', 'orders'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the FULL wallet public key (base58, 44 chars, no dots). Do NOT use abbreviated addresses. Call steve_get_wallet_balance to get the complete address.' } as Record<string, unknown>, undefined, { isError: true });
      const owner = parsePublicKey(authorityStr);
      const result = await buildCancelOrdersById(
        connection, owner,
        input.symbol as string, input.orders as never,
        { traderPdaIndex: (input.traderPdaIndex as number) ?? 0, traderSubaccountIndex: (input.traderSubaccountIndex as number) ?? 0 },
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix cancel orders', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_cancel_all', {
    description: 'Build an unsigned cancel all orders transaction for a Phoenix market. Returns transactionBase64.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key' },
        symbol: { type: 'string', description: 'Market symbol' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'symbol'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the FULL wallet public key (base58, 44 chars, no dots). Do NOT use abbreviated addresses. Call steve_get_wallet_balance to get the complete address.' } as Record<string, unknown>, undefined, { isError: true });
      const owner = parsePublicKey(authorityStr);
      const result = await buildCancelAll(
        connection, owner,
        input.symbol as string,
        { traderPdaIndex: (input.traderPdaIndex as number) ?? 0, traderSubaccountIndex: (input.traderSubaccountIndex as number) ?? 0 },
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix cancel all', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_place_stop_loss', {
    description: 'Build an unsigned Phoenix stop loss order transaction. Returns transactionBase64.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key' },
        symbol: { type: 'string', description: 'Market symbol' },
        triggerPrice: { type: 'string', description: 'Trigger price in ticks (raw integer)' },
        tradeSide: { type: 'string', enum: ['bid', 'ask'], description: 'Trade side' },
        executionDirection: { type: 'string', enum: ['greater-than', 'less-than'], description: 'Trigger direction' },
        orderKind: { type: 'string', enum: ['ioc', 'limit'], description: 'Order kind (default ioc)' },
        slippageBps: { type: 'number', minimum: 0, maximum: 10000 },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'symbol', 'triggerPrice', 'tradeSide', 'executionDirection'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the FULL wallet public key (base58, 44 chars, no dots). Do NOT use abbreviated addresses. Call steve_get_wallet_balance to get the complete address.' } as Record<string, unknown>, undefined, { isError: true });
      const owner = parsePublicKey(authorityStr);
      const result = await buildPlaceStopLoss(
        connection, owner,
        input.symbol as string, BigInt(input.triggerPrice as string),
        input.tradeSide as 'bid' | 'ask',
        input.executionDirection as 'greater-than' | 'less-than',
        (input.orderKind as 'ioc' | 'limit') ?? 'ioc',
        { slippageBps: (input.slippageBps as number) ?? null, traderPdaIndex: (input.traderPdaIndex as number) ?? 0, traderSubaccountIndex: (input.traderSubaccountIndex as number) ?? 0 },
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix stop loss', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_cancel_stop_loss', {
    description: 'Build an unsigned cancel stop loss transaction for Phoenix. Returns transactionBase64.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key' },
        symbol: { type: 'string', description: 'Market symbol' },
        executionDirection: { type: 'string', enum: ['greater-than', 'less-than'], description: 'Trigger direction' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'symbol', 'executionDirection'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the FULL wallet public key (base58, 44 chars, no dots). Do NOT use abbreviated addresses. Call steve_get_wallet_balance to get the complete address.' } as Record<string, unknown>, undefined, { isError: true });
      const owner = parsePublicKey(authorityStr);
      const result = await buildCancelStopLoss(
        connection, owner,
        input.symbol as string,
        input.executionDirection as 'greater-than' | 'less-than',
        { traderPdaIndex: (input.traderPdaIndex as number) ?? 0, traderSubaccountIndex: (input.traderSubaccountIndex as number) ?? 0 },
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix cancel stop loss', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_place_conditional_order', {
    description: 'Build an unsigned Phoenix conditional order transaction (TP/SL bracket). Returns transactionBase64.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key' },
        symbol: { type: 'string', description: 'Market symbol' },
        lessTriggerPrice: { type: 'string', description: 'Less-than trigger price in ticks' },
        lessTradeSide: { type: 'string', enum: ['bid', 'ask'] },
        greaterTriggerPrice: { type: 'string', description: 'Greater-than trigger price in ticks' },
        greaterTradeSide: { type: 'string', enum: ['bid', 'ask'] },
        sizePercent: { type: 'number', minimum: 1, maximum: 100 },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'symbol'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the FULL wallet public key (base58, 44 chars, no dots). Do NOT use abbreviated addresses. Call steve_get_wallet_balance to get the complete address.' } as Record<string, unknown>, undefined, { isError: true });
      const owner = parsePublicKey(authorityStr);
      const options: Record<string, unknown> = {};
      if (input.lessTriggerPrice) {
        options.lessTriggerOrder = {
          triggerDirection: 'less-than',
          tradeSide: input.lessTradeSide ?? 'ask',
          triggerPrice: BigInt(input.lessTriggerPrice as string),
          orderKind: 'ioc',
        };
      }
      if (input.greaterTriggerPrice) {
        options.greaterTriggerOrder = {
          triggerDirection: 'greater-than',
          tradeSide: input.greaterTradeSide ?? 'bid',
          triggerPrice: BigInt(input.greaterTriggerPrice as string),
          orderKind: 'ioc',
        };
      }
      options.traderPdaIndex = (input.traderPdaIndex as number) ?? 0;
      options.traderSubaccountIndex = (input.traderSubaccountIndex as number) ?? 0;
      const result = await buildPlacePositionConditionalOrder(
        connection, owner,
        input.symbol as string,
        options as never,
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix conditional order', err);
    }
  });

  logger.debug('Phoenix trading builder tools registered', { count: 7 });
}