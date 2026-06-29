/**
 * MCP Server creation
 * 
 * Creates and configures the MCP server with all SAP Protocol capabilities.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../core/logger.js';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../core/constants.js';
import type { SapMcpConfig, SapMcpContext } from '../core/types.js';
import { createSapClient } from '../sap/sap-client-manager.js';
import { resolveSigner } from '../signer/signer-resolver.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { registerCapabilities } from './register-capabilities.js';
import { setToolExecutionContext } from '../adapters/mcp/sdk-compat.js';

/**
 * Create and configure the MCP server instance
 */
export async function createSapMcpServer(config: SapMcpConfig): Promise<Server> {
  logger.info('Creating SAP MCP Server', { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
  
  // Create MCP server with ALL capabilities declared upfront
  // This is REQUIRED for MCP SDK v1.0.0 - capabilities must be declared in constructor
  const server = new Server(
    {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    {
      // Declare all capabilities upfront
      capabilities: {
        tools: {},      // Enable tools/list
        resources: {},  // Enable resources/list
        prompts: {},    // Enable prompts/list
      },
    }
  );
  
  // Create SAP client
  const sapClient = await createSapClient(config);
  logger.info('SAP client created', { programId: config.programId });

  // Resolve signer based on mode
  const signer = await resolveSigner(config);
  logger.info('Signer resolved', { mode: signer?.mode ?? 'none' });
  
  // Create policy engine
  const policyEngine = new PolicyEngine(config);
  logger.info('Policy engine initialized');
  
  // Create shared context
  const context: SapMcpContext = {
    config,
    connection: sapClient.connection,
    sapClient,
    signer: signer.signer,
    policyEngine,
    session: undefined, // Will be set per-session if using delegated mode
    logger,
  };

  setToolExecutionContext(server, context);

  // Register all capabilities (tools, resources, prompts)
  await registerCapabilities(server, context);
  logger.info('Server capabilities registered');
  
  return server;
}
