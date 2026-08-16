/**
 * @name tools/adrena/adrena-staking-tools
 * @description Staking builder tool registrations for Adrena.
 *
 * @module tools/adrena/adrena-staking-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '@oobe-protocol-labs/sap-mcp-core/types';
import {
  adrenaPipelineException,
  adrenaPipelineOk,
  registerAdrenaPipelineTool,
} from './adrena-pipeline.js';
import {
  buildInitUserStaking,
  buildAddLiquidStake,
  buildRemoveLiquidStake,
  buildAddLockedStake,
  buildClaimStakes,
} from '@oobe-protocol-labs/sap-mcp-perps/adrena';
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
  registerAdrenaPipelineTool(server, context, 'sap_adrena_build_init_user_staking', {
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
      return adrenaPipelineOk(result);
    } catch (err) {
      return adrenaPipelineException('Failed to build init user staking transaction', err);
    }
  });

  // Add liquid stake
  registerAdrenaPipelineTool(server, context, 'sap_adrena_build_add_liquid_stake', {
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
      return adrenaPipelineOk(result);
    } catch (err) {
      return adrenaPipelineException('Failed to build add liquid stake transaction', err);
    }
  });

  // Remove liquid stake
  registerAdrenaPipelineTool(server, context, 'sap_adrena_build_remove_liquid_stake', {
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
      return adrenaPipelineOk(result);
    } catch (err) {
      return adrenaPipelineException('Failed to build remove liquid stake transaction', err);
    }
  });

  // Add locked stake
  registerAdrenaPipelineTool(server, context, 'sap_adrena_build_add_locked_stake', {
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
      return adrenaPipelineOk(result);
    } catch (err) {
      return adrenaPipelineException('Failed to build add locked stake transaction', err);
    }
  });

  // Claim stakes
  registerAdrenaPipelineTool(server, context, 'sap_adrena_build_claim_stakes', {
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
      return adrenaPipelineOk(result);
    } catch (err) {
      return adrenaPipelineException('Failed to build claim stakes transaction', err);
    }
  });
}
