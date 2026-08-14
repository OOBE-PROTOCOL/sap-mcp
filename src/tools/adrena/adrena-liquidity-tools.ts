/**
 * @name tools/adrena/adrena-liquidity-tools
 * @description Liquidity and swap builder tool registrations for Adrena.
 *
 * @module tools/adrena/adrena-liquidity-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/types.js';
import {
  adrenaPipelineException,
  adrenaPipelineOk,
  registerAdrenaPipelineTool,
} from './adrena-pipeline.js';
import {
  buildAddLiquidity,
  buildRemoveLiquidity,
  buildSwap,
  type AdrenaPool,
} from '../../perps/adrena/index.js';
import {
  COLLATERAL_TOKENS,
  getConnection,
  parsePublicKey,
} from './adrena-helpers.js';

/* ═══════════════════════════════════════════════════════════════════
 *  Liquidity & Swap Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaLiquiditySwapTools
 * @description Register liquidity and swap builder tools.
 * @internal
 */
export function registerAdrenaLiquiditySwapTools(server: Server, context: SapMcpContext): void {
  // Add liquidity
  registerAdrenaPipelineTool(server, context, 'sap_adrena_build_add_liquidity', {
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
      return adrenaPipelineOk(result);
    } catch (err) {
      return adrenaPipelineException('Failed to build add liquidity transaction', err);
    }
  });

  // Remove liquidity
  registerAdrenaPipelineTool(server, context, 'sap_adrena_build_remove_liquidity', {
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
      return adrenaPipelineOk(result);
    } catch (err) {
      return adrenaPipelineException('Failed to build remove liquidity transaction', err);
    }
  });

  // Swap
  registerAdrenaPipelineTool(server, context, 'sap_adrena_build_swap', {
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
      return adrenaPipelineOk(result);
    } catch (err) {
      return adrenaPipelineException('Failed to build swap transaction', err);
    }
  });
}
