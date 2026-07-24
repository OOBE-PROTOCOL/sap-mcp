/**
 * @name transports/stdio
 * @description stdio transport for local MCP clients (Claude Desktop, Codex, Cursor, Windsurf, etc.).
 *
 * @flow
 *   1. Creates a `StdioServerTransport` from the MCP SDK.
 *   2. Connects the transport to the server, which starts handling JSON-RPC requests immediately.
 *   3. Registers SIGINT/SIGTERM handlers for graceful shutdown.
 *
 * @module transports/stdio
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../core/logger.js';

/**
 * @name startStdioTransport
 * @description Starts the MCP server with a stdio transport for local client communication.
 *
 * CRITICAL: All capabilities (tools, resources, prompts) MUST be registered BEFORE
 * calling this function. The transport starts handling requests immediately.
 *
 * @param server — The configured MCP `Server` instance with all capabilities registered.
 * @throws If the transport connection fails.
 *
 * @usedBy CLI entry point for local MCP server mode.
 */
export async function startStdioTransport(
  server: Server,
): Promise<void> {
  logger.info('Starting stdio transport');
  
  const transport = new StdioServerTransport();
  
  // Connect transport - this starts handling JSON-RPC requests immediately
  await server.connect(transport);
  
  logger.info('stdio transport started successfully');
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down stdio transport...');
    await server.close();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.info('Shutting down stdio transport...');
    await server.close();
    process.exit(0);
  });
}