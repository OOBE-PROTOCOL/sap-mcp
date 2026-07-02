import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../core/logger.js';
import type { SapMcpContext } from '../core/types.js';
import { getRegisteredTools } from '../adapters/mcp/sdk-compat.js';

import { registerSapSdkTools } from './sap-sdk-tools.js';
import { registerSapSnsTools } from './sap-sns-tools.js';
import { sapNetworkStatsTool } from './sap-network-stats.tool.js';

import { registerClientSdkTools } from './client-sdk-tools.js';
import { registerTransactionTools } from './transaction-tools.js';
import { registerProfileTools } from './profile-tools.js';
import { registerSkillsTools } from './skills-tools.js';
import { registerChatTools } from './chat-tools.js';

/**
 * Register all tools with the MCP server.
 *
 * @name registerTools
 * @description Registers SAP SDK, Synapse Client SDK, network, and transaction tools before the server is exposed.
 * @param server - MCP server receiving tool definitions and handlers.
 * @param context - Shared runtime context with SAP client, signer, policy, and configuration.
 */
export async function registerTools(server: Server, context: SapMcpContext): Promise<void> {
  logger.info('Registering tools');
  
  // Register SAP SDK tools backed by @oobe-protocol-labs/synapse-sap-sdk.
  registerSapSdkTools(server, context);

  // Register SNS integration tools backed by synapse-sap-sdk v0.21.
  registerSapSnsTools(server, context);
  
  // Register network stats tool backed by SAP discovery/global registry APIs.
  sapNetworkStatsTool(server, context);
  
  // Register AgentKit tools from @oobe-protocol-labs/synapse-client-sdk.
  await registerClientSdkTools(server, context);
  
  // Register transaction tools
  registerTransactionTools(server, context);

  // Register SAP chat tools backed by on-chain session ledgers.
  registerChatTools(server, context);

  // Register profile tools with redacted signer metadata and live runtime reload.
  registerProfileTools(server, context);

  // Register bundled agent skill pack tools.
  registerSkillsTools(server, context);
  
  logger.info('Tools registered', { count: getRegisteredTools(server).length });
}
