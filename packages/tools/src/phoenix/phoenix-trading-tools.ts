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
import {
  buildPlaceLimitOrder,
  buildPlaceMarketOrder,
  buildCancelOrdersById,
  buildCancelAll,
  buildPlaceStopLoss,
  buildCancelStopLoss,
  buildPlacePositionConditionalOrder,
} from '../../../perps/src/phoenix/phoenix-builder-trading.js';

export function registerPhoenixTradingTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Phoenix trading builder tools');

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_place_limit_order', {
    description: 'Build an unsigned Phoenix limit order transaction. Returns transactionBase64 for browser approval. Builder fee applies.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key (base58)' },
        symbol: { type: 'string', description: 'Market symbol (e.g. SOL)' },
        side: { type: 'string', enum: ['bid', 'ask'], description: 'Order side: bid (buy) or ask (sell)' },
        priceInTicks: { type: 'string', description: 'Limit price in ticks (raw integer)' },
        numBaseLots: { type: 'string', description: 'Number of base lots' },
        clientOrderId: { type: 'string', description: 'Client order ID (unique per trader)' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'symbol', 'side', 'priceInTicks', 'numBaseLots', 'clientOrderId'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the FULL wallet public key (base58, 44 chars, no dots). Do NOT use abbreviated addresses. Call steve_get_wallet_balance to get the complete address.' } as Record<string, unknown>, undefined, { isError: true });
      const owner = parsePublicKey(authorityStr);
      const result = await buildPlaceLimitOrder(
        connection, owner,
        input.symbol as string, input.side as 'bid' | 'ask',
        BigInt(input.priceInTicks as string), BigInt(input.numBaseLots as string),
        BigInt(input.clientOrderId as string),
        { traderPdaIndex: (input.traderPdaIndex as number) ?? 0, traderSubaccountIndex: (input.traderSubaccountIndex as number) ?? 0 },
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix limit order', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_place_market_order', {
    description: 'Build an unsigned Phoenix market order transaction. Returns transactionBase64 for browser approval. Builder fee applies.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key' },
        symbol: { type: 'string', description: 'Market symbol' },
        side: { type: 'string', enum: ['bid', 'ask'], description: 'Order side' },
        numBaseLots: { type: 'string', description: 'Number of base lots' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'symbol', 'side', 'numBaseLots'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the FULL wallet public key (base58, 44 chars, no dots). Do NOT use abbreviated addresses. Call steve_get_wallet_balance to get the complete address.' } as Record<string, unknown>, undefined, { isError: true });
      const owner = parsePublicKey(authorityStr);
      const result = await buildPlaceMarketOrder(
        connection, owner,
        input.symbol as string, input.side as 'bid' | 'ask',
        BigInt(input.numBaseLots as string),
        { traderPdaIndex: (input.traderPdaIndex as number) ?? 0, traderSubaccountIndex: (input.traderSubaccountIndex as number) ?? 0 },
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