/**
 * @name tools/adrena/adrena-staking-tools
 * @description Staking builder tool registrations for Adrena.
 *
 * @module tools/adrena/adrena-staking-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/types.js';
import { createTextResponse } from '../../adapters/mcp/tool-response.js';
import { registerTool } from '../../adapters/mcp/sdk-compat.js';
import {
  buildInitUserStaking,
  buildAddLiquidStake,
  buildRemoveLiquidStake,
  buildAddLockedStake,
  buildClaimStakes,
} from '../../perps/adrena/index.js';
import {
  getConnection,
  parsePublicKey,
} from './adrena-helpers.js';

/* ═══════════════════════════════════════════════════════════════════
 *  Staking Builders
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaStakingTools
 * @description Register staking builder tools.
 * @internal
 */
export function registerAdrenaStakingTools(server: Server, context: SapMcpContext): void {
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