/**
 * @name server/create-server
 * @description Creates and configures the MCP server instance with all SAP Protocol capabilities.
 *
 * @flow
 *   1. Constructs an MCP `Server` with tools, resources, and prompts capabilities declared upfront.
 *   2. Creates a SAP client via `createSapClient` for on-chain interaction.
 *   3. Resolves the transaction signer via `resolveSigner` based on configured mode.
 *   4. Initializes the `PolicyEngine` for permission and spending enforcement.
 *   5. Assembles the shared `SapMcpContext` and registers all capabilities via `registerCapabilities`.
 *
 * @module server/create-server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../core/logger.js';
import {
  MCP_SERVER_DESCRIPTION,
  MCP_SERVER_ICON_URL,
  MCP_SERVER_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_TITLE,
  MCP_SERVER_VERSION,
  MCP_SERVER_WEBSITE_URL,
} from '../core/constants.js';
import type { SapMcpConfig, SapMcpContext } from '../core/types.js';
import { createSapClient } from '../sap/sap-client-manager.js';
import { resolveSigner } from '../signer/signer-resolver.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { registerCapabilities } from './register-capabilities.js';
import { setToolExecutionContext } from '../adapters/mcp/sdk-compat.js';

/**
 * @name createSapMcpServer
 * @description Creates and configures the SAP MCP server with all capabilities registered.
 *
 * @param config — SAP MCP configuration object with RPC URL, program ID, mode, and signer settings.
 * @returns A configured MCP `Server` instance ready to connect to a transport.
 * @throws If SAP client creation or signer resolution fails.
 *
 * @usedBy `server/index.ts`, transport entry points (`stdio.ts`, `http.ts`).
 */
export async function createSapMcpServer(config: SapMcpConfig): Promise<Server> {
  logger.debug('Creating SAP MCP Server', { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
  
  // Create MCP server with ALL capabilities declared upfront
  // This is REQUIRED for MCP SDK v1.0.0 - capabilities must be declared in constructor
  const server = new Server(
    {
      name: MCP_SERVER_NAME,
      title: MCP_SERVER_TITLE,
      version: MCP_SERVER_VERSION,
      description: MCP_SERVER_DESCRIPTION,
      websiteUrl: MCP_SERVER_WEBSITE_URL,
      icons: [
        {
          src: MCP_SERVER_ICON_URL,
          mimeType: 'image/png',
          sizes: ['512x512'],
        },
      ],
    },
    {
      // Declare all capabilities upfront
      capabilities: {
        tools: {},      // Enable tools/list
        resources: {},  // Enable resources/list
        prompts: {},    // Enable prompts/list
      },
      instructions: MCP_SERVER_INSTRUCTIONS,
    }
  );
  
  // Create SAP client
  const sapClient = await createSapClient(config);
  logger.debug('SAP client created', { programId: config.programId });
  
  // Resolve signer based on mode
  const signer = await resolveSigner(config);
  logger.debug('Signer resolved', { mode: signer?.mode ?? 'none' });
  
  // Create policy engine
  const policyEngine = new PolicyEngine(config);
  logger.debug('Policy engine initialized');
  
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
  logger.debug('Server capabilities registered');
  
  return server;
}