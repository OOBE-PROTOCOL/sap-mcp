/**
 * @name server/register-capabilities
 * @description Registers all MCP server capabilities (tools, resources, and prompts) on the server instance.
 *
 * @flow
 *   1. Registers SAP Protocol, Synapse AgentKit, network, and transaction tools via `registerTools`.
 *   2. Registers on-chain resources via `registerResources`.
 *   3. Registers interactive prompts via `registerPrompts`.
 *
 * @module server/register-capabilities
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../core/types.js';
import { registerTools } from '../tools/register-tools.js';
import { registerResources } from '../resources/register-resources.js';
import { registerPrompts } from '../prompts/register-prompts.js';
import { logger } from '../core/logger.js';

/**
 * @name registerCapabilities
 * @description Registers all tools, resources, and prompts on the MCP server.
 *
 * @param server  — The MCP `Server` instance to register capabilities on.
 * @param context — SAP MCP runtime context shared by all capability handlers.
 * @throws If any registration sub-call fails.
 *
 * @usedBy `create-server.ts:createSapMcpServer`.
 */
export async function registerCapabilities(
  server: Server,
  context: SapMcpContext
): Promise<void> {
  logger.debug('Registering server capabilities');

  // Register SAP Protocol, Synapse AgentKit, network, and transaction tools.
  await registerTools(server, context);
  logger.debug('SAP Protocol tools registered');

  // Register resources
  await registerResources(server, context);
  logger.debug('Resources registered');

  // Register prompts
  await registerPrompts(server, context);
  logger.debug('Prompts registered');
}