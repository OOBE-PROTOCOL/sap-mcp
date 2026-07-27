/**
 * @name tools/adrena/adrena-index
 * @description Main entry point for Adrena tool registration. Re-exports
 *   registerAdrenaTools which calls all sub-registrations.
 *
 * @module tools/adrena/adrena-index
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/types.js';
import { logger } from '../../core/logger.js';

import { registerAdrenaOpenLongTool } from './adrena-trading-tools.js';
import { registerAdrenaOpenShortTool } from './adrena-trading-tools.js';
import { registerAdrenaCloseLongTool } from './adrena-trading-tools.js';
import { registerAdrenaCloseShortTool } from './adrena-trading-tools.js';
import { registerAdrenaSetStopLossTool } from './adrena-trading-tools.js';
import { registerAdrenaSetTakeProfitTool } from './adrena-trading-tools.js';
import { registerAdrenaCancelStopLossTool } from './adrena-trading-tools.js';
import { registerAdrenaCancelTakeProfitTool } from './adrena-trading-tools.js';
import { registerAdrenaSimulatePositionTool } from './adrena-trading-tools.js';
import { registerAdrenaPositionPackageTool } from './adrena-trading-tools.js';
import { registerAdrenaTradeIntentTool } from './adrena-trading-tools.js';
import { registerAdrenaAddLimitOrderTool } from './adrena-limit-order-tools.js';
import { registerAdrenaCancelLimitOrderTool } from './adrena-limit-order-tools.js';
import { registerAdrenaCommodityTools } from './adrena-commodity-tools.js';
import { registerAdrenaLiquiditySwapTools } from './adrena-liquidity-tools.js';
import { registerAdrenaStakingTools } from './adrena-staking-tools.js';
import { registerAdrenaDataApiTools } from './adrena-data-tools.js';
import { registerAdrenaGetMarketsTool } from './adrena-data-tools.js';

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

  // Free simulation (dry-run, no x402 charge)
  registerAdrenaSimulatePositionTool(server, context);

  // Batch position builder (open + SL + TP atomic)
  registerAdrenaPositionPackageTool(server, context);

  // Intent-level trading API (resolves mint, leverage, collateral automatically)
  registerAdrenaTradeIntentTool(server, context);

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
  registerAdrenaDataApiTools(server, context);

  // On-chain markets reader
  registerAdrenaGetMarketsTool(server, context);

  logger.debug('Adrena perps tools registered', { count: 36 });
}