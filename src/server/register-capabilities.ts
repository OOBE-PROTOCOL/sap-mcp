/**
 * Register MCP server capabilities (tools, resources, prompts)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../core/types.js';
import { registerTools } from '../tools/register-tools.js';
import { registerResources } from '../resources/register-resources.js';
import { registerPrompts } from '../prompts/register-prompts.js';
import { logger } from '../core/logger.js';

/**
 * Register all server capabilities
 */
export async function registerCapabilities(
  server: Server,
  context: SapMcpContext
): Promise<void> {
  logger.info('Registering server capabilities');
  
  // Register SAP Protocol, Synapse AgentKit, network, and transaction tools.
  await registerTools(server, context);
  logger.info('SAP Protocol tools registered');
  
  // Register resources
  await registerResources(server, context);
  logger.info('Resources registered');
  
  // Register prompts
  await registerPrompts(server, context);
  logger.info('Prompts registered');
}
