/**
 * @name tools/backpack/backpack-index
 * @description Entry point for Backpack tool registration: market-data reads,
 *   collateral, securities, borrow/lend, and (with API credentials) signed
 *   account/trading operations.
 *
 * @module tools/backpack
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import { logger } from '../../../core/src/logger.js';
import { registerBackpackDataTools } from './backpack-data-tools.js';

/**
 * Register all Backpack Exchange tools: free market-data reads (15 tools).
 * Signed account/trading tools land with the credentials resolver increment.
 *
 * @param server  - MCP server instance.
 * @param context - Shared runtime context.
 */
export function registerBackpackTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Backpack Exchange tools');

  registerBackpackDataTools(server, context);

  logger.debug('Backpack Exchange tools registered', { count: 15 });
}

export { BACKPACK_PATHS, BackpackApiClient, BackpackApiError } from './backpack-client.js';
export { registerBackpackPipelineTool } from './backpack-pipeline.js';
export { registerBackpackDataTools } from './backpack-data-tools.js';