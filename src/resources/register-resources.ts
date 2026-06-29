/**
 * Register all MCP resources
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../core/logger.js';
import type { SapMcpContext } from '../core/types.js';

import { sapAgentResource } from './registry/sap-agent.resource.js';
import { sapGlobalRegistryResource } from './registry/sap-global-registry.resource.js';
import { sapMemoryResource } from './memory/sap-memory.resource.js';
import { sapExecutionRecordResource } from './execution-proof/sap-execution-record.resource.js';
import { sapReputationResource } from './reputation/sap-reputation.resource.js';
import { sapToolSchemaResource } from './tool-schema/sap-tool-schema.resource.js';
import { sapCurrentConfigResource } from './current/sap-current-config.resource.js';
import { sapActiveProfileResource } from './profile/sap-active-profile.resource.js';
import { sapNetworkStatsResource } from './stats/sap-network-stats.resource.js';

/**
 * Register all resources with the MCP server
 */
export async function registerResources(server: Server, context: SapMcpContext): Promise<void> {
  logger.info('Registering resources');
  
  // Register all SAP domain resources
  sapAgentResource(server, context);
  sapGlobalRegistryResource(server, context);
  sapMemoryResource(server, context);
  sapExecutionRecordResource(server, context);
  sapReputationResource(server, context);
  sapToolSchemaResource(server, context);
  
  // Register config and profile resources
  sapCurrentConfigResource(server, context);
  sapActiveProfileResource(server, context);
  
  // Register network stats resource
  sapNetworkStatsResource(server, context);
  
  logger.info('Resources registered', { count: 9 });
}
