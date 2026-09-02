/**
 * @name tools/phoenix/phoenix-index
 * @description Main entry point for Phoenix tool registration.
 *
 * @module tools/phoenix
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import { logger } from '../../../core/src/logger.js';
import { registerPhoenixDataTools } from './phoenix-data-tools.js';
import { registerPhoenixTradingTools } from './phoenix-trading-tools.js';
import { registerPhoenixCollateralTools } from './phoenix-collateral-tools.js';
import { registerPhoenixRelayTools } from './phoenix-relay-tools.js';

/**
 * Register all Phoenix perps protocol tools: data reads, trading builders, collateral builders.
 *
 * @param server  — MCP server instance.
 * @param context — Shared runtime context with Solana connection.
 */
export function registerPhoenixTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Phoenix perps protocol tools');

  registerPhoenixDataTools(server, context);
  registerPhoenixTradingTools(server, context);
  registerPhoenixCollateralTools(server, context);
  registerPhoenixRelayTools(server, context);

  logger.debug('Phoenix perps tools registered', { count: 27 });
}