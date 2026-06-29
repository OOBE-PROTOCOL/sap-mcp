/**
 * stdio transport for local MCP clients
 * 
 * Used by Claude Desktop, Codex, Cursor, Windsurf, etc.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../core/logger.js';

/**
 * Start the MCP server with stdio transport
 * 
 * CRITICAL: All capabilities (tools, resources, prompts) MUST be registered
 * BEFORE calling this function. The transport starts handling requests immediately.
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
