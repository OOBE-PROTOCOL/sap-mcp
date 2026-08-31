/**
 * @name tools/phoenix/phoenix-collateral-tools
 * @description Phoenix perps collateral builder tools (deposit, withdraw, register trader).
 *
 * All builders return unsigned serialized transactions — NO signing server-side.
 *
 * @module tools/phoenix/phoenix-collateral-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import { logger } from '../../../core/src/logger.js';
import { getConnection, parsePublicKey } from './phoenix-helpers.js';
import type { JsonSchema } from './phoenix-helpers.js';
import {
  registerPhoenixPipelineTool,
  phoenixPipelineOk,
  phoenixPipelineException,
} from './phoenix-pipeline.js';
import {
  buildDeposit,
  buildWithdraw,
  buildRegisterTrader,
} from '../../../perps/src/phoenix/phoenix-builder-collateral.js';

export function registerPhoenixCollateralTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Phoenix collateral builder tools');

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_deposit', {
    description: 'Build an unsigned USDC deposit transaction into a Phoenix trader account. Returns transactionBase64 for browser approval.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key (base58)' },
        amountUsdc: { type: 'string', description: 'Amount in raw USDC units (1 USDC = 1000000)' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'amountUsdc'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authority = parsePublicKey(input.authority as string);
      const result = await buildDeposit(
        connection, authority, authority,
        BigInt(input.amountUsdc as string),
        (input.traderPdaIndex as number) ?? 0,
        (input.traderSubaccountIndex as number) ?? 0,
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix deposit', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_withdraw', {
    description: 'Build an unsigned USDC withdraw transaction from a Phoenix trader account. Returns transactionBase64.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key' },
        amountUsdc: { type: 'string', description: 'Amount in raw USDC units' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'amountUsdc'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authority = parsePublicKey(input.authority as string);
      const result = await buildWithdraw(
        connection, authority, authority,
        BigInt(input.amountUsdc as string),
        (input.traderPdaIndex as number) ?? 0,
        (input.traderSubaccountIndex as number) ?? 0,
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix withdraw', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_register_trader', {
    description: 'Build an unsigned register trader transaction for Phoenix onboarding. Returns transactionBase64.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key' },
        maxPositions: { type: 'number', description: 'Maximum positions (default 8)', minimum: 1, maximum: 64 },
      },
      required: ['authority'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authority = parsePublicKey(input.authority as string);
      const result = await buildRegisterTrader(
        connection, authority, authority,
        (input.maxPositions as number) ?? 8,
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix register trader', err);
    }
  });

  logger.debug('Phoenix collateral builder tools registered', { count: 3 });
}