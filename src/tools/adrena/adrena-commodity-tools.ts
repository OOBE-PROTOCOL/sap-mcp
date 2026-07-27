/**
 * @name tools/adrena/adrena-commodity-tools
 * @description Commodity (synthetic perp) builder tool registrations for Adrena.
 *
 * @module tools/adrena/adrena-commodity-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/types.js';
import { createTextResponse } from '../../adapters/mcp/tool-response.js';
import { registerTool } from '../../adapters/mcp/sdk-compat.js';
import {
  buildOpenCommodityLong,
  buildOpenCommodityShort,
  buildCloseCommodityLong,
  buildCloseCommodityShort,
} from '../../perps/adrena/index.js';
import {
  COMMODITY_TOKENS,
  priceToRaw,
  getConnection,
  parsePublicKey,
} from './adrena-helpers.js';

/* ═══════════════════════════════════════════════════════════════════
 *  Commodity Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaCommodityTools
 * @description Register commodity (synthetic perp) builder tools.
 * @internal
 */
export function registerAdrenaCommodityTools(server: Server, context: SapMcpContext): void {
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